// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, getToolDef, DRAWING_TOOLS } from '@/engine/drawing/types';
import {
  arcThroughThreePoints,
  cubicBezierPoint,
  insertPolygonVertex,
  pointInPolygon,
  polygonEdgeHit,
  removePolygonVertex,
  sampleArc,
  sampleCubicBezier,
  type Pix,
} from '@/engine/drawing/shapeMath';
import { drawShapes, hitTestShapes } from '@/engine/drawing/shapeRender';
import { createMockCtx, asCtx, callsOf, hasCall, hasPair } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';

/**
 * P2-B 几何 3 种单测：多边形（N 顶点）/ 圆弧（三点定圆）/ 曲线（三次贝塞尔）。
 * - shapeMath：顶点运算 / 三点定圆 / 贝塞尔采样（golden 手算）
 * - shapeRender：canvas mock 绘制序列 + 命中
 * - ChartRenderer：落点（含多边形双击/回车收尾）、顶点拖拽、序列化、撤销
 */

const P = (time: number, price: number): DrawingPoint => ({ time, price });

// ---------- shapeMath：多边形顶点运算 ----------

const SQUARE: Pix[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('pointInPolygon（射线法）', () => {
  it('内部 true，外部 false', () => {
    expect(pointInPolygon(5, 5, SQUARE)).toBe(true);
    expect(pointInPolygon(15, 5, SQUARE)).toBe(false);
    expect(pointInPolygon(5, -1, SQUARE)).toBe(false);
  });
  it('三角形内部与凹多边形', () => {
    const tri: Pix[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(pointInPolygon(10, 2, tri)).toBe(true);
    expect(pointInPolygon(2, 8, tri)).toBe(false);
  });
});

describe('polygonEdgeHit / insert / remove', () => {
  it('命中边返回起点下标（插入到其后；角落附近优先先遍历的边）', () => {
    expect(polygonEdgeHit(SQUARE, 5, 0.5, 3)).toBe(0); // 上边
    expect(polygonEdgeHit(SQUARE, 10.5, 5, 3)).toBe(1); // 右边
    expect(polygonEdgeHit(SQUARE, 5, 10.5, 3)).toBe(2); // 下边
    expect(polygonEdgeHit(SQUARE, -0.5, 5, 3)).toBe(3); // 左边（闭合边）
    expect(polygonEdgeHit(SQUARE, 30, 30, 3)).toBe(-1); // 未命中
    expect(polygonEdgeHit(SQUARE, 10.5, 0.5, 6)).toBe(0); // 角落：先遍历的边优先
  });

  it('插入顶点：afterIndex 之后；越界夹到边界', () => {
    expect(insertPolygonVertex(SQUARE, 0, { x: 5, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(insertPolygonVertex(SQUARE, -1, { x: -5, y: -5 })).toEqual([{ x: -5, y: -5 }, ...SQUARE]);
    expect(insertPolygonVertex(SQUARE, 99, { x: 99, y: 99 })).toEqual([...SQUARE, { x: 99, y: 99 }]);
  });

  it('删除顶点：少于 3 个不删；越界下标原样返回', () => {
    expect(removePolygonVertex(SQUARE, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    const tri: Pix[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(removePolygonVertex(tri, 0)).toEqual(tri); // 3 顶点不再删
    expect(removePolygonVertex(SQUARE, 9)).toEqual(SQUARE); // 越界
    expect(removePolygonVertex(SQUARE, -1)).toEqual(SQUARE);
  });

  it('插入 + 删除往返回到原状', () => {
    const five = insertPolygonVertex(SQUARE, 0, { x: 5, y: 0 });
    expect(five).toHaveLength(5);
    expect(removePolygonVertex(five, 1)).toEqual(SQUARE);
  });
});

// ---------- shapeMath：三点定圆 ----------

describe('arcThroughThreePoints', () => {
  it('单位圆上三点：圆心原点、半径 1、经过第 3 点的有向扫掠', () => {
    // p0=(1,0) p1=(0,1) p2=(-1,0)：劣弧不经 p2 → 顺时针扫掠 -3π/2（经过 (0,-1) 与 (-1,0)）
    const arc = arcThroughThreePoints({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 })!;
    expect(arc).not.toBeNull();
    expect(arc.cx).toBeCloseTo(0, 12);
    expect(arc.cy).toBeCloseTo(0, 12);
    expect(arc.r).toBeCloseTo(1, 12);
    expect(arc.a0).toBeCloseTo(0, 12);
    expect(arc.sweep).toBeCloseTo(-1.5 * Math.PI, 12);
  });

  it('另一方向：增角扫掠 +3π/2', () => {
    const arc = arcThroughThreePoints({ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 })!;
    expect(arc.sweep).toBeCloseTo(1.5 * Math.PI, 12);
  });

  it('半圆（第 3 点在中点上）：扫掠 = π', () => {
    // 圆心 (5,0) 半径 5；p0=(10,0) p1=(0,0) p2=(5,5)
    const arc = arcThroughThreePoints({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 })!;
    expect(arc.cx).toBeCloseTo(5, 12);
    expect(arc.r).toBeCloseTo(5, 12);
    expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI, 12);
  });

  it('三点共线返回 null（调用方退化为直线）', () => {
    expect(arcThroughThreePoints({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });

  it('端点重合返回 null', () => {
    expect(arcThroughThreePoints({ x: 1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeNull();
  });

  it('采样折线首尾 = 弧端点，弧经过第 3 点', () => {
    const p0 = { x: 1, y: 0 };
    const p1 = { x: 0, y: 1 };
    const p2 = { x: -1, y: 0 };
    const arc = arcThroughThreePoints(p0, p1, p2)!;
    const poly = sampleArc(arc, 24);
    expect(poly).toHaveLength(25);
    expect(poly[0].x).toBeCloseTo(p0.x, 9);
    expect(poly[0].y).toBeCloseTo(p0.y, 9);
    expect(poly[24].x).toBeCloseTo(p1.x, 9);
    expect(poly[24].y).toBeCloseTo(p1.y, 9);
    // 扫掠 -3π/2：t=1/2 在角 -3π/4（左上），t=2/3 过第 3 点 (-1,0)
    const mid = poly[12];
    expect(mid.x).toBeLessThan(0);
    expect(poly[16].x).toBeCloseTo(p2.x, 9);
    expect(poly[16].y).toBeCloseTo(p2.y, 9);
  });
});

// ---------- shapeMath：三次贝塞尔 ----------

describe('cubicBezierPoint / sampleCubicBezier', () => {
  const p0 = { x: 0, y: 0 };
  const c0 = { x: 0, y: 10 };
  const c1 = { x: 10, y: 10 };
  const p1 = { x: 10, y: 0 };

  it('t=0/1 为锚点；t=0.5 = (5, 7.5)', () => {
    expect(cubicBezierPoint(p0, c0, c1, p1, 0)).toEqual({ x: 0, y: 0 });
    expect(cubicBezierPoint(p0, c0, c1, p1, 1)).toEqual({ x: 10, y: 0 });
    const mid = cubicBezierPoint(p0, c0, c1, p1, 0.5);
    expect(mid.x).toBeCloseTo(5, 12);
    expect(mid.y).toBeCloseTo(7.5, 12);
  });

  it('采样：segments+1 个点，首尾锚点', () => {
    const poly = sampleCubicBezier(p0, c0, c1, p1, 2);
    expect(poly).toHaveLength(3);
    expect(poly[1]).toEqual({ x: 5, y: 7.5 });
  });
});

// ---------- 工具注册表 ----------

describe('P2-B 几何工具注册', () => {
  it('锚点数：多边形 0（任意）/ 圆弧 3 / 曲线 4', () => {
    expect(getToolDef('polygon').points).toBe(0);
    expect(getToolDef('arc').points).toBe(3);
    expect(getToolDef('curve').points).toBe(4);
    expect(getToolDef('polygon').defaultStyle.fillColor).toBe('#2962ff22');
    expect(DRAWING_TOOLS).toHaveLength(30);
  });
});

// ---------- shapeRender：canvas mock ----------

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

function drawing(d: Partial<Drawing> & { type: Drawing['type']; points: DrawingPoint[] }): Drawing {
  return { id: 'd1', locked: false, visible: true, style: { color: '#2962ff', lineWidth: 1 }, ...d } as Drawing;
}

describe('drawShapes：多边形', () => {
  it('≥3 顶点：闭合路径 + 填充 + 描边', () => {
    const ctx = createMockCtx();
    const pts: Pix[] = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 150, y: 200 },
    ];
    drawShapes(asCtx(ctx), drawing({ type: 'polygon', points: [] }), pts);
    expect(hasPair(ctx, 'moveTo', [100, 100], 'lineTo', [200, 100])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [200, 100], 'lineTo', [150, 200])).toBe(false); // moveTo 只在起点
    expect(callsOf(ctx, 'closePath')).toHaveLength(1);
    expect(callsOf(ctx, 'fill')).toHaveLength(1);
    expect(callsOf(ctx, 'stroke')).toHaveLength(1);
  });

  it('2 顶点（放置预览）：开口折线，不闭合不填充', () => {
    const ctx = createMockCtx();
    const pts: Pix[] = [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ];
    drawShapes(asCtx(ctx), drawing({ type: 'polygon', points: [] }), pts);
    expect(callsOf(ctx, 'closePath')).toHaveLength(0);
    expect(callsOf(ctx, 'fill')).toHaveLength(0);
    expect(hasPair(ctx, 'moveTo', [100, 100], 'lineTo', [200, 150])).toBe(true);
  });
});

describe('drawShapes：圆弧', () => {
  it('三点：ellipse 圆心/半径/起角/有向扫掠', () => {
    const ctx = createMockCtx();
    const pts: Pix[] = [
      { x: 150, y: 100 },
      { x: 250, y: 150 },
      { x: 150, y: 200 },
    ];
    drawShapes(asCtx(ctx), drawing({ type: 'arc', points: [] }), pts);
    const arc = arcThroughThreePoints(pts[0], pts[1], pts[2])!;
    expect(hasCall(ctx, 'ellipse', [arc.cx, arc.cy, arc.r, arc.r, 0, arc.a0, arc.a0 + arc.sweep, arc.sweep < 0])).toBe(true);
    expect(callsOf(ctx, 'stroke')).toHaveLength(1);
  });

  it('共线退化：画弦（折线）', () => {
    const ctx = createMockCtx();
    const pts: Pix[] = [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
      { x: 300, y: 300 },
    ];
    drawShapes(asCtx(ctx), drawing({ type: 'arc', points: [] }), pts);
    expect(callsOf(ctx, 'ellipse')).toHaveLength(0);
    expect(hasPair(ctx, 'moveTo', [100, 100], 'lineTo', [200, 200])).toBe(true);
    expect(hasCall(ctx, 'lineTo', [300, 300])).toBe(true); // 共线三点成一条直线
  });

  it('2 顶点（放置预览）：画弦', () => {
    const ctx = createMockCtx();
    const pts: Pix[] = [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ];
    drawShapes(asCtx(ctx), drawing({ type: 'arc', points: [] }), pts);
    expect(callsOf(ctx, 'ellipse')).toHaveLength(0);
    expect(hasPair(ctx, 'moveTo', [100, 100], 'lineTo', [200, 150])).toBe(true);
  });
});

describe('drawShapes：曲线（贝塞尔）', () => {
  it('4 点：bezierCurveTo(锚点 + 双控制柄)', () => {
    const ctx = createMockCtx();
    const pts: Pix[] = [
      { x: 100, y: 100 },
      { x: 150, y: 50 },
      { x: 250, y: 250 },
      { x: 300, y: 200 },
    ];
    drawShapes(asCtx(ctx), drawing({ type: 'curve', points: [] }), pts);
    expect(hasPair(ctx, 'moveTo', [100, 100], 'bezierCurveTo', [150, 50, 250, 250, 300, 200])).toBe(true);
    expect(callsOf(ctx, 'stroke')).toHaveLength(1);
  });

  it('不足 4 点（放置预览）：折线', () => {
    const ctx = createMockCtx();
    const pts: Pix[] = [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ];
    drawShapes(asCtx(ctx), drawing({ type: 'curve', points: [] }), pts);
    expect(callsOf(ctx, 'bezierCurveTo')).toHaveLength(0);
    expect(hasPair(ctx, 'moveTo', [100, 100], 'lineTo', [200, 150])).toBe(true);
  });
});

// ---------- shapeRender：命中 ----------

describe('hitTestShapes', () => {
  const tri: Pix[] = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 150, y: 200 },
  ];

  it('多边形：内部 / 边 ±6px / 外部', () => {
    const d = drawing({ type: 'polygon', points: [] });
    expect(hitTestShapes(d, tri, 150, 130)).toBe(true); // 内部
    expect(hitTestShapes(d, tri, 150, 101)).toBe(true); // 上边 ±6
    expect(hitTestShapes(d, tri, 150, 300)).toBe(false); // 外部
  });

  it('圆弧：弧上命中，弧外不中', () => {
    const pts: Pix[] = [
      { x: 150, y: 100 },
      { x: 250, y: 150 },
      { x: 150, y: 200 },
    ];
    const d = drawing({ type: 'arc', points: [] });
    const arc = arcThroughThreePoints(pts[0], pts[1], pts[2])!;
    const poly = sampleArc(arc, 24);
    const mid = poly[12];
    expect(hitTestShapes(d, pts, mid.x, mid.y)).toBe(true);
    expect(hitTestShapes(d, pts, mid.x + 60, mid.y + 60)).toBe(false);
  });

  it('曲线：曲线上命中，曲线外不中', () => {
    const pts: Pix[] = [
      { x: 100, y: 100 },
      { x: 150, y: 50 },
      { x: 250, y: 250 },
      { x: 300, y: 200 },
    ];
    const d = drawing({ type: 'curve', points: [] });
    const mid = sampleCubicBezier(pts[0], pts[1], pts[2], pts[3], 32)[16];
    expect(hitTestShapes(d, pts, mid.x, mid.y)).toBe(true);
    expect(hitTestShapes(d, pts, 10, 280)).toBe(false);
  });

  it('非几何类型返回 false', () => {
    expect(hitTestShapes(drawing({ type: 'rect', points: [] }), tri, 150, 130)).toBe(false);
  });
});

// ---------- DrawingLayer：序列化 / 撤销 ----------

describe('几何工具：序列化/撤销（DrawingLayer）', () => {
  it('三类序列化往返 + 撤销', () => {
    const layer = new DrawingLayer();
    layer.add('polygon', [P(1, 100), P(2, 110), P(3, 105)]);
    layer.add('arc', [P(1, 100), P(2, 110), P(3, 105)]);
    layer.add('curve', [P(1, 100), P(2, 90), P(3, 120), P(4, 110)]);
    const restored = deserializeDrawings(serializeDrawings(layer.list()));
    expect(restored.map((d) => d.type)).toEqual(['polygon', 'arc', 'curve']);
    expect(restored[0].points).toHaveLength(3);
    expect(restored[2].points).toHaveLength(4);
    layer.undo();
    expect(layer.list().map((d) => d.type)).toEqual(['polygon', 'arc']);
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

describe('ChartRenderer：几何工具落点全链路', () => {
  it('多边形：3 次点击 + 回车收尾，N 顶点落成', () => {
    const r = makeRenderer();
    r.setActiveTool('polygon');
    click(300, 300);
    click(400, 300);
    click(350, 400);
    expect(r.listDrawings()).toHaveLength(0); // 未收尾前不落成
    r.finishPlacing(); // 回车/双击
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('polygon');
    expect(list[0].points).toHaveLength(3);
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('多边形：Esc 取消放置（不落成）', () => {
    const r = makeRenderer();
    r.setActiveTool('polygon');
    click(300, 300);
    click(400, 300);
    r.cancelPlacing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('多边形：放置后点击内部命中 → 选中', () => {
    const r = makeRenderer();
    r.setActiveTool('polygon');
    click(300, 300);
    click(400, 300);
    click(350, 400);
    r.finishPlacing();
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    click(350, 350); // 三角形内部
    expect(r.selectedDrawingId).toBe(id);
  });

  it('多边形：顶点手柄拖拽改变该顶点坐标', () => {
    const r = makeRenderer();
    r.setActiveTool('polygon');
    click(300, 300);
    click(400, 300);
    click(350, 400);
    r.finishPlacing();
    r.setActiveTool(null);
    const before = r.listDrawings()[0].points.map((p) => ({ ...p }));
    // 按下顶点 0（手柄命中半径 7px）并拖拽
    ptr('pointerdown', 300, 300);
    ptr('pointermove', 330, 330);
    ptr('pointerup', 330, 330);
    const after = r.listDrawings()[0].points;
    expect(after[0].time).not.toBe(before[0].time);
    expect(after[0].price).not.toBe(before[0].price);
    expect(after[1]).toEqual(before[1]); // 其他顶点不动
  });

  it('圆弧：3 次点击落成（非共线）', () => {
    const r = makeRenderer();
    r.setActiveTool('arc');
    click(300, 300);
    click(400, 350);
    click(350, 250);
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('arc');
    expect(list[0].points).toHaveLength(3);
  });

  it('曲线：4 次点击落成（贝塞尔锚点 + 控制柄）', () => {
    const r = makeRenderer();
    r.setActiveTool('curve');
    click(300, 300);
    click(350, 250);
    click(450, 350);
    click(500, 300);
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('curve');
    expect(list[0].points).toHaveLength(4);
  });

  it('导出/导入：三类几何工具序列化往返', () => {
    const r = makeRenderer();
    r.setActiveTool('polygon');
    click(300, 300);
    click(400, 300);
    click(350, 400);
    r.finishPlacing();
    r.setActiveTool('arc');
    click(300, 300);
    click(400, 350);
    click(350, 250);
    r.setActiveTool('curve');
    click(300, 300);
    click(350, 250);
    click(450, 350);
    click(500, 300);
    r.setActiveTool(null);
    const r2 = makeRenderer();
    r2.importDrawings(r.exportDrawings());
    expect(r2.listDrawings().map((d) => d.type)).toEqual(['polygon', 'arc', 'curve']);
  });
});
