// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, defaultLevelsFor } from '@/engine/drawing/types';
import { drawDrawings, hitTestDrawing } from '@/engine/drawing/drawDrawings';
import { drawPercentLine, hitTestPercentLine } from '@/engine/drawing/percentRender';
import { PERCENT_LEVELS } from '@/engine/drawing/percentMath';
import {
  FIB_EXTENSION_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  fibExtensionPrice,
  fibRetracementPrice,
} from '@/engine/drawing/fibMath';
import { parseLevelTexts } from '@/features/drawings/DrawingLevelsEditor';
import { createMockCtx, asCtx, callsOf, fillTexts, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { DrawContext } from '@/engine/drawing/drawDrawings';

/**
 * 自定义分割档位（Drawing.levels）单测：
 * - parseLevelTexts：对话框校验规则（非法值不写 / 重复跳过保序 / 空行待编辑 / 至少 1 档）
 * - defaultLevelsFor：三工具默认档 + 其余工具 null
 * - 渲染：percent / fib 回撤 / fib 扩展的 levels 覆盖（删档不画、加档生效、undefined 回退默认）
 * - 命中：删档后不再命中、加档后命中（与渲染一一对应）
 * - 持久化：updateLevels + 撤销/重做 + 序列化往返 + 克隆 + ChartRenderer 导出导入
 * - ChartRenderer 指针级端到端：放置 → 设置改档 → 重绘 → 撤销回退
 */

afterAll(() => {
  vi.unstubAllGlobals();
});

// ---------- parseLevelTexts：对话框校验规则 ----------

describe('parseLevelTexts（% 文本 → 百分比小数档位）', () => {
  it('正常输入：÷100 存小数，保持用户顺序', () => {
    expect(parseLevelTexts(['0', '50', '100'])).toEqual([0, 0.5, 1]);
    expect(parseLevelTexts(['23.6', '61.8'])).toEqual([0.236, 0.618]);
    expect(parseLevelTexts(['161.8', '261.8'])).toEqual([1.618, 2.618]);
  });

  it('非法值（非数字/NaN）整批不写', () => {
    expect(parseLevelTexts(['abc'])).toBeNull();
    expect(parseLevelTexts(['50', 'abc'])).toBeNull();
    expect(parseLevelTexts(['50', '-'])).toBeNull(); // 输入中的孤立负号
    expect(parseLevelTexts(['Infinity'])).toBeNull();
  });

  it('空文本行视为待编辑新行（跳过，不阻塞其他档提交）', () => {
    expect(parseLevelTexts(['', '50'])).toEqual([0.5]);
    expect(parseLevelTexts(['25', '', '75'])).toEqual([0.25, 0.75]);
  });

  it('重复值跳过并保持原档顺序', () => {
    expect(parseLevelTexts(['50', '25', '50', '100'])).toEqual([0.5, 0.25, 1]);
  });

  it('无有效档（全空）→ null（至少保留 1 档）', () => {
    expect(parseLevelTexts([])).toBeNull();
    expect(parseLevelTexts(['', '  '])).toBeNull();
  });
});

// ---------- defaultLevelsFor ----------

describe('defaultLevelsFor（工具默认档）', () => {
  it('fib / fib-extension / percent-line 返回默认档副本', () => {
    expect(defaultLevelsFor('fib')).toEqual([...FIB_RETRACEMENT_LEVELS]);
    expect(defaultLevelsFor('fib-extension')).toEqual([...FIB_EXTENSION_LEVELS]);
    expect(defaultLevelsFor('percent-line')).toEqual([0, 0.5, 1]);
    expect(defaultLevelsFor('percent-line')).toEqual([...PERCENT_LEVELS]);
    // 副本：改动返回值不污染常量
    const d = defaultLevelsFor('fib')!;
    d.push(9);
    expect([...FIB_RETRACEMENT_LEVELS]).not.toContain(9);
  });

  it('其余工具（含 fib-auto / fan / arc / timezone）返回 null：不暴露自定义档位', () => {
    for (const id of ['fib-auto', 'fib-fan', 'fib-arc', 'fib-timezone', 'trendline', 'measure', 'gann-fan'] as const) {
      expect(defaultLevelsFor(id)).toBeNull();
    }
  });
});

// ---------- 渲染夹具（坐标可手算） ----------

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

function toPix(p: DrawingPoint, dctx: DrawContext): { x: number; y: number } {
  return {
    x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)),
    y: dctx.priceScale.priceToY(p.price),
  };
}

// ---------- 渲染：percent-line 自定义档位 ----------

describe('渲染：percent-line 档位覆盖', () => {
  it('levels = [0.25, 0.75]：只画 2 条线 + 2 个标签', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'percent-line', levels: [0.25, 0.75], points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawPercentLine(asCtx(ctx), d, pts, dctx, 2);
    expect(callsOf(ctx, 'stroke')).toHaveLength(2);
    expect(fillTexts(ctx)).toEqual(['25.0% 102.50', '75.0% 107.50']);
  });

  it('删档（levels = [0, 1]，去掉 50%）：无 50% 线与标签', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'percent-line', levels: [0, 1], points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawPercentLine(asCtx(ctx), d, pts, dctx, 2);
    expect(fillTexts(ctx)).toEqual(['0.0% 100.00', '100.0% 110.00']);
    expect(fillTexts(ctx)).not.toContain('50.0% 105.00');
  });

  it('加档（levels = [0, 0.25, 0.5, 0.75, 1]）：5 条线全部生效', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'percent-line', levels: [0, 0.25, 0.5, 0.75, 1], points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawPercentLine(asCtx(ctx), d, pts, dctx, 2);
    expect(callsOf(ctx, 'stroke')).toHaveLength(5);
    expect(fillTexts(ctx)).toEqual(['0.0% 100.00', '25.0% 102.50', '50.0% 105.00', '75.0% 107.50', '100.0% 110.00']);
  });

  it('levels 为 undefined：回退工具默认三档（0/50/100）', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'percent-line', points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawPercentLine(asCtx(ctx), d, pts, dctx, 2);
    expect(callsOf(ctx, 'stroke')).toHaveLength(3);
    expect(fillTexts(ctx)).toEqual(['0.0% 100.00', '50.0% 105.00', '100.0% 110.00']);
  });
});

// ---------- 渲染：fib 回撤 / 扩展自定义档位（经 drawDrawings 分发） ----------

describe('渲染：fib 家族档位覆盖', () => {
  it('fib levels = [0.5]：仅 1 条回撤线 + 50% 标签', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'fib', levels: [0.5], points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    drawDrawings(asCtx(ctx), [d], null, dctx, 2);
    expect(fillTexts(ctx)).toEqual(['50.0% 105.00']);
    expect(fillTexts(ctx)).not.toContain('23.6% 102.36');
  });

  it('fib levels 为 undefined：默认 7 档不变（回归保护）', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'fib', points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    drawDrawings(asCtx(ctx), [d], null, dctx, 2);
    expect(callsOf(ctx, 'stroke')).toHaveLength(7);
    expect(fillTexts(ctx)).toEqual([
      '0.0% 100.00',
      '23.6% 102.36',
      '38.2% 103.82',
      '50.0% 105.00',
      '61.8% 106.18',
      '78.6% 107.86',
      '100.0% 110.00',
    ]);
  });

  it('fib-extension levels = [0.5, 1.618]：仅 2 条扩展线', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'fib-extension',
      levels: [0.5, 1.618],
      points: [{ time: T0, price: 100 }, { time: T0 + 3 * IV, price: 110 }, { time: T0 + 5 * IV, price: 105 }],
    });
    drawDrawings(asCtx(ctx), [d], null, dctx, 2);
    // 锚点连线 2 条 + 水平比率线 2 条
    expect(callsOf(ctx, 'stroke')).toHaveLength(4);
    expect(fillTexts(ctx)).toEqual(['50.0% 110.00', '161.8% 121.18']);
    expect(fillTexts(ctx)).not.toContain('23.6% 107.36');
  });

  it('fib-extension levels 为 undefined：默认 9 档不变（回归保护）', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'fib-extension',
      points: [{ time: T0, price: 100 }, { time: T0 + 3 * IV, price: 110 }, { time: T0 + 5 * IV, price: 105 }],
    });
    drawDrawings(asCtx(ctx), [d], null, dctx, 2);
    expect(callsOf(ctx, 'stroke')).toHaveLength(11); // 锚线 2 + 水平线 9
    expect(fillTexts(ctx)).toContain('261.8% 131.18');
    expect(fillTexts(ctx)).toHaveLength(9);
  });
});

// ---------- 命中：档位与渲染一一对应 ----------

describe('命中：档位覆盖后与渲染一致', () => {
  it('percent 删档：50% 价位不再命中，0% 仍命中（锚线不受影响）', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'percent-line', levels: [0, 1], points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    // 取 x=440：在水平线组跨度 [372, 452] 内、锚对角线 x 跨度 [372, 412] 外（锚线几乎竖直，须避开其 x 区间）
    expect(hitTestPercentLine(d, pts, 440, priceScale.priceToY(105), dctx)).toBe(false); // 50% 已删
    expect(hitTestPercentLine(d, pts, 440, priceScale.priceToY(100), dctx)).toBe(true); // 0% 仍在
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    expect(hitTestPercentLine(d, pts, mid.x, mid.y, dctx)).toBe(true); // 锚线照常命中
  });

  it('percent 加档：25% 档位命中（drawDrawings 分发）', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'percent-line', levels: [0, 0.25, 0.5, 0.75, 1], points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    expect(hitTestDrawing(d, 392, priceScale.priceToY(102.5), dctx)).toEqual({ part: 'body' });
  });

  it('fib 自定义档位：0.236 不再命中，0.5 命中', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({ type: 'fib', levels: [0.5], points: [{ time: T0, price: 100 }, { time: T0 + 5 * IV, price: 110 }] });
    const y236 = priceScale.priceToY(fibRetracementPrice(100, 110, 0.236)); // 102.36（已删档）
    const y50 = priceScale.priceToY(fibRetracementPrice(100, 110, 0.5)); // 105
    // x=440：水平线组 [372, 452] 内、锚对角线 [372, 412] 外
    expect(hitTestDrawing(d, 440, y236, dctx)).toBeNull();
    expect(hitTestDrawing(d, 440, y50, dctx)).toEqual({ part: 'body' });
  });

  it('fib-extension 自定义档位：0.236 不再命中，1.618 命中', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({
      type: 'fib-extension',
      levels: [0.5, 1.618],
      points: [{ time: T0, price: 100 }, { time: T0 + 3 * IV, price: 110 }, { time: T0 + 5 * IV, price: 105 }],
    });
    const y236 = priceScale.priceToY(fibExtensionPrice(100, 110, 105, 0.236)); // 107.36（已删档）
    const y1618 = priceScale.priceToY(fibExtensionPrice(100, 110, 105, 1.618)); // 121.18
    expect(hitTestDrawing(d, 440, y236, dctx)).toBeNull();
    expect(hitTestDrawing(d, 440, y1618, dctx)).toEqual({ part: 'body' });
  });
});

// ---------- 持久化：DrawingLayer / 序列化 / 克隆 ----------

describe('持久化：levels 更新与往返', () => {
  const P = (time: number, price: number): DrawingPoint => ({ time, price });

  it('updateLevels 生效；撤销/重做按步回退（快照隔离，不共享数组引用）', () => {
    const layer = new DrawingLayer();
    const m = layer.add('percent-line', [P(1, 100), P(3, 110)]);
    expect(m.levels).toBeUndefined();
    layer.updateLevels(m.id, [0.25]);
    layer.updateLevels(m.id, [0.25, 0.75]);
    expect(layer.list()[0].levels).toEqual([0.25, 0.75]);
    layer.undo();
    expect(layer.list()[0].levels).toEqual([0.25]); // 回退到上一步（非共享引用被改写）
    layer.undo();
    expect(layer.list()[0].levels).toBeUndefined(); // 回到放置态（默认档）
    layer.redo();
    expect(layer.list()[0].levels).toEqual([0.25]);
  });

  it('updateLevels 对不存在的 id 静默返回', () => {
    const layer = new DrawingLayer();
    layer.updateLevels('nope', [0.5]);
    expect(layer.list()).toHaveLength(0);
  });

  it('序列化往返：levels 原样保留（顺序保持）', () => {
    const layer = new DrawingLayer();
    layer.add('percent-line', [P(1, 100), P(3, 110)]);
    layer.updateLevels(layer.list()[0].id, [0.75, 0.25, 1]);
    const restored = deserializeDrawings(serializeDrawings(layer.list()));
    expect(restored[0].levels).toEqual([0.75, 0.25, 1]);
  });

  it('克隆：自定义档位随对象复制（副本非共享引用）', () => {
    const layer = new DrawingLayer();
    const m = layer.add('fib', [P(1, 100), P(3, 110)]);
    layer.updateLevels(m.id, [0.5, 0.786]);
    const clone = layer.cloneDrawing(m.id)!;
    expect(clone.levels).toEqual([0.5, 0.786]);
    expect(clone.levels).not.toBe(m.levels);
  });

  it('未设置 levels 的对象：序列化不引入该字段', () => {
    const layer = new DrawingLayer();
    layer.add('fib', [P(1, 100), P(3, 110)]);
    const raw = serializeDrawings(layer.list());
    expect(raw).not.toContain('levels');
  });
});

// ---------- ChartRenderer 指针级端到端 ----------

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

/** 重绘后的百分比标签（坐标轴价格不含 %，可区分；重绘前清空记录，只保留本帧） */
function pctLabels(): string[] {
  return fillTexts(mock).filter((t) => t.includes('%'));
}

/** 清空 mock 记录后同步重绘（模拟 setting 变更后的一帧） */
function redrawFrame(r: ChartRenderer): void {
  mock.calls.length = 0;
  r.redraw();
}

describe('ChartRenderer：放置 → 设置改档 → 重绘（端到端）', () => {
  it('percent-line：改档后重绘只画新档，撤销恢复默认三档', () => {
    const r = makeRenderer();
    r.setActiveTool('percent-line');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    // 放置后默认三档
    redrawFrame(r);
    expect(pctLabels().some((t) => t.startsWith('50.0% '))).toBe(true);

    // 设置改档：[25%, 75%]
    r.updateDrawingLevels(id, [0.25, 0.75]);
    expect(r.listDrawings()[0].levels).toEqual([0.25, 0.75]);
    redrawFrame(r);
    expect(pctLabels().some((t) => t.startsWith('25.0% '))).toBe(true);
    expect(pctLabels().some((t) => t.startsWith('75.0% '))).toBe(true);
    expect(pctLabels().some((t) => t.startsWith('50.0% '))).toBe(false);

    // 撤销改档 → 回退默认三档
    r.undoDrawing();
    expect(r.listDrawings()[0].levels).toBeUndefined();
    redrawFrame(r);
    expect(pctLabels().some((t) => t.startsWith('50.0% '))).toBe(true);
    expect(pctLabels().some((t) => t.startsWith('25.0% '))).toBe(false);
  });

  it('fib：改档后重绘生效，导出/导入往返保留 levels', () => {
    const r = makeRenderer();
    r.setActiveTool('fib');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    r.updateDrawingLevels(id, [0.5, 1.618]);
    redrawFrame(r);
    expect(pctLabels().some((t) => t.startsWith('50.0% '))).toBe(true);
    expect(pctLabels().some((t) => t.startsWith('161.8% '))).toBe(true);
    expect(pctLabels().some((t) => t.startsWith('23.6% '))).toBe(false);

    const r2 = makeRenderer();
    r2.importDrawings(r.exportDrawings());
    expect(r2.listDrawings()[0].levels).toEqual([0.5, 1.618]);
    redrawFrame(r2);
    expect(pctLabels().some((t) => t.startsWith('161.8% '))).toBe(true);
  });

  it('percent-line：改档后指针命中跟随新档位（删档不再选中、留档可选中）', () => {
    const r = makeRenderer();
    r.setActiveTool('percent-line');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    // 锚点像素即落点（300,300)/(500,400)；50% 档价 = 两锚点价中点 → 线性价尺下像素 y = 350
    click(50, 50); // 空白处取消放置后的自带选中
    click(380, 350); // 默认三档：50% 水平线上 → 选中
    expect(r.selectedDrawingId).toBe(id);

    // 删掉 50% 档，只留两端锚点价
    r.updateDrawingLevels(id, [0, 1]);
    click(60, 60);
    click(380, 350); // 50% 线已删（距锚对角线 ≈8.9px > 6px 容差）→ 不选中
    expect(r.selectedDrawingId).toBeNull();
    click(380, 300); // 0% 档（起点锚点价）仍在 → 选中
    expect(r.selectedDrawingId).toBe(id);
  });
});
