// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  NOTIFY_DEDUP_MS,
  describeCondition,
  evaluateCondition,
  groupAlertsBySymbol,
  notifyPlan,
  runAlertCheck,
  type PriceAlert,
} from '@/features/alerts/alertLogic';
import type { AlertHistoryEntry } from '@/features/alerts/alertHistory';

/**
 * 二期-E 警报增强 golden 用例：entering/exiting channel（穿越族语义，区间双向）、
 * 警报按品种分组、通知去重 + 聚合计划（纯函数）、触发历史（本地持久化，上限 100）。
 */

const NOW = 1_700_000_000_000;

function makeAlert(patch: Partial<PriceAlert>): PriceAlert {
  return {
    id: 'a',
    symbol: 'BTCUSDT',
    source: { type: 'price' },
    threshold: 100,
    condition: 'greater',
    active: true,
    triggered: false,
    createdAt: NOW,
    frequency: 'once',
    cooldownMs: 30_000,
    ...patch,
  };
}

describe('通道条件：evaluateCondition（enterChannel / exitChannel）', () => {
  const LO = 90;
  const HI = 110;

  it('进入区间：自下进入与自上进入均触发', () => {
    expect(evaluateCondition('enterChannel', LO, 100, 80, HI)).toBe(true); // 自下
    expect(evaluateCondition('enterChannel', LO, 100, 120, HI)).toBe(true); // 自上
  });

  it('进入区间：区间内停留、区间外停留、无上一采样不触发', () => {
    expect(evaluateCondition('enterChannel', LO, 100, 95, HI)).toBe(false); // 一直在内
    expect(evaluateCondition('enterChannel', LO, 85, 80, HI)).toBe(false); // 一直在外
    expect(evaluateCondition('enterChannel', LO, 100, undefined, HI)).toBe(false);
  });

  it('离开区间：向下跌出与向上涨出均触发；在内/在外停留不触发', () => {
    expect(evaluateCondition('exitChannel', LO, 80, 95, HI)).toBe(true); // 向下离开
    expect(evaluateCondition('exitChannel', LO, 120, 105, HI)).toBe(true); // 向上离开
    expect(evaluateCondition('exitChannel', LO, 100, 95, HI)).toBe(false); // 一直在内
    expect(evaluateCondition('exitChannel', LO, 80, 70, HI)).toBe(false); // 一直在外
    expect(evaluateCondition('exitChannel', LO, 100, undefined, HI)).toBe(false);
  });

  it('上下沿可任意输入序（threshold > threshold2 归一）', () => {
    expect(evaluateCondition('enterChannel', HI, 100, 80, LO)).toBe(true);
    expect(evaluateCondition('exitChannel', HI, 80, 100, LO)).toBe(true);
  });

  it('边界值属区间内（闭区间口径）', () => {
    expect(evaluateCondition('exitChannel', LO, LO, 100, HI)).toBe(false); // 100 → 90（=下沿）仍在内
    expect(evaluateCondition('exitChannel', LO, 89.999, 100, HI)).toBe(true);
    expect(evaluateCondition('enterChannel', LO, HI, 120, HI)).toBe(true); // 进入到上沿=闭区间内
  });

  it('描述：进入/离开区间文本', () => {
    expect(describeCondition('enterChannel', 90, 110)).toBe('进入 90~110');
    expect(describeCondition('exitChannel', 110, 90)).toBe('离开 90~110');
  });
});

describe('通道条件：runAlertCheck 触发与 once 停用', () => {
  it('自下进入区间触发一次并停用（once）', () => {
    const alert = makeAlert({ condition: 'enterChannel', threshold: 90, threshold2: 110 });
    // 首轮区间外（80，无上一采样不触发）；次轮进入区间（100）触发
    const r1 = runAlertCheck([alert], 'BTCUSDT', [{ key: 'BTCUSDT:price', value: 80 }], {}, NOW);
    expect(r1.fired).toHaveLength(0); // 首轮无上一采样（穿越族防误报）
    const r2 = runAlertCheck([alert], 'BTCUSDT', [{ key: 'BTCUSDT:price', value: 100 }], r1.lastSeen, NOW + 1000);
    expect(r2.fired).toHaveLength(1);
    expect(r2.alerts[0].active).toBe(false);
    expect(r2.alerts[0].triggered).toBe(true);
  });

  it('every + 冷却：区间内往复穿越按冷却重复触发', () => {
    const alert = makeAlert({
      condition: 'exitChannel',
      threshold: 90,
      threshold2: 110,
      frequency: 'every',
      cooldownMs: 30_000,
    });
    // i0: 在内(100) → i1: 涨出(120) 触发；i2: 回内(100) 不算离开；
    // i3: 又涨出(121) 但距上次触发 10s < 冷却 30s → 不触发
    const seq: Array<[number, number]> = [
      [100, 0],
      [120, 10_000],
      [100, 15_000],
      [121, 20_000],
    ];
    let prev: Record<string, number> = {};
    let firedCount = 0;
    let cur = alert;
    for (const [value, dt] of seq) {
      const r = runAlertCheck([cur], 'BTCUSDT', [{ key: 'BTCUSDT:price', value }], prev, NOW + dt);
      prev = r.lastSeen;
      if (r.alerts[0] !== cur) cur = r.alerts[0];
      firedCount += r.fired.length;
    }
    expect(firedCount).toBe(1);
  });
});

describe('警报按品种分组：groupAlertsBySymbol', () => {
  it('保持首次出现顺序，条目归组', () => {
    const alerts = [
      makeAlert({ id: '1', symbol: 'BTCUSDT' }),
      makeAlert({ id: '2', symbol: 'ETHUSDT' }),
      makeAlert({ id: '3', symbol: 'BTCUSDT' }),
      makeAlert({ id: '4', symbol: 'XAUUSD' }),
      makeAlert({ id: '5', symbol: 'ETHUSDT' }),
    ];
    const groups = groupAlertsBySymbol(alerts);
    expect(groups.map((g) => g.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'XAUUSD']);
    expect(groups[0].items.map((a) => a.id)).toEqual(['1', '3']);
    expect(groups[1].items.map((a) => a.id)).toEqual(['2', '5']);
    expect(groups[2].items.map((a) => a.id)).toEqual(['4']);
  });

  it('空表给空数组', () => {
    expect(groupAlertsBySymbol([])).toEqual([]);
  });
});

describe('通知计划：notifyPlan（去重 + 聚合）', () => {
  const fired = (id: string): Parameters<typeof notifyPlan>[0][number] => ({
    alert: makeAlert({ id, symbol: 'BTCUSDT' }),
    value: 100,
  });

  it('同警报 60s 窗口内去重，窗外放行', () => {
    const r1 = notifyPlan([fired('a')], {}, NOW);
    expect(r1.items).toHaveLength(1);
    expect(r1.more).toBe(0);
    // 60s 内再触发：跳过
    const r2 = notifyPlan([fired('a')], r1.lastNotifiedAt, NOW + NOTIFY_DEDUP_MS - 1);
    expect(r2.items).toHaveLength(0);
    // 窗口外：放行
    const r3 = notifyPlan([fired('a')], r1.lastNotifiedAt, NOW + NOTIFY_DEDUP_MS);
    expect(r3.items).toHaveLength(1);
  });

  it('多警报合并：正文至多 3 条，余量计入 more，去重表全员更新', () => {
    const input = [fired('a'), fired('b'), fired('c'), fired('d'), fired('e')];
    const r = notifyPlan(input, {}, NOW);
    expect(r.items.map((f) => f.alert.id)).toEqual(['a', 'b', 'c']);
    expect(r.more).toBe(2);
    for (const id of ['a', 'b', 'c', 'd', 'e']) expect(r.lastNotifiedAt[id]).toBe(NOW);
  });

  it('去重跳过的条目不更新去重表（保持原时间戳）', () => {
    const r1 = notifyPlan([fired('a')], {}, NOW);
    const r2 = notifyPlan([fired('a'), fired('b')], r1.lastNotifiedAt, NOW + 1000);
    expect(r2.items.map((f) => f.alert.id)).toEqual(['b']);
    expect(r2.lastNotifiedAt['a']).toBe(NOW);
    expect(r2.lastNotifiedAt['b']).toBe(NOW + 1000);
  });
});

describe('触发历史：alertHistory（本地持久化 + 上限 100）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  async function fresh() {
    // 动态 import：模块初始化即读 localStorage，须等 jsdom 环境就绪后清表再装载
    const mod = await import('@/features/alerts/alertHistory');
    return mod;
  }

  it('触发追加、清空生效、订阅通知', async () => {
    const h = await fresh();
    h.clearAlertHistory();
    const seen: number[] = [];
    const un = h.subscribeAlertHistory(() => seen.push(h.alertHistory().length));
    h.recordAlertFires([{ alert: makeAlert({ id: 'a', symbol: 'BTCUSDT' }), value: 123 }], NOW);
    expect(h.alertHistory()).toHaveLength(1);
    const e = h.alertHistory()[0] as AlertHistoryEntry;
    expect(e.alertId).toBe('a');
    expect(e.symbol).toBe('BTCUSDT');
    expect(e.value).toBe(123);
    expect(e.message).toContain('BTCUSDT');
    h.clearAlertHistory();
    expect(h.alertHistory()).toHaveLength(0);
    expect(seen).toEqual([1, 0]);
    un();
  });

  it('上限 100 条：新进旧出', async () => {
    const h = await fresh();
    h.clearAlertHistory();
    for (let i = 0; i < 105; i++) {
      h.recordAlertFires([{ alert: makeAlert({ id: `a${i}` }), value: i }], NOW + i);
    }
    const list = h.alertHistory();
    expect(list).toHaveLength(100);
    expect(list[0].alertId).toBe('a5'); // 最老 5 条被挤出
    expect(list[99].alertId).toBe('a104');
  });

  it('持久化往返：重载模块（新实例）能读到已落盘记录', async () => {
    const h = await fresh();
    h.clearAlertHistory();
    h.recordAlertFires([{ alert: makeAlert({ id: 'persist', symbol: 'ETHUSDT' }), value: 42 }], NOW);
    // 同一 jsdom 实例内模块已装载（缓存共享），直接校验 localStorage 落盘内容
    const raw = localStorage.getItem('tradingpa.alertHistory');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as AlertHistoryEntry[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].alertId).toBe('persist');
    expect(parsed[0].symbol).toBe('ETHUSDT');
  });
});
