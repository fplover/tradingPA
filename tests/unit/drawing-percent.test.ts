// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, getToolDef } from '@/engine/drawing/types';
import { hitTestDrawing } from '@/engine/drawing/drawDrawings';
import { PERCENT_LEVELS, percentLevelLabel, percentPrice } from '@/engine/drawing/percentMath';
import { drawPercentLine, hitTestPercentLine } from '@/engine/drawing/percentRender';
import { fibLevelEndX } from '@/engine/drawing/fibMath';
import { createMockCtx, asCtx, callsOf, fillTexts, hasCall, hasPair, propSets, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { DrawContext } from '@/engine/drawing/drawDrawings';

/**
 * 百分比线（默认 0% / 50% / 100% 三档，档位可自定义）单测：
 * - percentMath：档位常量 + 锚点→价位纯函数 golden（手算）
 * - percentRender：canvas mock 断言水平线组 + 右端「百分比 价格」标签（线长/标签位置复用 fib 策略）
 * - 命中：回撤式（锚线 ±6px + 各水平线 ±6px，末端与渲染一致，末端外不命中）
 * - DrawingLayer：两点放置 / 序列化往返 / 撤销重做
 * - ChartRenderer：指针级两点落点 / Esc 取消 / 命中选中 / 撤销 / 导出导入
 * 自定义档位（Drawing.levels）的渲染/命中/持久化见 drawing-levels.test.ts。
 */

afterAll(() => {
  vi.unstubAllGlobals();
});

// ---------- percentMath：档位常量与价位 golden ----------

describe('PERCENT_LEVELS（默认三档：0% / 50% / 100%）', () => {
  it('经典百分比线形态：0% 与 100% 即两锚点价，50% 为中点，严格递增', () => {
    expect([...PERCENT_LEVELS]).toEqual([0, 0.5, 1]);
    for (let i = 1; i < PERCENT_LEVELS.length; i++) {
      expect(PERCENT_LEVELS[i]).toBeGreaterThan(PERCENT_LEVELS[i - 1]);
    }
  });
});

describe('percentPrice（p0 + (p1 - p0) × 档位）', () => {
  it('上升段 golden：p0=100, p1=110 → 0%=100 / 50%=105 / 100%=110', () => {
    expect(percentPrice(100, 110, 0)).toBe(100); // 0% 档 = 起点价（锚点价）
    expect(percentPrice(100, 110, 0.5)).toBe(105); // 50% 档 = 区间中点
    expect(percentPrice(100, 110, 1)).toBe(110); // 100% 档 = 终点价（锚点价）
  });
  it('任意档位仍按公式取值（自定义档位同规则）：12.5%=101.25 / 87.5%=108.75', () => {
    expect(percentPrice(100, 110, 0.125)).toBe(101.25);
    expect(percentPrice(100, 110, 0.875)).toBe(108.75);
  });
  it('下跌段（p1 < p0）档位价递减，符号天然延续', () => {
    expect(percentPrice(110, 100, 0)).toBe(110);
    expect(percentPrice(110, 100, 0.5)).toBe(105);
    expect(percentPrice(110, 100, 1)).toBe(100);
  });
  it('零价差（水平锚线）各档同价', () => {
    expect(percentPrice(100, 100, 0)).toBe(100);
    expect(percentPrice(100, 100, 0.5)).toBe(100);
    expect(percentPrice(100, 100, 1)).toBe(100);
  });
});

describe('percentLevelLabel（右端标签文本）', () => {
  it('「百分比 价格」两位小数，与 fib 回撤同款口径', () => {
    expect(percentLevelLabel(0, 100, 2)).toBe('0.0% 100.00');
    expect(percentLevelLabel(0.5, 105, 2)).toBe('50.0% 105.00');
    expect(percentLevelLabel(1, 110, 4)).toBe('100.0% 110.0000');
    expect(percentLevelLabel(0.236, 102.36, 2)).toBe('23.6% 102.36');
  });
});

describe('percent-line 工具注册', () => {
  it('两点工具 + 默认灰 #787b86（与 fib 家族同源）', () => {
    expect(getToolDef('percent-line').points).toBe(2);
    expect(getToolDef('percent-line').defaultStyle.color).toBe('#787b86');
    expect(getToolDef('percent-line').defaultStyle.lineWidth).toBe(1);
  });
});

// ---------- percentRender：canvas mock ----------

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

function makeDctx(): { ctx: MockCtx; dctx: DrawContext; priceScale: PriceScale } {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(97, 108);
  return { ctx: createMockCtx(), dctx: { viewport, priceScale, series, geo: { chartW: W, chartH: H } }, priceScale };
}

function drawing(d: Partial<Drawing> & { type: Drawing['type']; points: DrawingPoint[] }): Drawing {
  return { id: 'd1', locked: false, visible: true, style: { color: '#787b86', lineWidth: 1 }, ...d } as Drawing;
}

/** 锚点世界坐标 → 像素（与 drawOne 内部同规则） */
function toPix(p: DrawingPoint, dctx: DrawContext): { x: number; y: number } {
  return {
    x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)),
    y: dctx.priceScale.priceToY(p.price),
  };
}

/** 首锚点像素（命中分发用例用） */
function pts0(d: Drawing, dctx: DrawContext): { x: number; y: number } {
  return toPix(d.points[0], dctx);
}

describe('drawPercentLine（默认三档水平线组 + 右端标签）', () => {
  it('3 条水平线 + 3 个「百分比 价格」标签（golden：p0=100, p1=110 → 0%/50%/100%）', () => {
    const { ctx, dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'percent-line', points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawPercentLine(asCtx(ctx), d, pts, dctx, 2);

    expect(callsOf(ctx, 'stroke')).toHaveLength(3);
    // 线长与 fib 回撤同策略：末端 = 最右锚点 + 一个锚点摆幅（452，不到画布右缘 460）
    const endX = fibLevelEndX(pts[0].x, pts[1].x, W);
    expect(endX).toBe(452);
    // 0% 档 = 100（起点锚点价）：从左锚点 x0 画到 endX
    const y0 = Math.round(priceScale.priceToY(100)) + 0.5;
    expect(hasPair(ctx, 'moveTo', [pts[0].x, y0], 'lineTo', [endX, y0])).toBe(true);
    // 50% 档 = 105（区间中点）
    const y50 = Math.round(priceScale.priceToY(105)) + 0.5;
    expect(hasPair(ctx, 'moveTo', [pts[0].x, y50], 'lineTo', [endX, y50])).toBe(true);
    // 100% 档 = 110（终点锚点价）
    const y100 = Math.round(priceScale.priceToY(110)) + 0.5;
    expect(hasPair(ctx, 'moveTo', [pts[0].x, y100], 'lineTo', [endX, y100])).toBe(true);
    expect(fillTexts(ctx)).toEqual([
      '0.0% 100.00',
      '50.0% 105.00',
      '100.0% 110.00',
    ]);
  });

  it('标签溢出画布 → 钳到 chartW - 字宽 - 2 并右对齐（clamp 态）', () => {
    const { ctx, dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'percent-line', points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawPercentLine(asCtx(ctx), d, pts, dctx, 2);
    // mock 字宽 = 字数 × 6；'0.0% 100.00' 11 字 → 66；endX(452) + 4 + 66 = 522 > 458
    // → x = 460 - 66 - 2 = 392，右对齐
    expect(hasCall(ctx, 'fillText', ['0.0% 100.00', 392, Math.round(priceScale.priceToY(100)) + 0.5])).toBe(true);
    expect(propSets(ctx, 'textAlign').at(-1)).toBe('right');
  });

  it('末端靠近左缘时标签放得下：贴 endX + 4 左对齐（非 clamp 态）', () => {
    const { ctx, dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'percent-line', points: [{ time: T0, price: 100 }, { time: T0 + IV, price: 110 }] });
    // 手工指定锚点像素（x 位置才是本用例变量）：x0=100 / xLabel=124 → 摆幅下限 24 → endX=148
    drawPercentLine(asCtx(ctx), d, [{ x: 100, y: 0 }, { x: 124, y: 0 }], dctx, 2);
    const y0 = Math.round(priceScale.priceToY(100)) + 0.5;
    // '0.0% 100.00' 宽 66：148 + 4 + 66 = 218 ≤ 458 → 贴末端左对齐
    expect(hasCall(ctx, 'fillText', ['0.0% 100.00', 152, y0])).toBe(true);
    expect(propSets(ctx, 'textAlign').at(-1)).toBe('left');
  });

  it('放置中仅 1 点（预览态）：不画线组', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'percent-line', points: [{ time: T0, price: 100 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawPercentLine(asCtx(ctx), d, pts, dctx, 2);
    expect(callsOf(ctx, 'stroke')).toHaveLength(0);
  });
});

// ---------- percentRender：命中测试（回撤式） ----------

describe('hitTestPercentLine（锚线 ±6px + 水平线 ±6px，末端与渲染一致）', () => {
  it('锚线、各水平线命中；末端外不中；远处不中', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'percent-line', points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    // 锚线（两落点对角线）中点
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    expect(hitTestPercentLine(d, pts, mid.x, mid.y, dctx)).toBe(true);
    // 0% 水平线（100 = 起点锚点价）上、锚点右侧 20px
    expect(hitTestPercentLine(d, pts, pts[0].x + 20, priceScale.priceToY(100), dctx)).toBe(true);
    // ±6px 容差内
    expect(hitTestPercentLine(d, pts, pts[0].x + 20, priceScale.priceToY(100) + 5, dctx)).toBe(true);
    // 超出容差（+9px）不中
    expect(hitTestPercentLine(d, pts, pts[0].x + 20, priceScale.priceToY(100) + 9, dctx)).toBe(false);
    // 末端 452 之外不再命中（与渲染线组一一对应）
    expect(hitTestPercentLine(d, pts, W, priceScale.priceToY(100), dctx)).toBe(false);
    // 远离全部线组
    expect(hitTestPercentLine(d, pts, 50, 50, dctx)).toBe(false);
  });

  it('非 percent-line 类型返回 false', () => {
    const { dctx } = makeDctx();
    const d = drawing({ type: 'fib', points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    expect(hitTestPercentLine(d, pts, 200, 150, dctx)).toBe(false);
  });

  it('drawDrawings 分发：命中返回 body，末端外返回 null', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'percent-line', points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    expect(hitTestDrawing(d, pts0(d, dctx).x + 20, priceScale.priceToY(105), dctx)).toEqual({ part: 'body' });
    expect(hitTestDrawing(d, W, priceScale.priceToY(105), dctx)).toBeNull();
  });
});

// ---------- DrawingLayer：放置 / 序列化 / 撤销 ----------

describe('percent-line：放置/序列化/撤销（DrawingLayer）', () => {
  const P = (time: number, price: number): DrawingPoint => ({ time, price });

  it('两点放置 + 默认灰色样式', () => {
    const layer = new DrawingLayer();
    const m = layer.add('percent-line', [P(1, 100), P(3, 110)]);
    expect(layer.selected?.id).toBe(m.id);
    expect(m.points).toHaveLength(2);
    expect(m.style.color).toBe('#787b86');
  });

  it('序列化往返', () => {
    const layer = new DrawingLayer();
    layer.add('percent-line', [P(1, 100), P(3, 110)]);
    const restored = deserializeDrawings(serializeDrawings(layer.list()));
    expect(restored.map((d) => d.type)).toEqual(['percent-line']);
    expect(restored[0].points).toEqual([P(1, 100), P(3, 110)]);
  });

  it('撤销/重做', () => {
    const layer = new DrawingLayer();
    layer.add('percent-line', [P(1, 100), P(3, 110)]);
    layer.undo();
    expect(layer.list()).toHaveLength(0);
    layer.redo();
    expect(layer.list()[0].type).toBe('percent-line');
  });
});

// ---------- ChartRenderer 指针级：两点落点 / Esc 取消 / 命中 / 撤销 ----------

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

describe('ChartRenderer：百分比线全链路', () => {
  it('两点落点：生成 percent-line 对象，两点时间/价格均不同', () => {
    const r = makeRenderer();
    r.setActiveTool('percent-line');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('percent-line');
    const [p1, p2] = list[0].points;
    expect(p2.time).toBeGreaterThan(p1.time);
    expect(p2.price).not.toBe(p1.price);
  });

  it('Esc 取消放置中：仅落 1 点即 Esc，不产生对象', () => {
    const r = makeRenderer();
    r.setActiveTool('percent-line');
    click(300, 300);
    r.cancelPlacing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('放置后点击锚线命中 → 选中；撤销移除', () => {
    const r = makeRenderer();
    r.setActiveTool('percent-line');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    // 锚线（两落点对角线）中点必然命中（±6px 回撤式规则）
    const px = (300 + 500) / 2;
    const py = (300 + 400) / 2;
    click(px, py);
    expect(r.selectedDrawingId).toBe(id);
    // 撤销栈：放置一步 + 命中拖拽 beginHistory 一步（无移动的空历史）
    r.undoDrawing();
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('导出/导入：百分比线对象序列化往返', () => {
    const r = makeRenderer();
    r.setActiveTool('percent-line');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const r2 = makeRenderer();
    r2.importDrawings(r.exportDrawings());
    expect(r2.listDrawings().map((d) => d.type)).toEqual(['percent-line']);
    expect(r2.listDrawings()[0].points).toHaveLength(2);
  });
});
