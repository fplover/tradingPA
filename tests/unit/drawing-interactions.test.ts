// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Bar } from '@/types/market';
import type { DrawingPoint } from '@/engine/drawing/types';
import { createMockCtx, asCtx } from './helpers/mock-ctx';

/**
 * B7 画线交互单测（DrawingLayer 层）：
 * Ctrl+拖动克隆 / Ctrl+点击多选 / 多选整体平移 / 删除 / 撤销栈完整性。
 * ChartRenderer 指针级集成用例见同文件后半（jsdom）。
 */

const P = (time: number, price: number): DrawingPoint => ({ time, price });

describe('DrawingLayer 多选与克隆', () => {
  it('Ctrl+拖动克隆：产生新对象，原对象坐标与样式不变，克隆体被选中', () => {
    const layer = new DrawingLayer();
    const src = layer.add('trendline', [P(1, 100), P(2, 110)], { color: '#ff0000' });
    const before = layer.list()[0].points.map((p) => ({ ...p }));

    layer.beginHistory();
    const clone = layer.cloneDrawing(src.id);

    expect(clone).not.toBeNull();
    expect(clone!.id).not.toBe(src.id);
    expect(clone!.type).toBe('trendline');
    expect(clone!.points).toEqual(src.points); // 同位置
    expect(clone!.style.color).toBe('#ff0000');
    // 原对象坐标不动（深比较）
    expect(layer.list()[0].points).toEqual(before);
    expect(layer.list().length).toBe(2);
    // 克隆体进入选中
    expect(layer.selected?.id).toBe(clone!.id);
  });

  it('克隆 + 拖拽为单步撤销：一次 undo 克隆体消失，原对象保留', () => {
    const layer = new DrawingLayer();
    const src = layer.add('hline', [P(1, 100)]);

    layer.beginHistory();
    const clone = layer.cloneDrawing(src.id)!;
    layer.updatePoints(clone.id, [P(1, 130)]); // 拖拽中连续更新
    layer.updatePoints(clone.id, [P(1, 150)]);
    expect(layer.list().length).toBe(2);

    layer.undo();
    expect(layer.list().length).toBe(1);
    expect(layer.list()[0].id).toBe(src.id);
    expect(layer.list()[0].points[0].price).toBe(100);
  });

  it('克隆不存在的 id 返回 null', () => {
    const layer = new DrawingLayer();
    expect(layer.cloneDrawing('dw_999')).toBeNull();
  });

  it('toggleSelect：Ctrl+点击增删多选集合', () => {
    const layer = new DrawingLayer();
    const a = layer.add('hline', [P(1, 100)]);
    const b = layer.add('hline', [P(2, 200)]);

    layer.select(null);
    layer.toggleSelect(a.id);
    expect(layer.selectedIdList).toEqual([a.id]);
    layer.toggleSelect(b.id);
    expect(layer.selectedIdList).toEqual([a.id, b.id]);
    expect(layer.isSelected(a.id)).toBe(true);
    // 主锚 = 最后一次加入
    expect(layer.selected?.id).toBe(b.id);
    // 再次 Ctrl+点击移出
    layer.toggleSelect(a.id);
    expect(layer.selectedIdList).toEqual([b.id]);
  });

  it('单选替换整个多选集合；select(null) 清空', () => {
    const layer = new DrawingLayer();
    const a = layer.add('hline', [P(1, 100)]);
    const b = layer.add('hline', [P(2, 200)]);
    layer.toggleSelect(a.id);
    layer.toggleSelect(b.id);
    layer.select(a.id);
    expect(layer.selectedIdList).toEqual([a.id]);
    layer.select(null);
    expect(layer.selectedIdList).toEqual([]);
    expect(layer.selected).toBeNull();
  });

  it('多选删除：removeSelected 一次删除全部选中（单步历史）', () => {
    const layer = new DrawingLayer();
    const a = layer.add('hline', [P(1, 100)]);
    const b = layer.add('hline', [P(2, 200)]);
    const c = layer.add('hline', [P(3, 300)]);
    layer.select(null); // 清掉 add(c) 的自动选中
    layer.toggleSelect(a.id);
    layer.toggleSelect(b.id);

    layer.removeSelected();
    expect(layer.list().map((d) => d.id)).toEqual([c.id]);
    expect(layer.selectedIdList).toEqual([]);

    layer.undo();
    expect(layer.list().length).toBe(3); // 一步恢复两个
  });

  it('多选整体平移：translateSelected 同量移动全部选中，跳过锁定', () => {
    const layer = new DrawingLayer();
    const a = layer.add('trendline', [P(1, 100), P(2, 110)]);
    const b = layer.add('rect', [P(1, 50), P(2, 60)]);
    const locked = layer.add('hline', [P(1, 70)]);
    layer.setLocked(locked.id, true);
    layer.toggleSelect(a.id);
    layer.toggleSelect(b.id);
    layer.toggleSelect(locked.id);

    expect(layer.translateSelected(3, 5)).toBe(true);
    expect(layer.list()[0].points).toEqual([P(4, 105), P(5, 115)]);
    expect(layer.list()[1].points).toEqual([P(4, 55), P(5, 65)]);
    expect(layer.list()[2].points).toEqual([P(1, 70)]); // 锁定不动
  });

  it('无选中时 translateSelected 返回 false 且不改动', () => {
    const layer = new DrawingLayer();
    layer.add('hline', [P(1, 100)]);
    layer.select(null);
    expect(layer.translateSelected(1, 1)).toBe(false);
    expect(layer.list()[0].points).toEqual([P(1, 100)]);
  });

  it('undo/redo 清空多选集合（避免悬空选中）', () => {
    const layer = new DrawingLayer();
    const a = layer.add('hline', [P(1, 100)]);
    const b = layer.add('hline', [P(2, 200)]);
    layer.toggleSelect(a.id);
    layer.toggleSelect(b.id);
    layer.undo();
    expect(layer.selectedIdList).toEqual([]);
    layer.redo();
    expect(layer.selectedIdList).toEqual([]);
  });

  it('remove 单个对象时同步清出多选集合', () => {
    const layer = new DrawingLayer();
    const a = layer.add('hline', [P(1, 100)]);
    const b = layer.add('hline', [P(2, 200)]);
    layer.toggleSelect(a.id); // b 已被 add 自动选中 → [b, a]
    expect(layer.selectedIdList).toHaveLength(2);
    layer.remove(a.id);
    expect(layer.selectedIdList).toEqual([b.id]);
  });

  it('多选集合序列化往返后仍可按 id 选中（布局恢复路径）', () => {
    const layer = new DrawingLayer();
    layer.add('fib-fan', [P(1, 100), P(2, 120)]);
    layer.add('fib-arc', [P(1, 90), P(2, 130)]);
    const raw = JSON.stringify(layer.list());
    const restored = JSON.parse(raw) as typeof layer.list;
    const target = new DrawingLayer();
    target.replaceAll([...restored]);
    expect(target.list().length).toBe(2);
    target.select(target.list()[0].id);
    expect(target.selected?.type).toBe('fib-fan');
  });
});

// ---------- ChartRenderer 指针级集成（B7：克隆/多选/约束/微调） ----------

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CANVAS_W = 1280;
const CANVAS_H = 800;

/** 600 根确定性 K 线（与 renderer-input.test.ts 同构） */
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
  // jsdom 无 canvas 2D：记录式 mock ctx（同 renderer-input.test.ts）
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

function ptr(type: string, x: number, y: number, mods: { ctrl?: boolean; shift?: boolean } = {}): void {
  canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      bubbles: true,
      cancelable: true,
      ctrlKey: mods.ctrl ?? false,
      shiftKey: mods.shift ?? false,
    }),
  );
}

/** 单击（落点/选中）：down + up 同位置 */
function click(x: number, y: number, mods: { ctrl?: boolean; shift?: boolean } = {}): void {
  ptr('pointerdown', x, y, mods);
  ptr('pointerup', x, y, mods);
}

/** 放置一条趋势线（工具模式两次点击），返回世界坐标锚点 */
function placeTrendline(r: ChartRenderer, x1: number, y1: number, x2: number, y2: number): DrawingPoint[] {
  r.setActiveTool('trendline');
  click(x1, y1);
  click(x2, y2);
  r.setActiveTool(null);
  const d = r.listDrawings()[0];
  return d.points.map((p) => ({ ...p }));
}

describe('B7 Ctrl+拖动克隆', () => {
  it('Ctrl+拖动生成克隆体：原对象坐标不动，克隆体落到位移处，单步撤销移除克隆', () => {
    const r = makeRenderer();
    const before = placeTrendline(r, 300, 300, 500, 400);

    // Ctrl+按下于线体（400,350 在 300,300→500,400 线段上），移动超过 2px 阈值
    ptr('pointerdown', 400, 350, { ctrl: true });
    ptr('pointermove', 450, 380, { ctrl: true });
    ptr('pointerup', 450, 380, { ctrl: true });

    const list = r.listDrawings();
    expect(list).toHaveLength(2);
    // 原对象坐标不变
    expect(list[0].points).toEqual(before);
    // 克隆体 = 原对象 + 位移（两点同增量）
    const dt = list[1].points[0].time - before[0].time;
    const dp = list[1].points[0].price - before[0].price;
    expect(dt).not.toBe(0);
    expect(dp).not.toBe(0);
    expect(list[1].points[1].time - before[1].time).toBeCloseTo(dt, 9);
    expect(list[1].points[1].price - before[1].price).toBeCloseTo(dp, 9);
    // 克隆体被选中
    expect(r.selectedDrawingIds).toEqual([list[1].id]);

    // 一次撤销 = 克隆体消失（克隆 + 拖拽为单步历史）
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(1);
    expect(r.listDrawings()[0].points).toEqual(before);
  });

  it('Ctrl+点击（无移动）不克隆，而是切换多选', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    click(300, 250);
    click(300, 450);
    r.setActiveTool(null);
    expect(r.listDrawings()).toHaveLength(2);

    click(300, 250, { ctrl: true }); // 无移动 → 多选切换，不克隆
    expect(r.listDrawings()).toHaveLength(2);
    expect(r.selectedDrawingIds).toHaveLength(2);
  });
});

describe('B7 Ctrl+点击多选', () => {
  it('多选集合增删、整组拖拽、Delete 删除、Esc 退出', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    click(300, 250); // hline A
    click(300, 450); // hline B（放置后自动选中 B）
    r.setActiveTool(null);
    const [a, b] = r.listDrawings();
    const aPts = a.points.map((p) => ({ ...p }));
    const bPts = b.points.map((p) => ({ ...p }));

    expect(r.selectedDrawingIds).toEqual([b.id]);
    click(300, 250, { ctrl: true }); // Ctrl+点击 A → 加入多选
    expect(r.selectedDrawingIds).toHaveLength(2);
    expect(r.selectedDrawingIds).toContain(a.id);
    expect(r.selectedDrawingIds).toContain(b.id);

    // 多选态下拖拽其中一条的线体（避开锚点手柄）→ 整组平移（dy=0：仅时间平移）
    ptr('pointerdown', 500, 250);
    ptr('pointermove', 580, 250);
    ptr('pointerup', 580, 250);
    const moved = r.listDrawings();
    expect(moved[0].points[0].time).not.toBe(aPts[0].time);
    expect(moved[1].points[0].time).not.toBe(bPts[0].time);
    // 两条位移量一致（整组）
    expect(moved[0].points[0].time - aPts[0].time).toBeCloseTo(moved[1].points[0].time - bPts[0].time, 9);
    // 价格均不变（水平拖动）
    expect(moved[0].points[0].price).toBeCloseTo(aPts[0].price, 9);
    expect(moved[1].points[0].price).toBeCloseTo(bPts[0].price, 9);

    // Delete 删除全部选中，单步撤销恢复
    r.removeSelectedDrawing();
    expect(r.listDrawings()).toHaveLength(0);
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(2);

    // Esc（cancelPlacing）退出多选
    click(300, 250, { ctrl: true });
    click(300, 450, { ctrl: true });
    expect(r.selectedDrawingIds).toHaveLength(2);
    r.cancelPlacing();
    expect(r.selectedDrawingIds).toHaveLength(0);
  });

  it('Ctrl+再次点击已选中对象 = 移出多选集合', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    click(300, 250);
    click(300, 450);
    r.setActiveTool(null);
    const [a, b] = r.listDrawings();
    click(300, 250, { ctrl: true }); // [b, a]
    click(300, 250, { ctrl: true }); // 再点 A → 移出
    expect(r.selectedDrawingIds).toEqual([b.id]);
    void a;
  });
});

describe('B7 Shift 拖动约束', () => {
  it('放置趋势线：水平主导 → 价格锁定；垂直主导 → 时间锁定', () => {
    const r = makeRenderer();
    r.setActiveTool('trendline');
    click(300, 300); // 锚点 1
    click(500, 350, { shift: true }); // |dx|=200 ≥ |dy|=50 → 水平约束
    const pts = r.listDrawings()[0].points;
    expect(pts[1].price).toBeCloseTo(pts[0].price, 9); // 价格锁定
    expect(pts[1].time).not.toBe(pts[0].time);

    const r2 = makeRenderer();
    r2.setActiveTool('trendline');
    click(300, 300);
    click(320, 500, { shift: true }); // |dx|=20 < |dy|=200 → 垂直约束
    const pts2 = r2.listDrawings()[0].points;
    expect(pts2[1].time).toBeCloseTo(pts2[0].time, 9); // 时间锁定
    expect(pts2[1].price).not.toBe(pts2[0].price);
  });

  it('拖拽趋势线：Shift 限制单轴平移', () => {
    const r = makeRenderer();
    const before = placeTrendline(r, 300, 300, 500, 400);
    // 选中并拖拽（Shift 按住）：(400,350) → (450,500)，垂直主导 → 仅价格变
    ptr('pointerdown', 400, 350);
    ptr('pointermove', 450, 500, { shift: true });
    ptr('pointerup', 450, 500, { shift: true });
    const pts = r.listDrawings()[0].points;
    expect(pts[0].time).toBeCloseTo(before[0].time, 9); // 时间不动
    expect(pts[0].price).not.toBeCloseTo(before[0].price, 6); // 价格平移
  });

  it('非约束工具（矩形）Shift 拖拽不受限', () => {
    const r = makeRenderer();
    r.setActiveTool('rect');
    click(300, 300);
    click(500, 400);
    r.setActiveTool(null);
    const before = r.listDrawings()[0].points.map((p) => ({ ...p }));
    ptr('pointerdown', 400, 350);
    ptr('pointermove', 430, 420, { shift: true });
    ptr('pointerup', 430, 420, { shift: true });
    const pts = r.listDrawings()[0].points;
    expect(pts[0].time).not.toBeCloseTo(before[0].time, 9); // 双轴都动
    expect(pts[0].price).not.toBeCloseTo(before[0].price, 6);
  });
});

describe('B7 方向键微调', () => {
  it('像素步长平移选中对象：水平只改时间、垂直只改价格；每次微调单步入撤销栈', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    click(300, 250);
    r.setActiveTool(null);
    const t0 = r.listDrawings()[0].points[0].time;
    const p0 = r.listDrawings()[0].points[0].price;

    expect(r.nudgeSelectedDrawing(1, 0)).toBe(true); // 右移 1px
    expect(r.listDrawings()[0].points[0].time).toBeGreaterThan(t0);
    expect(r.listDrawings()[0].points[0].price).toBeCloseTo(p0, 9);

    expect(r.nudgeSelectedDrawing(0, 1)).toBe(true); // 下移 1px
    expect(r.listDrawings()[0].points[0].price).toBeLessThan(p0);

    // 每次微调一步历史：undo 只回退垂直微调
    r.undoDrawing();
    expect(r.listDrawings()[0].points[0].price).toBeCloseTo(p0, 9);
    expect(r.listDrawings()[0].points[0].time).toBeGreaterThan(t0);
  });

  it('Shift 大步长：位移量约为普通步长的 10 倍', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    click(300, 250);
    r.setActiveTool(null);
    const t0 = r.listDrawings()[0].points[0].time;
    r.nudgeSelectedDrawing(1, 0);
    const small = r.listDrawings()[0].points[0].time - t0;
    r.nudgeSelectedDrawing(10, 0);
    const big = r.listDrawings()[0].points[0].time - t0 - small;
    expect(big / small).toBeCloseTo(10, 6);
  });

  it('无选中对象时微调返回 false 且不改动', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    click(300, 250);
    r.setActiveTool(null);
    r.selectDrawing(null);
    const before = r.listDrawings()[0].points[0];
    expect(r.nudgeSelectedDrawing(5, 5)).toBe(false);
    expect(r.listDrawings()[0].points[0]).toEqual(before);
  });
});
