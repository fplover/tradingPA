// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { AVWAP } from '@/indicators/builtin/avwap';
import { ALL_INDICATORS, getIndicatorDef } from '@/indicators/registry';
import { IndicatorInstance } from '@/indicators/core/instance';
import { VWAP } from '@/indicators/builtin/volume';
import { AnchorDropState } from '@/engine/drawing/anchorDrop';
import { createMockCtx, asCtx, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';

/**
 * P2-B Anchored VWAP 单测（AC-B3）：
 * - avwap 计算金标准：与内置 VWAP 同源（anchorTime ≤ 首 bar 时完全一致）；
 *   中段锚点：锚前断线、锚后累计；零量 bar 输出 undefined
 * - AnchorDropState：锚定落点状态机（begin/drop/cancel）
 * - ChartController：addIndicator 进入选 bar 模式 → 点击落点写锚点；
 *   改色不丢锚（updateIndicator 保持）；已带锚点添加不劫持点击
 */

function ramp(n: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 1; i <= n; i++) {
    bars.push({ time: i * 60_000, open: i, high: i + 1, low: i - 1, close: i, volume: 100 });
  }
  return bars;
}

function computeAvwap(bars: Bar[], params: Record<string, number | string | boolean>) {
  return new IndicatorInstance(AVWAP, { params }).computeWindow(bars, 0, bars.length - 1).outputs;
}

// ---------- 指标定义 ----------

describe('AVWAP 指标定义', () => {
  it('注册表可查、overlay 主图、锚点与颜色两参数', () => {
    const def = getIndicatorDef('avwap');
    expect(def).toBe(AVWAP);
    expect(def!.overlay).toBe(true);
    expect(def!.params.map((p) => p.key)).toEqual(['anchorTime', 'color']);
    expect(ALL_INDICATORS.filter((d) => d.id === 'avwap')).toHaveLength(1);
    expect(ALL_INDICATORS.length).toBeGreaterThanOrEqual(31);
  });
});

// ---------- 计算金标准 ----------

describe('AVWAP 计算金标准（与内置 VWAP 同源）', () => {
  const bars = ramp(10);

  it('anchorTime ≤ 首 bar：与内置 VWAP 完全一致', () => {
    const avwap = computeAvwap(bars, { anchorTime: 0, color: '#ff9800' }).avwap;
    const vwap = new IndicatorInstance(VWAP).computeWindow(bars, 0, bars.length - 1).outputs.vwap;
    expect(avwap).toEqual(vwap);
    // 等量时 VWAP = 均价 = (1+...+10)/10 = 5.5
    expect(avwap![9]).toBeCloseTo(5.5, 10);
  });

  it('中段锚点：锚前 undefined（断线），锚后自锚点累计', () => {
    const out = computeAvwap(bars, { anchorTime: 3 * 60_000, color: '#ff9800' }).avwap;
    expect(out).toHaveLength(10);
    expect(out![0]).toBeUndefined(); // t=60000 < 锚点
    expect(out![1]).toBeUndefined(); // t=120000 < 锚点
    expect(out![2]).toBeCloseTo(3, 10); // 锚点 bar：tp=3
    expect(out![3]).toBeCloseTo(3.5, 10); // (3+4)/2
    expect(out![9]).toBeCloseTo(6.5, 10); // (3+...+10)/8 = 52/8
  });

  it('锚点在全部 bar 之后：全断线', () => {
    const out = computeAvwap(bars, { anchorTime: 99 * 60_000, color: '#ff9800' }).avwap;
    expect(out!.every((v) => v === undefined)).toBe(true);
  });

  it('零量锚点 bar 输出 undefined，其后恢复累计', () => {
    const withZero: Bar[] = bars.map((b, i) => (i === 2 ? { ...b, volume: 0 } : b));
    const out = computeAvwap(withZero, { anchorTime: 3 * 60_000, color: '#ff9800' }).avwap;
    expect(out![2]).toBeUndefined(); // 锚点 bar 零量
    expect(out![3]).toBeCloseTo(4, 10); // 量从下一根累计
  });

  it('实时 bar 追加：末值随新 bar 更新（窗口脏缓存自动失效）', () => {
    const before = computeAvwap(bars, { anchorTime: 3 * 60_000, color: '#ff9800' }).avwap![9];
    const extended = [...bars, { time: 11 * 60_000, open: 11, high: 12, low: 10, close: 11, volume: 100 }];
    const after = computeAvwap(extended, { anchorTime: 3 * 60_000, color: '#ff9800' }).avwap;
    expect(after).toHaveLength(11);
    expect(after![10]).not.toBe(before); // 新 bar 改变累计量权
    expect(after![10]).toBeCloseTo((52 + 11) / 9, 10); // (3+...+11)/9
  });
});

// ---------- AnchorDropState 状态机 ----------

describe('AnchorDropState（AVWAP 锚定落点状态机）', () => {
  it('begin → drop：放置回调收到 uid 与 bar 时间，状态清空', () => {
    const st = new AnchorDropState();
    const seen: Array<[string, number]> = [];
    st.begin('ind_1', (uid, t) => seen.push([uid, t]));
    expect(st.active).toBe(true);
    expect(st.drop(12345)).toBe(true);
    expect(seen).toEqual([['ind_1', 12345]]);
    expect(st.active).toBe(false);
    expect(st.drop(999)).toBe(false); // 不重复放置
  });

  it('cancel：清空不放置', () => {
    const st = new AnchorDropState();
    let called = 0;
    st.begin('ind_1', () => called++);
    st.cancel();
    expect(st.active).toBe(false);
    expect(st.drop(1)).toBe(false);
    expect(called).toBe(0);
  });

  it('重复 begin：最新目标覆盖旧目标', () => {
    const st = new AnchorDropState();
    const seen: string[] = [];
    st.begin('old', (uid) => seen.push(uid));
    st.begin('new', (uid) => seen.push(uid));
    expect(st.drop(1)).toBe(true);
    expect(seen).toEqual(['new']);
  });
});

// ---------- ChartController：锚定落点集成 ----------

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

function makeBars(n = 600): Bar[] {
  const out: Bar[] = [];
  let price = 30_000;
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(0.01, open + (rand() - 0.5) * open * 0.004);
    const high = Math.max(open, close) + rand() * open * 0.003;
    const low = Math.min(open, close) - rand() * open * 0.003;
    out.push({ time: T0 + i * IV, open, high, low, close, volume: 100 + rand() * 900 });
    price = close;
  }
  return out;
}

const CANVAS_W = 1280;
const CANVAS_H = 800;

let canvas: HTMLCanvasElement;

beforeEach(() => {
  document.body.innerHTML = '';
  const mock: MockCtx = createMockCtx();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => asCtx(mock)) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: CANVAS_W, bottom: CANVAS_H, width: CANVAS_W, height: CANVAS_H, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRenderer(): ChartRenderer {
  const r = new ChartRenderer(canvas, makeBars(), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw();
  return r;
}

function ptr(type: string, x: number, y: number): void {
  canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true }));
}

function click(x: number, y: number): void {
  ptr('pointerdown', x, y);
  ptr('pointerup', x, y);
}

describe('ChartController：AVWAP 锚定落点（AC-B3）', () => {
  it('无锚点添加 → 进入选 bar 模式；点击落点写为锚定 bar 时间', () => {
    const r = makeRenderer();
    r.addIndicator('avwap');
    click(400, 300); // 落点 = 锚定 bar
    const info = r.listIndicators().find((i) => i.id === 'avwap')!;
    expect(info.params.anchorTime).toBeGreaterThan(0);
    // 锚点必须是某根真实 bar 的时间
    expect(r.getBars().some((b) => b.time === info.params.anchorTime)).toBe(true);
  });

  it('锚定后模式退出：后续点击不再被消费（画线可正常放置）', () => {
    const r = makeRenderer();
    r.addIndicator('avwap');
    click(400, 300); // 锚定
    r.setActiveTool('trendline');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    expect(r.listDrawings()).toHaveLength(1); // 落点未被锚定模式吞掉
    expect(r.listDrawings()[0].type).toBe('trendline');
  });

  it('已带锚点添加：不进入选 bar 模式（画线立即可用）', () => {
    const r = makeRenderer();
    r.setActiveTool('trendline');
    r.addIndicator('avwap', { params: { anchorTime: T0 + 10 * IV, color: '#ff9800' } });
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    expect(r.listDrawings()).toHaveLength(1); // 未被劫持
    const info = r.listIndicators().find((i) => i.id === 'avwap')!;
    expect(info.params.anchorTime).toBe(T0 + 10 * IV); // 传入锚点原样保留
  });

  it('改色不丢锚：updateIndicator 无 anchorTime 时沿用实例当前值', () => {
    const r = makeRenderer();
    r.addIndicator('avwap');
    click(400, 300);
    const info0 = r.listIndicators().find((i) => i.id === 'avwap')!;
    const anchor = info0.params.anchorTime;
    const uid = r.listIndicators().find((i) => i.id === 'avwap')!.uid;
    r.updateIndicator(uid, { params: { color: '#ff0000' } }); // store 侧改色（不含锚点）
    const info1 = r.listIndicators().find((i) => i.id === 'avwap')!;
    expect(info1.params.anchorTime).toBe(anchor); // 锚点保持
    expect(info1.params.color).toBe('#ff0000');
  });

  it('实时 bar 更新不扰动锚点与实例', () => {
    const r = makeRenderer();
    r.addIndicator('avwap');
    click(400, 300);
    const anchor = r.listIndicators().find((i) => i.id === 'avwap')!.params.anchorTime;
    const last = r.getBars()[r.getBars().length - 1];
    r.updateBar({ ...last, close: last.close * 1.01, volume: last.volume + 10 });
    const info = r.listIndicators().find((i) => i.id === 'avwap')!;
    expect(info.params.anchorTime).toBe(anchor);
    expect(r.listIndicators().filter((i) => i.id === 'avwap')).toHaveLength(1);
  });

  it('Esc 取消锚定落点：退出选 bar 模式且不写锚点', () => {
    const r = makeRenderer();
    r.addIndicator('avwap');
    r.cancelPlacing(); // Esc
    const info = r.listIndicators().find((i) => i.id === 'avwap')!;
    expect(info.params.anchorTime).toBe(0); // 未写锚点（默认 0 = 自首 bar）
  });
});
