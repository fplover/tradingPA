// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { useIndicatorStore } from '@/store/indicatorStore';
import { createMockCtx, asCtx, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';

/**
 * P2-D 遗留③：AVWAP 锚点持久化单测。
 * - indicatorStore.setAnchorTime：写回 / 同值短路 / 合并既有参数
 * - ChartController.setIndicatorParamsCallback：落锚后经回调把 anchorTime 送出；
 *   store→engine 再下发（useChartCommands 路径）不回环（相等值不触发再次写回）
 * - renderer 重建（同会话）：store params 带锚点添加 → 实例锚点恢复且不劫持点击
 */

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

// ---------- store：setAnchorTime ----------

describe('indicatorStore.setAnchorTime：锚点写回', () => {
  beforeEach(() => {
    useIndicatorStore.setState({ active: [{ id: 'vol', params: {} }] });
  });

  it('写入 anchorTime 并与既有参数合并', () => {
    useIndicatorStore.setState({ active: [{ id: 'avwap', params: { color: '#ff9800' } }] });
    useIndicatorStore.getState().setAnchorTime('avwap', T0 + 5 * IV);
    const entry = useIndicatorStore.getState().active.find((a) => a.id === 'avwap')!;
    expect(entry.params).toEqual({ color: '#ff9800', anchorTime: T0 + 5 * IV });
  });

  it('同值短路：已是该锚点 → state 引用不变（不触发 useChartCommands 重复下发）', () => {
    useIndicatorStore.setState({ active: [{ id: 'avwap', params: { anchorTime: T0 } }] });
    const before = useIndicatorStore.getState().active;
    useIndicatorStore.getState().setAnchorTime('avwap', T0);
    expect(useIndicatorStore.getState().active).toBe(before);
  });

  it('不同值才更新；目标不存在为无操作', () => {
    useIndicatorStore.setState({ active: [{ id: 'avwap', params: { anchorTime: T0 } }] });
    const before = useIndicatorStore.getState().active;
    useIndicatorStore.getState().setAnchorTime('avwap', T0 + IV);
    expect(useIndicatorStore.getState().active).not.toBe(before);
    expect(useIndicatorStore.getState().active[0].params.anchorTime).toBe(T0 + IV);

    const now = useIndicatorStore.getState().active;
    useIndicatorStore.getState().setAnchorTime('vwap', 123); // 目标不存在
    expect(useIndicatorStore.getState().active).toBe(now);
  });

  it('updateParams 改色不冲掉 anchorTime（合并语义）', () => {
    useIndicatorStore.setState({ active: [{ id: 'avwap', params: { anchorTime: T0 } }] });
    useIndicatorStore.getState().updateParams('avwap', { color: '#ff0000' });
    expect(useIndicatorStore.getState().active[0].params).toEqual({ anchorTime: T0, color: '#ff0000' });
  });
});

// ---------- ChartController：engine → store 回调 ----------

const CANVAS_W = 1280;
const CANVAS_H = 800;

let canvas: HTMLCanvasElement;

beforeEach(() => {
  document.body.innerHTML = '';
  useIndicatorStore.setState({ active: [{ id: 'vol', params: {} }] });
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

describe('ChartController：AVWAP 锚点写回（engine → store）', () => {
  it('无锚点添加 → 落点后经回调送出 anchorTime（实例与回调同值）', () => {
    const r = makeRenderer();
    const writes: Array<[string, number]> = [];
    r.setIndicatorParamsCallback((uid, params) => {
      if (typeof params.anchorTime === 'number') writes.push([uid, params.anchorTime]);
    });
    r.addIndicator('avwap');
    click(400, 300); // 选 bar 模式落点
    expect(writes).toHaveLength(1);
    const uid = r.listIndicators().find((i) => i.id === 'avwap')!.uid;
    expect(writes[0][0]).toBe(uid);
    const info = r.listIndicators().find((i) => i.id === 'avwap')!;
    expect(writes[0][1]).toBe(info.params.anchorTime); // 实例源与写回同值
  });

  it('store→engine→store 不回环：再下发同值 options 不触发再次写回', () => {
    const r = makeRenderer();
    const writes: Array<[string, number]> = [];
    r.setIndicatorParamsCallback((uid, params) => {
      if (typeof params.anchorTime === 'number') writes.push([uid, params.anchorTime]);
    });
    r.addIndicator('avwap');
    click(400, 300);
    expect(writes).toHaveLength(1);
    const uid = r.listIndicators().find((i) => i.id === 'avwap')!.uid;
    const anchor = r.listIndicators().find((i) => i.id === 'avwap')!.params.anchorTime;
    // 模拟 useChartCommands 的 store 变更下发（store 现已含 anchorTime）
    r.updateIndicator(uid, { params: { anchorTime: anchor, color: '#ff9800' } });
    expect(writes).toHaveLength(1); // 无第二次写回
    expect(r.listIndicators().find((i) => i.id === 'avwap')!.params.anchorTime).toBe(anchor);
  });

  it('同会话 renderer 重建：store params 带锚点添加 → 锚点恢复且不劫持点击', () => {
    const r1 = makeRenderer();
    const store = useIndicatorStore.getState();
    store.add('avwap');
    // store→renderer 下发（useChartCommands 路径）
    r1.addIndicator('avwap', { params: {} });
    click(400, 300); // 落锚
    // 模拟 Chart.tsx 的写回接线
    const anchored = r1.listIndicators().find((i) => i.id === 'avwap')!;
    store.setAnchorTime('avwap', anchored.params.anchorTime as number);
    const saved = useIndicatorStore.getState().active.find((a) => a.id === 'avwap')!.params;
    expect(saved.anchorTime).toBe(anchored.params.anchorTime);

    // renderer 重建（布局切换/remount）：以 store params 重新添加
    const r2 = makeRenderer();
    r2.setActiveTool('trendline');
    r2.addIndicator('avwap', { params: saved });
    click(300, 300); // 未被选 bar 模式劫持 → 趋势线第一点
    click(500, 400);
    r2.setActiveTool(null);
    expect(r2.listDrawings()).toHaveLength(1);
    expect(r2.listDrawings()[0].type).toBe('trendline');
    expect(r2.listIndicators().find((i) => i.id === 'avwap')!.params.anchorTime).toBe(anchored.params.anchorTime);
  });

  it('未注册回调（默认）：落锚不报错，实例锚点照常写入', () => {
    const r = makeRenderer();
    r.addIndicator('avwap');
    click(400, 300);
    const info = r.listIndicators().find((i) => i.id === 'avwap')!;
    expect(info.params.anchorTime).toBeGreaterThan(0);
  });
});
