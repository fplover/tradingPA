// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingGesture, type DrawingHost } from '@/engine/renderer/DrawingGesture';
import {
  POLY_EDGE_HIT_PX,
  POLY_VERTEX_HIT_PX,
  applyPolygonEdit,
  polygonEditHit,
} from '@/engine/drawing/polygonEdit';
import type { DrawingPoint } from '@/engine/drawing/types';
import { createMockCtx, asCtx, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';

/**
 * P2-B 遗留接线①：多边形工具态顶点「增」交互单测。
 * - polygonEdit：命中判定（顶点优先于边 / ≥3 删除下限）与几何应用（纯函数）
 * - DrawingGesture：磁吸两档对新顶点生效、撤销步数、放置中/无选中/锁定不消费
 * - ChartRenderer：指针级端到端（工具态点边插点、点顶点删点、Esc/切工具不变、序列化往返）
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

const P = (time: number, price: number): DrawingPoint => ({ time, price });

// ---------- polygonEdit 纯函数 ----------

const SQUARE_PIX = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const SQUARE_WORLD = SQUARE_PIX.map((p, i) => P(i, p.x * 10 + p.y));

describe('polygonEditHit：命中判定', () => {
  it('边容差内 → insert（afterIndex = 边起点下标）', () => {
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, 50, 0.5, P(9, 9))).toEqual({ kind: 'insert', afterIndex: 0, pt: P(9, 9) });
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, 50, 100.5, P(9, 9))).toEqual({ kind: 'insert', afterIndex: 2, pt: P(9, 9) });
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, -0.5, 50, P(9, 9))).toEqual({ kind: 'insert', afterIndex: 3, pt: P(9, 9) }); // 闭合边
  });

  it('边容差外 → null（未命中，照常放置）', () => {
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, 50, 30, P(9, 9))).toBeNull(); // 内部但离边 >6px
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, 50, POLY_EDGE_HIT_PX + 1, P(9, 9))).toBeNull();
  });

  it('顶点半径内 → remove（4 顶点）', () => {
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, 100.5, 0.5, P(9, 9))).toEqual({ kind: 'remove', index: 1 });
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, 0, POLY_VERTEX_HIT_PX, P(9, 9))).toEqual({ kind: 'remove', index: 0 });
  });

  it('顶点数 ≤3 → reject（拒绝删除，保持原状）', () => {
    const triWorld = SQUARE_WORLD.slice(0, 3);
    const triPix = SQUARE_PIX.slice(0, 3);
    expect(polygonEditHit(triWorld, triPix, 0.5, 0.5, P(9, 9))).toEqual({ kind: 'reject' });
  });

  it('角落处顶点优先于边（删优先于插）', () => {
    // (100,0.5)：顶点 1 半径内且上边容差内 → remove 而非 insert
    expect(polygonEditHit(SQUARE_WORLD, SQUARE_PIX, 100, 0.5, P(9, 9))).toEqual({ kind: 'remove', index: 1 });
  });
});

describe('applyPolygonEdit：几何应用', () => {
  it('insert：afterIndex 之后插入，其余顶点不变', () => {
    const next = applyPolygonEdit(SQUARE_WORLD, { kind: 'insert', afterIndex: 0, pt: P(9, 9) });
    expect(next).toHaveLength(5);
    expect(next[1]).toEqual(P(9, 9));
    expect(next.filter((p) => p !== next[1])).toEqual(SQUARE_WORLD);
  });

  it('remove：按下标删除', () => {
    expect(applyPolygonEdit(SQUARE_WORLD, { kind: 'remove', index: 1 })).toEqual([SQUARE_WORLD[0], SQUARE_WORLD[2], SQUARE_WORLD[3]]);
  });
});

// ---------- DrawingGesture 级（可控标尺：验证磁吸两档） ----------

const CHART_W = 1216;
const CHART_H = 776;

/** 恒定 OHLC 的 K 线（open=100/high=101/low=99/close=100），磁吸期望可手算 */
function flatBars(n = 300): Bar[] {
  const out: Bar[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({ time: T0 + i * IV, open: 100, high: 101, low: 99, close: 100, volume: 100 });
  }
  return out;
}

interface GestureSetup {
  g: DrawingGesture;
  dctx: { viewport: Viewport; priceScale: PriceScale; series: BarSeries; geo: { chartW: number; chartH: number } };
  notify: ReturnType<typeof vi.fn>;
}

function gestureSetup(): GestureSetup {
  const series = new BarSeries();
  series.replace(flatBars());
  const viewport = new Viewport(CHART_W);
  viewport.setBarCount(series.length);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(CHART_H);
  priceScale.setRange(90, 110); // 20 单位 / 776px → 1px ≈ 0.0258 单位；OHLC 跨度 2 ≈ 77.6px
  const dctx = { viewport, priceScale, series, geo: { chartW: CHART_W, chartH: CHART_H } };
  const notify = vi.fn();
  const host: DrawingHost = {
    drawingCtx: () => dctx,
    mainPaneY: () => 0,
    viewport,
    displaySeries: () => series,
    chartW: () => CHART_W,
    drawingsLocked: () => false,
    invalidate: () => {},
    notifyDrawings: notify,
    requestDrawingsNotify: vi.fn(),
  };
  return { g: new DrawingGesture(host), dctx, notify };
}

/** 以像素坐标放置一个多边形（世界坐标由像素反推，几何关系确定）并激活多边形工具 */
function placePolygonPix(setup: GestureSetup, pix: Array<{ x: number; y: number }>): void {
  const { g, dctx } = setup;
  const pts = pix.map((p) => {
    const idx = Math.round(dctx.viewport.xToIndex(p.x));
    const bar = dctx.series.barAt(idx)!;
    return { time: bar.time, price: dctx.priceScale.yToPrice(p.y) };
  });
  g.layer.add('polygon', pts);
  g.setTool('polygon');
  setup.notify.mockClear(); // setTool 自带一次广播，清零后只计量顶点编辑的广播
}

describe('DrawingGesture：多边形顶点编辑（工具态）', () => {
  it('点上边（磁吸 off）→ 插入新顶点，世界坐标 = 落点换算值', () => {
    const s = gestureSetup();
    placePolygonPix(s, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    const before = s.g.layer.list()[0].points.map((p) => ({ ...p }));
    s.g.place(200, 368, 0, false); // 上边中点（两侧顶点 100px 外）
    const pts = s.g.layer.list()[0].points;
    expect(pts).toHaveLength(4);
    expect(pts[1].price).toBeCloseTo(s.dctx.priceScale.yToPrice(368), 9);
    expect(pts[0]).toEqual(before[0]);
    expect(pts[2]).toEqual(before[1]);
    expect(pts[3]).toEqual(before[2]);
    expect(s.notify).toHaveBeenCalledTimes(1);
  });

  it('磁吸 strong：新顶点吸附到最近 OHLC', () => {
    const s = gestureSetup();
    s.g.layer.setMagnet(true);
    s.g.layer.setMagnetMode('strong');
    placePolygonPix(s, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    s.g.place(200, 368, 0, false);
    const inserted = s.g.layer.list()[0].points[1];
    // 落点价 100.52，最近 OHLC = 101（距离 < 50px）→ 吸附
    expect(inserted.price).toBe(101);
  });

  it('磁吸 weak：50px 内吸附、外不吸附（两档语义对新顶点同生效）', () => {
    const near = gestureSetup();
    near.g.layer.setMagnet(true);
    near.g.layer.setMagnetMode('weak');
    placePolygonPix(near, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    near.g.place(200, 368, 0, false); // 落点价 100.52，距 101 约 18.6px < 50 → 吸附
    expect(near.g.layer.list()[0].points[1].price).toBe(101);

    const far = gestureSetup();
    far.g.layer.setMagnet(true);
    far.g.layer.setMagnetMode('weak');
    placePolygonPix(far, [
      { x: 100, y: 268 },
      { x: 300, y: 268 },
      { x: 200, y: 600 },
    ]);
    far.g.place(200, 268, 0, false); // 落点价 ≈103.09，距 101 约 81px > 50 → 不吸附
    expect(far.g.layer.list()[0].points[1].price).toBeCloseTo(far.dctx.priceScale.yToPrice(268), 9);
  });

  it('插入 = 单步撤销：undo 恢复原三点', () => {
    const s = gestureSetup();
    placePolygonPix(s, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    const before = s.g.layer.list()[0].points.map((p) => ({ ...p }));
    s.g.place(200, 368, 0, false);
    expect(s.g.layer.list()[0].points).toHaveLength(4);
    s.g.layer.undo();
    expect(s.g.layer.list()[0].points).toEqual(before);
    s.g.layer.undo(); // 再一步 = 移除整个多边形（add 的快照）
    expect(s.g.layer.list()).toHaveLength(0);
  });

  it('删除顶点（4→3）= 单步撤销；3 顶点拒绝且坐标不变', () => {
    const s = gestureSetup();
    placePolygonPix(s, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 300, y: 500 },
      { x: 100, y: 500 },
    ]);
    const before = s.g.layer.list()[0].points.map((p) => ({ ...p }));
    s.g.place(100.5, 368.5, 0, false); // 顶点 0 半径内
    expect(s.g.layer.list()[0].points).toHaveLength(3);
    s.g.layer.undo();
    expect(s.g.layer.list()[0].points).toEqual(before);

    const tri = gestureSetup();
    placePolygonPix(tri, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    const triBefore = tri.g.layer.list()[0].points.map((p) => ({ ...p }));
    tri.g.place(100.5, 368.5, 0, false); // 3 顶点下限：拒绝
    expect(tri.g.layer.list()[0].points).toEqual(triBefore);
    tri.g.layer.undo(); // 拒绝未入撤销栈 → 撤销的是 add 的快照（整个多边形消失）
    expect(tri.g.layer.list()).toHaveLength(0);
  });

  it('放置中 / 无选中 / 锁定 → 不消费，照常累积新多边形放置', () => {
    // 放置中：点击旧多边形的边也只是新多边形的第二个锚点
    const mid = gestureSetup();
    placePolygonPix(mid, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    const before = mid.g.layer.list()[0].points.map((p) => ({ ...p }));
    mid.g.place(600, 200, 0, false); // 新多边形第一点
    mid.g.place(200, 368, 0, false); // 旧多边形边上（放置中 → 不编辑）
    expect(mid.g.layer.list()[0].points).toEqual(before);
    expect(mid.g.placingPoints).toHaveLength(2);

    // 无选中
    const none = gestureSetup();
    placePolygonPix(none, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    none.g.layer.select(null);
    none.g.place(200, 368, 0, false);
    expect(none.g.placingPoints).toHaveLength(1); // 未消费 → 新放置
    expect(none.g.layer.list()[0].points).toHaveLength(3);

    // 锁定
    const locked = gestureSetup();
    placePolygonPix(locked, [
      { x: 100, y: 368 },
      { x: 300, y: 368 },
      { x: 200, y: 600 },
    ]);
    locked.g.layer.setLocked(locked.g.layer.list()[0].id, true);
    locked.g.place(200, 368, 0, false);
    expect(locked.g.placingPoints).toHaveLength(1);
    expect(locked.g.layer.list()[0].points).toHaveLength(3);
  });

  it('非多边形选中对象 → 不消费', () => {
    const s = gestureSetup();
    s.g.layer.add('rect', [P(T0 + IV, 100), P(T0 + 2 * IV, 101)]);
    s.g.setTool('polygon');
    s.g.place(200, 368, 0, false);
    expect(s.g.placingPoints).toHaveLength(1);
    expect(s.g.layer.list()[0].points).toHaveLength(2);
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

/** 放置一个三角形多边形（工具态 3 击 + 收尾），保持多边形工具激活 */
function placeTriangle(r: ChartRenderer): void {
  r.setActiveTool('polygon');
  click(300, 300);
  click(400, 300);
  click(350, 400);
  r.finishPlacing();
}

describe('ChartRenderer：多边形顶点增删端到端', () => {
  it('工具态点边 → 插入顶点；点顶点 → 删除；各为单步撤销', () => {
    const r = makeRenderer();
    placeTriangle(r);
    const id = r.listDrawings()[0].id;
    const before = r.listDrawings()[0].points.map((p) => ({ ...p }));

    click(350, 300); // 上边（300,300)-(400,300) 中点
    expect(r.listDrawings()[0].points).toHaveLength(4);
    r.undoDrawing(); // 一步恢复（undo 同时清空选中，需重新选中再编辑）
    expect(r.listDrawings()[0].points).toEqual(before);
    r.selectDrawing(id);

    click(300, 300); // 顶点 0（3 顶点 → 拒绝删除，保持原状）
    expect(r.listDrawings()[0].points).toEqual(before);

    click(350, 300); // 再插一个 → 4 顶点
    expect(r.listDrawings()[0].points).toHaveLength(4);
    click(300, 300); // 顶点 0（4 顶点 → 可删）
    expect(r.listDrawings()[0].points).toHaveLength(3);
    r.undoDrawing();
    expect(r.listDrawings()[0].points).toHaveLength(4);
  });

  it('插入/删除后序列化往返保留顶点', () => {
    const r = makeRenderer();
    placeTriangle(r);
    click(350, 300);
    click(500, 450); // 空白处 → 累积新多边形放置（不影响已编辑对象）
    const raw = r.exportDrawings();
    const r2 = makeRenderer();
    r2.importDrawings(raw);
    expect(r2.listDrawings()[0].points).toHaveLength(4);
    expect(r2.listDrawings()[0].points.map((p) => ({ ...p }))).toEqual(r.listDrawings()[0].points.map((p) => ({ ...p })));
  });

  it('工具态外（光标模式）点边不编辑，仅命中选中', () => {
    const r = makeRenderer();
    placeTriangle(r);
    r.setActiveTool(null);
    const before = r.listDrawings()[0].points.map((p) => ({ ...p }));
    click(350, 300);
    expect(r.listDrawings()[0].points).toEqual(before);
    expect(r.selectedDrawingId).toBe(r.listDrawings()[0].id);
  });

  it('Esc 取消放置/选择：顶点编辑态下行为不变', () => {
    const r = makeRenderer();
    placeTriangle(r);
    const before = r.listDrawings()[0].points.map((p) => ({ ...p }));
    r.cancelPlacing();
    expect(r.selectedDrawingId).toBeNull();
    expect(r.listDrawings()[0].points).toEqual(before);
  });

  it('放置中途点击旧多边形边：不加顶点，只累积新放置', () => {
    const r = makeRenderer();
    placeTriangle(r);
    const before = r.listDrawings()[0].points.map((p) => ({ ...p }));
    click(600, 200); // 新多边形第一点
    click(350, 300); // 旧多边形边上（放置中）
    expect(r.listDrawings()[0].points).toEqual(before);
    click(650, 250); // 第三点
    r.finishPlacing();
    expect(r.listDrawings()).toHaveLength(2);
    expect(r.listDrawings()[1].points).toHaveLength(3);
    expect(r.listDrawings()[0].points).toEqual(before);
  });

  it('磁吸 strong：新顶点吸附到落点 bar 的 OHLC', () => {
    const r = makeRenderer();
    placeTriangle(r);
    r.setMagnet(true);
    r.setMagnetMode('strong');
    click(350, 300);
    const inserted = r.listDrawings()[0].points[1];
    const bar = r.getBars().find((b) => b.time === inserted.time)!;
    expect([bar.open, bar.high, bar.low, bar.close]).toContain(inserted.price);
  });
});
