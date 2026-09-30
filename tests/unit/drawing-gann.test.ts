// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, getToolDef } from '@/engine/drawing/types';
import { GANN_BOX_FRACTIONS, GANN_FAN_RATIOS, gannFanEdgePrice, gannFanLabel } from '@/engine/drawing/gannMath';
import { drawGann, hitTestGann } from '@/engine/drawing/gannRender';
import { createMockCtx, asCtx, callsOf, fillTexts, hasCall, hasPair, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { DrawContext } from '@/engine/drawing/drawDrawings';

/**
 * P2-B 江恩 3 件单测：扇形（7 档角度线族）/ 江恩线（1x1）/ 江恩箱（四分格 + 对角线）。
 * - gannMath：比率标签与边缘价（golden 手算）
 * - gannRender：canvas mock 绘制序列 + 命中
 * - ChartRenderer：落点 / 序列化 / 撤销
 */

const P = (time: number, price: number): DrawingPoint => ({ time, price });

// ---------- gannMath：纯几何 golden ----------

describe('GANN_FAN_RATIOS / gannFanLabel', () => {
  it('TV 默认 7 档：1x8 → 8x1', () => {
    expect([...GANN_FAN_RATIOS]).toEqual([0.125, 0.25, 0.5, 1, 2, 4, 8]);
  });
  it('比率 → TV 标签', () => {
    expect(gannFanLabel(0.125)).toBe('1x8');
    expect(gannFanLabel(0.25)).toBe('1x4');
    expect(gannFanLabel(0.5)).toBe('1x2');
    expect(gannFanLabel(1)).toBe('1x1');
    expect(gannFanLabel(2)).toBe('2x1');
    expect(gannFanLabel(4)).toBe('4x1');
    expect(gannFanLabel(8)).toBe('8x1');
  });
});

describe('gannFanEdgePrice', () => {
  it('边缘价 = 锚价 + 比率 × 每 bar 价差 × 到边缘 bar 数', () => {
    expect(gannFanEdgePrice(100, 2, 10, 1)).toBe(120); // 1x1
    expect(gannFanEdgePrice(100, 2, 10, 0.5)).toBe(110); // 1x2
    expect(gannFanEdgePrice(100, 2, 10, 2)).toBe(140); // 2x1
    expect(gannFanEdgePrice(100, 2, 10, 0.125)).toBe(102.5); // 1x8
    expect(gannFanEdgePrice(100, 2, 10, 8)).toBe(260); // 8x1
  });
  it('边缘在锚点左侧（barsToEdge 为负）价差符号延续', () => {
    expect(gannFanEdgePrice(100, 2, -5, 1)).toBe(90);
  });
  it('每 bar 价差为 0（无波动）退化为锚价', () => {
    expect(gannFanEdgePrice(100, 0, 10, 4)).toBe(100);
  });
});

describe('GANN_BOX_FRACTIONS', () => {
  it('四分位分割', () => {
    expect([...GANN_BOX_FRACTIONS]).toEqual([0.25, 0.5, 0.75]);
  });
});

describe('江恩工具注册', () => {
  it('扇形/江恩线单锚点，江恩箱两锚点', () => {
    expect(getToolDef('gann-fan').points).toBe(1);
    expect(getToolDef('gann-line').points).toBe(1);
    expect(getToolDef('gann-box').points).toBe(2);
    expect(getToolDef('gann-fan').defaultStyle.color).toBe('#787b86');
  });
});

// ---------- gannRender：canvas mock ----------

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

const W = 460;
const H = 300;

function makeDctx(): { ctx: MockCtx; dctx: DrawContext; ppb: number; barsToEdge: number } {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.setRange(100, 110); // 直接设域（无留白），金标准可手算
  const dctx: DrawContext = { viewport, priceScale, series, geo: { chartW: W, chartH: H } };
  // 与 gannRender.pricePerBar / rayEnd 同口径（供断言复算）
  const bars = Math.max(1, viewport.xToIndex(W) - viewport.first);
  const ppb = (priceScale.range.max - priceScale.range.min) / bars;
  const barsToEdge = viewport.xToIndex(W) - series.fractionalIndexAt(T0);
  return { ctx: createMockCtx(), dctx, ppb, barsToEdge };
}

function drawing(d: Partial<Drawing> & { type: Drawing['type']; points: DrawingPoint[] }): Drawing {
  return { id: 'd1', locked: false, visible: true, style: { color: '#787b86', lineWidth: 1 }, ...d } as Drawing;
}

function toPix(p: DrawingPoint, dctx: DrawContext): { x: number; y: number } {
  return {
    x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)),
    y: dctx.priceScale.priceToY(p.price),
  };
}

describe('drawGann：扇形', () => {
  it('7 条射线从锚点射向右缘 + 末端比率标签', () => {
    const { ctx, dctx, ppb, barsToEdge } = makeDctx();
    const d = drawing({ type: 'gann-fan', points: [P(T0, 100)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawGann(asCtx(ctx), d, pts, dctx);
    expect(callsOf(ctx, 'stroke')).toHaveLength(7);
    expect(fillTexts(ctx)).toEqual(['1x8', '1x4', '1x2', '1x1', '2x1', '4x1', '8x1']);
    // 1x1 射线末端价 = 100 + 1 × ppb × barsToEdge
    const endPrice = gannFanEdgePrice(100, ppb, barsToEdge, 1);
    expect(hasPair(ctx, 'moveTo', [pts[0].x, pts[0].y], 'lineTo', [W, dctx.priceScale.priceToY(endPrice)])).toBe(true);
    // 8x1 末端价 = 100 + 8 × ppb × barsToEdge（最高）
    const end8 = gannFanEdgePrice(100, ppb, barsToEdge, 8);
    expect(hasPair(ctx, 'moveTo', [pts[0].x, pts[0].y], 'lineTo', [W, dctx.priceScale.priceToY(end8)])).toBe(true);
  });

  it('射线末端价随比率单调（1x8 < 1x1 < 8x1）', () => {
    const { ppb, barsToEdge } = makeDctx();
    const prices = GANN_FAN_RATIOS.map((r) => gannFanEdgePrice(100, ppb, barsToEdge, r));
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });
});

describe('drawGann：江恩线', () => {
  it('单条 1x1 射线 + 标签', () => {
    const { ctx, dctx, ppb, barsToEdge } = makeDctx();
    const d = drawing({ type: 'gann-line', points: [P(T0, 100)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawGann(asCtx(ctx), d, pts, dctx);
    expect(callsOf(ctx, 'stroke')).toHaveLength(1);
    expect(fillTexts(ctx)).toEqual(['1x1']);
    const endPrice = gannFanEdgePrice(100, ppb, barsToEdge, 1);
    expect(hasPair(ctx, 'moveTo', [pts[0].x, pts[0].y], 'lineTo', [W, dctx.priceScale.priceToY(endPrice)])).toBe(true);
  });
});

describe('drawGann：江恩箱', () => {
  it('矩形 + 四分格（3 竖 3 横）+ 两条对角线', () => {
    const ctx = createMockCtx();
    const pts = [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ];
    drawGann(asCtx(ctx), drawing({ type: 'gann-box', points: [] }), pts, makeDctx().dctx);
    expect(hasCall(ctx, 'fillRect', [100, 100, 200, 100])).toBe(true);
    expect(hasCall(ctx, 'strokeRect', [100.5, 100.5, 199, 99])).toBe(true);
    // 3 竖 + 3 横 + 2 对角 = 8 次 stroke
    expect(callsOf(ctx, 'stroke')).toHaveLength(8);
    // 1/2 竖线 x = 200.5；1/2 横线 y = 150.5
    expect(hasPair(ctx, 'moveTo', [200.5, 100], 'lineTo', [200.5, 200])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [100, 150.5], 'lineTo', [300, 150.5])).toBe(true);
    // 对角线
    expect(hasPair(ctx, 'moveTo', [100, 100], 'lineTo', [300, 200])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [100, 200], 'lineTo', [300, 100])).toBe(true);
  });
});

// ---------- gannRender：命中 ----------

describe('hitTestGann', () => {
  it('扇形：1x1 射线上命中，远处不中', () => {
    const { dctx, ppb, barsToEdge } = makeDctx();
    const d = drawing({ type: 'gann-fan', points: [P(T0, 100)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    // 1x1 射线中点
    const endPrice = gannFanEdgePrice(100, ppb, barsToEdge, 1);
    const mid = { x: (pts[0].x + W) / 2, y: (pts[0].y + dctx.priceScale.priceToY(endPrice)) / 2 };
    expect(hitTestGann(d, pts, mid.x, mid.y, dctx)).toBe(true);
    expect(hitTestGann(d, pts, mid.x, mid.y - 60, dctx)).toBe(false);
  });

  it('江恩线：射线上命中', () => {
    const { dctx, ppb, barsToEdge } = makeDctx();
    const d = drawing({ type: 'gann-line', points: [P(T0, 100)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    const endPrice = gannFanEdgePrice(100, ppb, barsToEdge, 1);
    const mid = { x: (pts[0].x + W) / 2, y: (pts[0].y + dctx.priceScale.priceToY(endPrice)) / 2 };
    expect(hitTestGann(d, pts, mid.x, mid.y, dctx)).toBe(true);
  });

  it('江恩箱：框内 / 格线上 / 框外', () => {
    const { dctx } = makeDctx();
    const d = drawing({ type: 'gann-box', points: [P(T0, 100), P(T0 + 4 * IV, 108)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    const minX = Math.min(pts[0].x, pts[1].x);
    const maxX = Math.max(pts[0].x, pts[1].x);
    const minY = Math.min(pts[0].y, pts[1].y);
    const maxY = Math.max(pts[0].y, pts[1].y);
    expect(hitTestGann(d, pts, (minX + maxX) / 2, (minY + maxY) / 2, dctx)).toBe(true); // 内部
    expect(hitTestGann(d, pts, minX + (maxX - minX) * 0.25, (minY + maxY) / 2, dctx)).toBe(true); // 1/4 竖格线
    expect(hitTestGann(d, pts, maxX + 30, maxY + 30, dctx)).toBe(false); // 框外
  });

  it('非江恩类型返回 false', () => {
    const { dctx } = makeDctx();
    const d = drawing({ type: 'rect', points: [P(T0, 100), P(T0 + IV, 108)] });
    const pts = d.points.map((p) => toPix(p, dctx));
    expect(hitTestGann(d, pts, 200, 150, dctx)).toBe(false);
  });
});

// ---------- DrawingLayer：序列化 / 撤销 ----------

describe('江恩工具：序列化/撤销（DrawingLayer）', () => {
  it('三件序列化往返 + 撤销', () => {
    const layer = new DrawingLayer();
    layer.add('gann-fan', [P(1, 100)]);
    layer.add('gann-line', [P(2, 100)]);
    layer.add('gann-box', [P(1, 100), P(3, 110)]);
    const restored = deserializeDrawings(serializeDrawings(layer.list()));
    expect(restored.map((d) => d.type)).toEqual(['gann-fan', 'gann-line', 'gann-box']);
    expect(restored[2].points).toHaveLength(2);
    layer.undo();
    expect(layer.list().map((d) => d.type)).toEqual(['gann-fan', 'gann-line']);
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

describe('ChartRenderer：江恩工具落点全链路', () => {
  it('扇形/江恩线单击落点（单锚点）', () => {
    const r = makeRenderer();
    r.setActiveTool('gann-fan');
    click(300, 300);
    r.setActiveTool(null);
    expect(r.listDrawings().map((d) => d.type)).toEqual(['gann-fan']);
    expect(r.listDrawings()[0].points).toHaveLength(1);

    r.setActiveTool('gann-line');
    click(400, 350);
    r.setActiveTool(null);
    expect(r.listDrawings().map((d) => d.type)).toEqual(['gann-fan', 'gann-line']);
  });

  it('江恩箱两点落点 + 撤销', () => {
    const r = makeRenderer();
    r.setActiveTool('gann-box');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].points).toHaveLength(2);
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('放置后点击箱内命中 → 选中', () => {
    const r = makeRenderer();
    r.setActiveTool('gann-box');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    click(400, 350); // 箱内
    expect(r.selectedDrawingId).toBe(id);
  });

  it('导出/导入：三件序列化往返', () => {
    const r = makeRenderer();
    r.setActiveTool('gann-fan');
    click(300, 300);
    r.setActiveTool('gann-line');
    click(400, 350);
    r.setActiveTool('gann-box');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const r2 = makeRenderer();
    r2.importDrawings(r.exportDrawings());
    expect(r2.listDrawings().map((d) => d.type)).toEqual(['gann-fan', 'gann-line', 'gann-box']);
  });
});
