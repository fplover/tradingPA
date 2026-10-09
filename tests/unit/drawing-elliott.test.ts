// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, getToolDef, DRAWING_TOOLS } from '@/engine/drawing/types';
import { ELLIOTT_LABELS, ELLIOTT_POINTS, elliottLabelAt } from '@/engine/drawing/elliottMath';
import { drawElliott, hitTestElliott } from '@/engine/drawing/elliottRender';
import { createMockCtx, asCtx, callsOf, fillTexts, hasCall, hasPair, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';
import type { DrawingPoint } from '@/engine/drawing/types';

/**
 * P2-B 艾略特波浪单测：5-3 标注组（5 上 + 3 下 = 8 锚点）。
 * - elliottMath：标签序列（golden）
 * - elliottRender：折线 + 每点标注（canvas mock）+ 命中
 * - ChartRenderer：8 锚点落点 / 提前收尾 / 序列化 / 撤销
 */

const P = (time: number, price: number): DrawingPoint => ({ time, price });

// ---------- elliottMath ----------

describe('ELLIOTT_LABELS / ELLIOTT_POINTS', () => {
  it('5 上（1-5）+ 3 下（a,b,c）共 8 锚点', () => {
    expect([...ELLIOTT_LABELS]).toEqual(['1', '2', '3', '4', '5', 'a', 'b', 'c']);
    expect(ELLIOTT_POINTS).toBe(8);
  });
  it('elliottLabelAt：按放置顺序取标；越界空串', () => {
    expect(elliottLabelAt(0)).toBe('1');
    expect(elliottLabelAt(4)).toBe('5');
    expect(elliottLabelAt(5)).toBe('a');
    expect(elliottLabelAt(7)).toBe('c');
    expect(elliottLabelAt(8)).toBe('');
  });
});

describe('艾略特波浪工具注册', () => {
  it('8 锚点工具', () => {
    expect(getToolDef('elliott-wave').points).toBe(8);
    expect(getToolDef('elliott-wave').label).toBe('艾略特波浪');
    expect(DRAWING_TOOLS).toHaveLength(45);
  });
});

// ---------- elliottRender ----------

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

const BARS: Bar[] = [
  { time: T0, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: T0 + IV, open: 104, high: 108, low: 103, close: 101, volume: 900 },
  { time: T0 + 2 * IV, open: 101, high: 105, low: 100, close: 103, volume: 1500 },
  { time: T0 + 3 * IV, open: 103, high: 104, low: 99, close: 100, volume: 700 },
  { time: T0 + 4 * IV, open: 100, high: 107, low: 97, close: 105, volume: 2000 },
  { time: T0 + 5 * IV, open: 105, high: 106, low: 102, close: 102, volume: 800 },
];

function makeDctx() {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(460);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(300);
  priceScale.autoScale(97, 108);
  return { series, viewport, priceScale };
}

function toPix(p: DrawingPoint, dctx: ReturnType<typeof makeDctx>): { x: number; y: number } {
  return {
    x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)),
    y: dctx.priceScale.priceToY(p.price),
  };
}

/** 8 锚点波浪（5 上 3 下）的世界坐标样例 */
const WAVE: DrawingPoint[] = [
  P(T0, 100),
  P(T0 + IV, 105),
  P(T0 + 2 * IV, 102),
  P(T0 + 3 * IV, 108),
  P(T0 + 4 * IV, 104),
  P(T0 + 5 * IV, 110),
  P(T0 + 6 * IV, 106),
  P(T0 + 7 * IV, 101),
];

describe('drawElliott', () => {
  it('8 锚点折线 + 1-5/a-b-c 标注（右上偏移 5px）', () => {
    const ctx = createMockCtx();
    const pts = WAVE.map((p) => toPix(p, makeDctx()));
    drawElliott(asCtx(ctx), pts);
    // 折线：moveTo + 7 条 lineTo + stroke
    expect(hasPair(ctx, 'moveTo', [pts[0].x, pts[0].y], 'lineTo', [pts[1].x, pts[1].y])).toBe(true);
    expect(callsOf(ctx, 'stroke')).toHaveLength(1);
    // 8 个标注
    expect(fillTexts(ctx)).toEqual(['1', '2', '3', '4', '5', 'a', 'b', 'c']);
    expect(hasCall(ctx, 'fillText', ['1', pts[0].x + 5, pts[0].y - 5])).toBe(true);
    expect(hasCall(ctx, 'fillText', ['5', pts[4].x + 5, pts[4].y - 5])).toBe(true);
    expect(hasCall(ctx, 'fillText', ['a', pts[5].x + 5, pts[5].y - 5])).toBe(true);
    expect(hasCall(ctx, 'fillText', ['c', pts[7].x + 5, pts[7].y - 5])).toBe(true);
  });

  it('放置中（3 点）：画已落点折线 + 前 3 个标注', () => {
    const ctx = createMockCtx();
    const pts = WAVE.slice(0, 3).map((p) => toPix(p, makeDctx()));
    drawElliott(asCtx(ctx), pts);
    expect(fillTexts(ctx)).toEqual(['1', '2', '3']);
    expect(callsOf(ctx, 'stroke')).toHaveLength(1);
  });
});

describe('hitTestElliott', () => {
  it('任一分段 ±6px 命中，远处不中', () => {
    const pts = WAVE.map((p) => toPix(p, makeDctx()));
    const mid = { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 };
    expect(hitTestElliott(pts, mid.x, mid.y)).toBe(true);
    expect(hitTestElliott(pts, mid.x + 100, mid.y - 100)).toBe(false);
  });
});

// ---------- DrawingLayer：序列化 / 撤销 ----------

describe('艾略特波浪：序列化/撤销（DrawingLayer）', () => {
  it('8 点序列化往返 + 撤销', () => {
    const layer = new DrawingLayer();
    layer.add('elliott-wave', WAVE);
    const restored = deserializeDrawings(serializeDrawings(layer.list()));
    expect(restored.map((d) => d.type)).toEqual(['elliott-wave']);
    expect(restored[0].points).toHaveLength(8);
    layer.undo();
    expect(layer.list()).toHaveLength(0);
  });
});

// ---------- ChartRenderer 指针级 ----------

const CANVAS_W = 1280;
const CANVAS_H = 800;

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

let canvas: HTMLCanvasElement;
let mock: MockCtx;

beforeEach(() => {
  document.body.innerHTML = '';
  mock = createMockCtx();
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
});

function makeRenderer(): ChartRenderer {
  const r = new ChartRenderer(canvas, makeBars(), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw();
  return r;
}

function ptr(type: string, x: number, y: number): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true }),
  );
}

function click(x: number, y: number): void {
  ptr('pointerdown', x, y);
  ptr('pointerup', x, y);
}

/** 8 锚点点击序列（5 上 + 3 下） */
const WAVE_CLICKS: Array<[number, number]> = [
  [300, 350],
  [350, 300],
  [400, 330],
  [450, 260],
  [500, 300],
  [550, 240],
  [600, 320],
  [650, 380],
  [700, 350],
];

describe('ChartRenderer：艾略特波浪落点全链路', () => {
  it('8 次点击落成 5-3 标注组', () => {
    const r = makeRenderer();
    r.setActiveTool('elliott-wave');
    for (const [x, y] of WAVE_CLICKS) click(x, y);
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('elliott-wave');
    expect(list[0].points).toHaveLength(8);
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('不足 8 点时回车提前收尾（保留已落锚点）', () => {
    const r = makeRenderer();
    r.setActiveTool('elliott-wave');
    for (const [x, y] of WAVE_CLICKS.slice(0, 5)) click(x, y);
    expect(r.listDrawings()).toHaveLength(0);
    r.finishPlacing(); // 回车/双击
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].points).toHaveLength(5);
  });

  it('渲染帧输出 1-5/a-b/c 标注（端到端）', () => {
    const r = makeRenderer();
    r.setActiveTool('elliott-wave');
    for (const [x, y] of WAVE_CLICKS) click(x, y);
    r.setActiveTool(null);
    mock.calls.length = 0; // 清掉放置过程的记录
    r.redraw();
    expect(fillTexts(mock)).toEqual(expect.arrayContaining(['1', '2', '3', '4', '5', 'a', 'b', 'c']));
  });

  it('放置后点击折线命中 → 选中', () => {
    const r = makeRenderer();
    r.setActiveTool('elliott-wave');
    for (const [x, y] of WAVE_CLICKS) click(x, y);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    // 第 1 段（300,350)→(350,300) 中点
    click(325, 325);
    expect(r.selectedDrawingId).toBe(id);
  });

  it('导出/导入：波浪对象序列化往返', () => {
    const r = makeRenderer();
    r.setActiveTool('elliott-wave');
    for (const [x, y] of WAVE_CLICKS) click(x, y);
    r.setActiveTool(null);
    const r2 = makeRenderer();
    r2.importDrawings(r.exportDrawings());
    expect(r2.listDrawings()[0].points).toHaveLength(8);
  });
});
