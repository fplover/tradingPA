// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { BarSeries } from '@/data/BarSeries';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingGesture, type DrawingHost } from '@/engine/renderer/DrawingGesture';
import { DragBroadcast } from '@/engine/drawing/dragBroadcast';
import { createMockCtx, asCtx, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';

/**
 * P2-D 遗留②：水平线拖拽时面板清单实时广播单测。
 * - DragBroadcast：价格门襟状态机（变价才请求、提交补广播）
 * - DrawingGesture：拖拽迁移只对水平线变价请求广播；提交语义
 * - ChartController：rAF 未运行立即广播 / 运行中每帧至多一次（合帧）
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CHART_W = 1216;
const CHART_H = 776;

// ---------- DragBroadcast 状态机 ----------

describe('DragBroadcast：价格门襟', () => {
  it('reset 登记基线：同价/无价不请求，变价才请求', () => {
    const b = new DragBroadcast();
    b.reset(100); // 被拖水平线起始价
    expect(b.onMove(100)).toBe(false); // 与基线同价（水平拖动）
    expect(b.onMove(null)).toBe(false); // 无水平线
    expect(b.onMove(101)).toBe(true); // 变价
    expect(b.onMove(101)).toBe(false); // 与上次请求同价
    expect(b.onMove(102)).toBe(true); // 再次变价
    expect(b.onMove(101)).toBe(true); // 回摆也请求（面板需跟末态）
  });

  it('reset 后重新登记基线（新手势）', () => {
    const b = new DragBroadcast();
    b.reset(100);
    expect(b.onMove(101)).toBe(true);
    b.reset(101); // 新手势基线 = 上手势末态
    expect(b.onMove(101)).toBe(false);
    expect(b.onMove(100)).toBe(true);
  });

  it('commit：本手势变价过 → 补一次广播并归零；未变价 → 不广播', () => {
    const changed = new DragBroadcast();
    changed.reset(100);
    changed.onMove(101);
    expect(changed.commit()).toBe(true);
    expect(changed.commit()).toBe(false); // 已归零

    const same = new DragBroadcast();
    same.reset(100);
    same.onMove(100);
    expect(same.commit()).toBe(false);

    const noLine = new DragBroadcast();
    noLine.reset(null);
    expect(noLine.commit()).toBe(false);
  });
});

// ---------- DrawingGesture 级 ----------

function makeBars(n = 300): Bar[] {
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

function gestureSetup() {
  const series = new BarSeries();
  series.replace(makeBars());
  const viewport = new Viewport(CHART_W);
  viewport.setBarCount(series.length);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(CHART_H);
  priceScale.autoScale(29_000, 31_000);
  const notify = vi.fn();
  const notifyReq = vi.fn();
  const host: DrawingHost = {
    drawingCtx: () => ({ viewport, priceScale, series, geo: { chartW: CHART_W, chartH: CHART_H } }),
    mainPaneY: () => 0,
    viewport,
    displaySeries: () => series,
    chartW: () => CHART_W,
    drawingsLocked: () => false,
    invalidate: () => {},
    notifyDrawings: notify,
    requestDrawingsNotify: notifyReq,
  };
  const g = new DrawingGesture(host);
  return { g, notify, notifyReq };
}

describe('DrawingGesture：拖拽广播门襟', () => {
  it('水平线纵向拖拽（变价）→ 请求广播；提交 → 补一次广播', () => {
    const { g, notify, notifyReq } = gestureSetup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    notify.mockClear(); // setTool 自带一次广播，清零后只计量拖拽
    const hit = g.hitAt(300, 201, 0)!; // 线体（避开锚点手柄）
    expect(hit.part).toBe('body');
    g.beginDrag(300, 201, 0, hit, 0, false);
    g.onPointerMove(300, 250, 0, false); // 价格变化
    expect(notifyReq).toHaveBeenCalledTimes(1);
    g.onPointerMove(300, 280, 0, false); // 再次变价
    expect(notifyReq).toHaveBeenCalledTimes(2);
    g.onPointerUp();
    expect(notify).toHaveBeenCalledTimes(1); // 提交广播（精确末态）
  });

  it('水平线水平拖拽（价格不变）→ 不请求不广播', () => {
    const { g, notify, notifyReq } = gestureSetup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    notify.mockClear();
    const hit = g.hitAt(300, 201, 0)!;
    g.beginDrag(300, 201, 0, hit, 0, false);
    g.onPointerMove(400, 201, 0, false); // 仅时间平移
    g.onPointerMove(500, 201, 0, false);
    expect(notifyReq).not.toHaveBeenCalled();
    g.onPointerUp();
    expect(notify).not.toHaveBeenCalled();
  });

  it('非水平线（趋势线）拖拽变价 → 不请求不广播（行为中性）', () => {
    const { g, notify, notifyReq } = gestureSetup();
    g.setTool('trendline');
    g.place(200, 200, 0, false);
    g.place(400, 300, 0, false);
    notify.mockClear();
    const hit = g.hitAt(300, 250, 0)!;
    g.beginDrag(300, 250, 0, hit, 0, false);
    g.onPointerMove(300, 320, 0, false); // 价格变化但非水平线
    expect(notifyReq).not.toHaveBeenCalled();
    g.onPointerUp();
    expect(notify).not.toHaveBeenCalled();
  });

  it('多选整组拖拽（含水平线）→ 请求广播', () => {
    const { g, notifyReq } = gestureSetup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    g.setTool('trendline');
    g.place(200, 400, 0, false);
    g.place(500, 500, 0, false);
    g.layer.toggleSelect(g.layer.list()[0].id); // 多选 = [trendline, hline]
    const hit = g.hitAt(300, 201, 0)!; // 水平线线体
    g.beginDrag(300, 201, 0, hit, 0, false);
    g.onPointerMove(300, 260, 0, false);
    expect(notifyReq).toHaveBeenCalledTimes(1);
  });

  it('水平线手柄拖拽（变价）→ 请求广播', () => {
    const { g, notifyReq } = gestureSetup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    const hit = g.hitAt(200, 200, 0)!; // 锚点手柄
    expect(hit.part).toBe('handle');
    g.beginDrag(200, 200, 0, hit, 0, false);
    g.onPointerMove(200, 260, 0, false);
    expect(notifyReq).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+拖动懒克隆水平线：克隆体水平移动（价格不变）→ 不请求不广播', () => {
    const { g, notify, notifyReq } = gestureSetup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    notify.mockClear();
    const hit = g.hitAt(200, 200, 0)!;
    g.beginDrag(200, 200, 0, hit, 0, true); // Ctrl+按下 → 待克隆
    g.onPointerMove(300, 200, 0, false); // 水平移动超 2px → 懒克隆（价格不变）
    expect(g.layer.list()).toHaveLength(2); // 克隆体已生成
    expect(notifyReq).not.toHaveBeenCalled();
    g.onPointerUp();
    expect(notify).not.toHaveBeenCalled();
  });

  it('Ctrl+拖动懒克隆水平线：克隆体纵向移动（变价）→ 请求广播', () => {
    const { g, notifyReq } = gestureSetup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    const hit = g.hitAt(200, 200, 0)!;
    g.beginDrag(200, 200, 0, hit, 0, true);
    g.onPointerMove(300, 260, 0, false); // 斜向移动 → 克隆 + 价格变化
    expect(notifyReq).toHaveBeenCalledTimes(1);
  });
});

// ---------- ChartController 指针级（合帧语义） ----------

const CANVAS_W = 1280;
const CANVAS_H = 800;

let canvas: HTMLCanvasElement;

beforeEach(() => {
  document.body.innerHTML = '';
  const mock: MockCtx = createMockCtx();
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    asCtx(mock),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
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
    ({
      left: 0,
      top: 0,
      right: CANVAS_W,
      bottom: CANVAS_H,
      width: CANVAS_W,
      height: CANVAS_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function makeRenderer(): ChartRenderer {
  const r = new ChartRenderer(canvas, makeBars(600), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw();
  return r;
}

function ptr(type: string, x: number, y: number): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true }),
  );
}

/** 放置一条水平线并退回光标模式 */
function placeHline(r: ChartRenderer): void {
  r.setActiveTool('hline');
  ptr('pointerdown', 300, 250);
  ptr('pointerup', 300, 250);
  r.setActiveTool(null);
}

describe('ChartController：拖拽广播（rAF 未运行 → 立即）', () => {
  it('纵向拖拽水平线：每次变价立即广播，提交补一次', () => {
    const r = makeRenderer();
    placeHline(r);
    let calls = 0;
    r.onDrawingsChanged(() => calls++);
    ptr('pointerdown', 600, 250); // 线体（远离锚点手柄）
    ptr('pointermove', 600, 270);
    ptr('pointermove', 600, 290);
    expect(calls).toBe(2); // 两次变价 → 两次立即广播
    ptr('pointerup', 600, 290);
    expect(calls).toBe(3); // 提交广播（精确末态）
  });

  it('水平拖拽水平线：价格不变 → 全程不广播', () => {
    const r = makeRenderer();
    placeHline(r);
    let calls = 0;
    r.onDrawingsChanged(() => calls++);
    ptr('pointerdown', 600, 250);
    ptr('pointermove', 650, 250);
    ptr('pointermove', 700, 250);
    ptr('pointerup', 700, 250);
    expect(calls).toBe(0);
  });
});

describe('ChartController：拖拽广播（rAF 运行中 → 每帧合帧一次）', () => {
  it('帧内多次变价合为一次；提交广播同步补末态', () => {
    vi.useFakeTimers();
    const r = makeRenderer();
    r.start(); // rafId ≠ 0 → requestDrawingsNotify 记 pending
    placeHline(r);
    let calls = 0;
    r.onDrawingsChanged(() => calls++);

    ptr('pointerdown', 600, 250);
    ptr('pointermove', 600, 270);
    ptr('pointermove', 600, 290);
    ptr('pointermove', 600, 310);
    expect(calls).toBe(0); // 合帧中：尚未冲刷
    vi.advanceTimersByTime(20); // 下一帧
    expect(calls).toBe(1); // 3 次变价 move 合为 1 次广播
    ptr('pointermove', 600, 330);
    vi.advanceTimersByTime(20);
    expect(calls).toBe(2); // 第二批再合 1 次
    ptr('pointerup', 600, 330);
    expect(calls).toBe(3); // 提交广播（同步，精确末态）
  });
});
