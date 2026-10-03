import { describe, expect, it, afterEach } from 'vitest';
import {
  describeAlert,
  describeSource,
  evaluateCondition,
  parseAlertsPayload,
  runAlertCheck,
  sampleKey,
  sourceKeyOf,
  type AlertSample,
  type PriceAlert,
} from '@/features/alerts/alertLogic';
import {
  currentDrawings,
  currentHlines,
  hlinePrices,
  lineThresholdSyncs,
  notifyDrawingsChanged,
  setDrawingsGetter,
  subscribeDrawings,
} from '@/features/alerts/useAlertWatcher';
import { serializeDrawings, type Drawing } from '@/engine/drawing/types';

/** 画线水平线警报（P2-D②，AC-D2）：源键/描述、持久化、触发纯函数、阈值同步、面板源列表 */

const NOW = 1_700_000_000_000;
const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();

afterEach(() => {
  setDrawingsGetter(null);
});

function hline(id: string, price: number, visible = true): Drawing {
  return {
    id,
    type: 'hline',
    points: [{ time: T0, price }],
    style: { color: '#ef5350', lineWidth: 1 },
    locked: false,
    visible,
  };
}

function lineAlert(patch: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: 'a1',
    symbol: 'BTCUSDT',
    source: { type: 'line', drawingId: 'h1' },
    threshold: 100,
    condition: 'crossUp',
    active: true,
    triggered: false,
    createdAt: NOW - 1000,
    frequency: 'once',
    cooldownMs: 30_000,
    ...patch,
  };
}

const s = (key: string, value: number): AlertSample => ({ key, value });
const LINE_KEY = sampleKey('BTCUSDT', { type: 'line', drawingId: 'h1' });

// ---------- 源键 / 描述 / 序列化 ----------

describe('line 源键与描述', () => {
  it('sourceKeyOf / sampleKey 带 drawingId 命名空间', () => {
    expect(sourceKeyOf({ type: 'line', drawingId: 'h1' })).toBe('line:h1');
    expect(sampleKey('BTCUSDT', { type: 'line', drawingId: 'h1' })).toBe('BTCUSDT:line:h1');
  });

  it('describeSource / describeAlert：走数值阈值路径（与 pine 布尔路径互斥）', () => {
    expect(describeSource({ type: 'line', drawingId: 'h1' })).toBe('画线水平线');
    expect(describeAlert(lineAlert({ threshold: 68000.5 }))).toBe('BTCUSDT 画线水平线 上穿 68000.5');
  });
});

describe('parseAlertsPayload：line 源持久化', () => {
  it('v2 载荷 round-trip 保留 line 源与 drawingId', () => {
    const payload = parseAlertsPayload(JSON.stringify({ version: 2, soundEnabled: true, alerts: [lineAlert()] }));
    expect(payload.alerts).toHaveLength(1);
    expect(payload.alerts[0].source).toEqual({ type: 'line', drawingId: 'h1' });
    expect(payload.alerts[0].threshold).toBe(100);
  });

  it('line 源缺 drawingId → 条目丢弃（与 pine 分支同口径）', () => {
    const bad = { ...lineAlert(), source: { type: 'line' } };
    const payload = parseAlertsPayload(JSON.stringify({ version: 2, alerts: [bad] }));
    expect(payload.alerts).toHaveLength(0);
  });

  it('v1 旧快照迁移不受影响（仍为 price 源）', () => {
    const payload = parseAlertsPayload(
      JSON.stringify([{ id: 'old', symbol: 'BTCUSDT', price: 123.5, direction: 'above', createdAt: 1 }]),
    );
    expect(payload.alerts[0].source).toEqual({ type: 'price' });
  });
});

// ---------- 触发纯函数 ----------

describe('runAlertCheck：line 源触发', () => {
  it('价格自上而下穿越水平线阈值触发；once 触发后停用', () => {
    const r1 = runAlertCheck([lineAlert()], 'BTCUSDT', [s(LINE_KEY, 101)], {}, NOW);
    expect(r1.fired).toHaveLength(0); // 首轮仅记录采样
    const r2 = runAlertCheck([lineAlert()], 'BTCUSDT', [s(LINE_KEY, 99)], r1.lastSeen, NOW + 1000);
    expect(r2.fired).toHaveLength(0); // 未穿越
    const r3 = runAlertCheck([lineAlert()], 'BTCUSDT', [s(LINE_KEY, 101)], r2.lastSeen, NOW + 2000);
    expect(r3.fired).toHaveLength(1);
    expect(r3.fired[0].value).toBe(101);
    expect(r3.alerts[0]).toMatchObject({ active: false, triggered: true });
  });

  it('every 模式受冷却约束可重复触发', () => {
    const alert = lineAlert({ frequency: 'every', cooldownMs: 30_000 });
    const r1 = runAlertCheck([alert], 'BTCUSDT', [s(LINE_KEY, 99)], {}, NOW); // 记录 99
    const r2 = runAlertCheck([r1.alerts[0]], 'BTCUSDT', [s(LINE_KEY, 101)], r1.lastSeen, NOW + 1000); // 上穿 → 触发
    expect(r2.fired).toHaveLength(1);
    const after2 = r2.alerts[0]; // lastFiredAt = NOW+1000
    const r3 = runAlertCheck([after2], 'BTCUSDT', [s(LINE_KEY, 99)], r2.lastSeen, NOW + 5000); // 回落（冷却期内）
    expect(r3.fired).toHaveLength(0);
    const r4 = runAlertCheck([after2], 'BTCUSDT', [s(LINE_KEY, 101)], r3.lastSeen, NOW + 31_000); // 再上穿且冷却期满
    expect(r4.fired).toHaveLength(1);
  });

  it('无采样（水平线已删 → 停采）不触发', () => {
    const res = runAlertCheck([lineAlert()], 'BTCUSDT', [], {}, NOW);
    expect(res.fired).toHaveLength(0);
  });

  it('greater/less 判定与 price 源同构（阈值一侧即触发）', () => {
    expect(evaluateCondition('greater', 100, 100, undefined)).toBe(true);
    const res = runAlertCheck([lineAlert({ condition: 'greater' })], 'BTCUSDT', [s(LINE_KEY, 100)], {}, NOW);
    expect(res.fired).toHaveLength(1);
  });
});

// ---------- 水平线提取与阈值同步 ----------

describe('hlinePrices / lineThresholdSyncs', () => {
  it('只取可见水平线，跳过其它类型/隐藏/非法价', () => {
    const drawings: Drawing[] = [
      hline('h1', 100),
      hline('h2', 200, false),
      hline('h3', 0),
      { ...hline('h4', 300), type: 'trendline' },
    ];
    const levels = hlinePrices(drawings);
    expect([...levels]).toEqual([['h1', 100]]);
  });

  it('阈值跟随水平线当前价：拖动 → 同步计划；未动 → 无计划', () => {
    const levels = new Map([['h1', 120]]);
    expect(lineThresholdSyncs([lineAlert()], levels)).toEqual([{ id: 'a1', threshold: 120 }]);
    expect(lineThresholdSyncs([lineAlert({ threshold: 120 })], levels)).toEqual([]);
  });

  it('水平线已删 → 不同步（采样侧停采，警报保留不触发）', () => {
    expect(lineThresholdSyncs([lineAlert()], new Map())).toEqual([]);
  });

  it('非 line 源不参与同步', () => {
    const priceAlert = lineAlert({ source: { type: 'price' } });
    expect(lineThresholdSyncs([priceAlert], new Map([['h1', 120]]))).toEqual([]);
  });
});

// ---------- 画线数据桥（AlertPanel 源列表组装） ----------

describe('画线数据桥', () => {
  it('登记 getter 后：currentDrawings / currentHlines 组装源列表', () => {
    const raw = serializeDrawings([hline('h1', 100), hline('h2', 250.5), { ...hline('h3', 9), type: 'vline' }]);
    setDrawingsGetter(() => raw);
    expect(currentDrawings()).toHaveLength(3);
    expect(currentHlines()).toEqual([
      { id: 'h1', price: 100 },
      { id: 'h2', price: 250.5 },
    ]);
  });

  it('快照引用稳定（序列化串未变时返回同一引用，防 useSyncExternalStore 渲染循环）', () => {
    const raw = serializeDrawings([hline('h1', 100)]);
    setDrawingsGetter(() => raw);
    expect(currentHlines()).toBe(currentHlines());
  });

  it('序列化串变化（新建/拖动水平线）→ 快照刷新', () => {
    let raw = serializeDrawings([hline('h1', 100)]);
    setDrawingsGetter(() => raw);
    expect(currentHlines()).toEqual([{ id: 'h1', price: 100 }]);
    raw = serializeDrawings([hline('h1', 100), hline('h2', 130)]);
    expect(currentHlines()).toEqual([
      { id: 'h1', price: 100 },
      { id: 'h2', price: 130 },
    ]);
  });

  it('getter 摘除 / 返回 null → 空列表；变更广播通知订阅者', () => {
    const raw = serializeDrawings([hline('h1', 100)]);
    setDrawingsGetter(() => raw);
    let notified = 0;
    const off = subscribeDrawings(() => {
      notified += 1;
    });
    notifyDrawingsChanged();
    expect(notified).toBe(1);
    off();
    notifyDrawingsChanged();
    expect(notified).toBe(1);
    setDrawingsGetter(null);
    expect(currentHlines()).toEqual([]);
    expect(currentDrawings()).toEqual([]);
  });
});
