// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, getToolDef } from '@/engine/drawing/types';
import { measureLabelLines, measureStats } from '@/engine/drawing/measureMath';
import { drawMeasure, hitTestMeasure } from '@/engine/drawing/measureRender';
import { createMockCtx, asCtx, callsOf, fillTexts, hasCall, hasPair, propSets, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { DrawContext } from '@/engine/drawing/drawDrawings';

/**
 * P2-B 测量工具单测（AC-B2）：
 * - measureMath：bar 数/价差/百分比纯统计（golden 手算）
 * - measureRender：点线主轴 + 浮层三行标签（canvas mock）+ 命中
 * - ChartRenderer：两点落点、Esc 取消（放置中/已放置）、序列化、撤销
 */

const P = (time: number, price: number): DrawingPoint => ({ time, price });

// ---------- measureMath：纯统计 golden ----------

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

function makeSeries(): BarSeries {
  const series = new BarSeries();
  series.replace(BARS);
  return series;
}

describe('measureStats', () => {
  const series = makeSeries();

  it('bar 数 = |分数索引差| 取整；价差/百分比按世界价格', () => {
    expect(measureStats(P(T0, 100), P(T0 + 2 * IV, 110), series)).toEqual({ bars: 2, diff: 10, pct: 10 });
  });

  it('方向反转：bar 数取绝对值，价差带符号', () => {
    expect(measureStats(P(T0 + IV, 100), P(T0, 90), series)).toEqual({ bars: 1, diff: -10, pct: -10 });
  });

  it('起点价为 0 时百分比退化为 0（不除零）', () => {
    expect(measureStats(P(T0, 0), P(T0 + IV, 50), series)).toEqual({ bars: 1, diff: 50, pct: 0 });
  });

  it('同点测量：0 根 / 0 价差 / 0%', () => {
    expect(measureStats(P(T0, 100), P(T0, 100), series)).toEqual({ bars: 0, diff: 0, pct: 0 });
  });
});

describe('measureLabelLines（浮层三行）', () => {
  it('N 根K线 / 带符号价差 / 带符号百分比', () => {
    expect(measureLabelLines({ bars: 12, diff: 3.5, pct: 1.25 }, 2)).toEqual(['12 根K线', '+3.50', '+1.25%']);
    expect(measureLabelLines({ bars: 3, diff: -5.5, pct: -5 }, 2)).toEqual(['3 根K线', '-5.50', '-5.00%']);
  });
  it('价差小数位随 decimals', () => {
    expect(measureLabelLines({ bars: 1, diff: 1.23456, pct: 0.5 }, 4)).toEqual(['1 根K线', '+1.2346', '+0.50%']);
  });
});

describe('measure 工具注册', () => {
  it('两点工具 + 虚线默认样式', () => {
    expect(getToolDef('measure').points).toBe(2);
    expect(getToolDef('measure').defaultStyle.dash).toBe(true);
    expect(getToolDef('measure').defaultStyle.color).toBe('#787b86');
  });
});

// ---------- measureRender：canvas mock ----------

const W = 460;
const H = 300;

function makeDctx(): { ctx: MockCtx; dctx: DrawContext } {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(97, 108);
  return { ctx: createMockCtx(), dctx: { viewport, priceScale, series, geo: { chartW: W, chartH: H } } };
}

function drawing(d: Partial<Drawing> & { type: Drawing['type']; points: DrawingPoint[] }): Drawing {
  return { id: 'd1', locked: false, visible: true, style: { color: '#787b86', lineWidth: 1, dash: true }, ...d } as Drawing;
}

function toPix(p: DrawingPoint, dctx: DrawContext): { x: number; y: number } {
  return {
    x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)),
    y: dctx.priceScale.priceToY(p.price),
  };
}

describe('drawMeasure（点线 + 浮层三行标签）', () => {
  it('虚线主轴 + 两端圆点 + 中点上方信息框（mock 口径）', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'measure', points: [P(T0, 100), P(T0 + 2 * IV, 110)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawMeasure(asCtx(ctx), d, pts, dctx.series, 2);

    // 主轴（点线 [2,3]，绘制后复位 []；mock 记录每次调用的参数数组）
    expect(callsOf(ctx, 'setLineDash')).toEqual([[[2, 3]], [[]]]);
    expect(hasPair(ctx, 'moveTo', [pts[0].x, pts[0].y], 'lineTo', [pts[1].x, pts[1].y])).toBe(true);
    // 两端圆点 r=2.5
    expect(callsOf(ctx, 'arc')).toHaveLength(2);
    expect(hasCall(ctx, 'arc', [pts[0].x, pts[0].y, 2.5, 0, Math.PI * 2])).toBe(true);
    expect(hasCall(ctx, 'arc', [pts[1].x, pts[1].y, 2.5, 0, Math.PI * 2])).toBe(true);

    // 浮层：3 行；最长行 '+10.00%' 7 字符 × 6 + 12 = 54；高 3×13+8 = 47
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const bx = midX - 27;
    const by = midY - 53;
    expect(hasCall(ctx, 'fillRect', [bx, by, 54, 47])).toBe(true);
    expect(fillTexts(ctx)).toEqual(['2 根K线', '+10.00', '+10.00%']);
    expect(hasCall(ctx, 'fillText', ['2 根K线', bx + 6, by + 10.5])).toBe(true);
    expect(hasCall(ctx, 'fillText', ['+10.00%', bx + 6, by + 36.5])).toBe(true);
  });

  it('信息框颜色：bar 行轴色、涨跌行涨/跌色', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'measure', points: [P(T0, 100), P(T0 + 2 * IV, 110)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawMeasure(asCtx(ctx), d, pts, dctx.series, 2);
    // fillStyle 序列：主轴/圆点（工具色）→ 框底 → 三行文字色
    const fills = propSets(ctx, 'fillStyle');
    expect(fills[fills.length - 3]).toBe('#b2b5be'); // bar 行（theme.axisText）
    expect(fills[fills.length - 2]).toBe('#26a69a'); // 涨（theme.up）
    expect(fills[fills.length - 1]).toBe('#26a69a');
  });

  it('下跌测量：价差行用跌色', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'measure', points: [P(T0 + IV, 100), P(T0, 90)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawMeasure(asCtx(ctx), d, pts, dctx.series, 2);
    const fills = propSets(ctx, 'fillStyle');
    expect(fills[fills.length - 2]).toBe('#ef5350'); // theme.down
    expect(fillTexts(ctx)).toEqual(['1 根K线', '-10.00', '-10.00%']);
  });

  it('上方越界时浮层落到线下方', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'measure', points: [P(T0, 108), P(T0 + IV, 107)] }); // 贴近视口顶
    const pts = d.points.map((p) => toPix(p, dctx));
    drawMeasure(asCtx(ctx), d, pts, dctx.series, 2);
    const midY = (pts[0].y + pts[1].y) / 2;
    const rect = callsOf(ctx, 'fillRect')[0];
    expect(rect[1]).toBe(midY + 6); // 线下方
  });
});

describe('hitTestMeasure', () => {
  it('主轴 ±6px 与浮层框内命中，远处不中', () => {
    const { dctx } = makeDctx();
    const d = drawing({ type: 'measure', points: [P(T0, 100), P(T0 + 2 * IV, 110)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    expect(hitTestMeasure(d, pts, mid.x, mid.y, dctx.series)).toBe(true); // 线上
    expect(hitTestMeasure(d, pts, mid.x + 4, mid.y + 4, dctx.series)).toBe(true); // ±6 容差
    // 浮层框内（decimals=2 估算）：框在中点上方 53px 处
    expect(hitTestMeasure(d, pts, mid.x, mid.y - 40, dctx.series)).toBe(true);
    expect(hitTestMeasure(d, pts, mid.x + 120, mid.y - 120, dctx.series)).toBe(false);
  });
});

// ---------- DrawingLayer：放置 / 序列化 / 撤销 ----------

describe('measure：放置/序列化/撤销（DrawingLayer）', () => {
  it('两点放置 + 默认虚线样式', () => {
    const layer = new DrawingLayer();
    const m = layer.add('measure', [P(1, 100), P(3, 110)]);
    expect(layer.selected?.id).toBe(m.id);
    expect(m.style.dash).toBe(true);
    expect(m.points).toHaveLength(2);
  });

  it('序列化往返', () => {
    const layer = new DrawingLayer();
    layer.add('measure', [P(1, 100), P(3, 110)]);
    const restored = deserializeDrawings(serializeDrawings(layer.list()));
    expect(restored.map((d) => d.type)).toEqual(['measure']);
    expect(restored[0].points).toEqual([P(1, 100), P(3, 110)]);
  });

  it('撤销/重做', () => {
    const layer = new DrawingLayer();
    layer.add('measure', [P(1, 100), P(3, 110)]);
    layer.undo();
    expect(layer.list()).toHaveLength(0);
    layer.redo();
    expect(layer.list()[0].type).toBe('measure');
  });
});

// ---------- ChartRenderer 指针级：落点 / Esc 取消 ----------

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

beforeEach(() => {
  document.body.innerHTML = '';
  const mock = createMockCtx();
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

describe('ChartRenderer：测量工具全链路（AC-B2）', () => {
  it('两点落点：bar 数/价差/百分比统计可算，浮层随对象渲染', () => {
    const r = makeRenderer();
    r.setActiveTool('measure');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('measure');
    const [p1, p2] = list[0].points;
    expect(p2.time).toBeGreaterThan(p1.time);
    expect(p2.price).not.toBe(p1.price);
  });

  it('Esc 取消放置中测量：仅落 1 点即 Esc，不产生对象', () => {
    const r = makeRenderer();
    r.setActiveTool('measure');
    click(300, 300);
    r.cancelPlacing(); // Esc
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('Esc 取消已放置测量：选中态测量对象被移除（浮层临时对象语义）', () => {
    const r = makeRenderer();
    r.setActiveTool('measure');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    expect(r.listDrawings()).toHaveLength(1);
    expect(r.selectedDrawingId).not.toBeNull();
    r.cancelPlacing(); // Esc：移除选中的测量对象
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('Esc 不影响非测量对象（趋势线选中态不受影响）', () => {
    const r = makeRenderer();
    r.setActiveTool('trendline');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    expect(r.listDrawings()).toHaveLength(1);
    r.cancelPlacing();
    expect(r.listDrawings()).toHaveLength(1); // 趋势线保留
  });

  it('放置后点击主轴命中 → 选中；撤销移除', () => {
    const r = makeRenderer();
    r.setActiveTool('measure');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    click(400, 350); // 主轴中点
    expect(r.selectedDrawingId).toBe(id);
    // 撤销栈：放置一步 + 命中拖拽的 beginHistory 一步（无移动的空历史）
    r.undoDrawing();
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('导出/导入：测量对象序列化往返', () => {
    const r = makeRenderer();
    r.setActiveTool('measure');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const r2 = makeRenderer();
    r2.importDrawings(r.exportDrawings());
    expect(r2.listDrawings().map((d) => d.type)).toEqual(['measure']);
    expect(r2.listDrawings()[0].points).toHaveLength(2);
  });
});
