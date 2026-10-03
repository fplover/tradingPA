// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import type { Bar } from '@/types/market';
import type { IndicatorDef } from '@/indicators/core/types';
import { IndicatorInstance } from '@/indicators/core/instance';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import {
  SelectionPopupTracker,
  drawingBBox,
  syncDrawingSelection,
  type SelectionPopupInfo,
} from '@/engine/renderer/selectionPopup';
import {
  hitTestIndicatorAt,
  hitTestIndicatorLine,
  indicatorPixelBBox,
  selectStudyAt,
} from '@/engine/renderer/hitTestIndicator';
import type { Drawing } from '@/engine/drawing/types';
import { createMockCtx, asCtx, type MockCtx } from './helpers/mock-ctx';

/**
 * TV 式选择工具栏（引擎侧）单测：
 * - SelectionPopupTracker：画线/指标选中推送、互斥单选、双空 → null、同值不重推、退订
 * - hitTestIndicatorLine：折线/柱体命中、断点（undefined）不连段、容差外不中、隐藏 plot 不中
 * - indicatorPixelBBox / hitTestIndicatorAt：可见值像素范围、主面板限定
 * - ChartController 集成：指针选中指标 → 回调；点空白 → null；指针选中画线 → 回调
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const W = 460;
const H = 300;

const BARS: Bar[] = [
  { time: T0, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: T0 + IV, open: 104, high: 108, low: 103, close: 101, volume: 900 },
  { time: T0 + 2 * IV, open: 101, high: 105, low: 100, close: 103, volume: 1500 },
  { time: T0 + 3 * IV, open: 103, high: 104, low: 99, close: 100, volume: 700 },
  { time: T0 + 4 * IV, open: 100, high: 107, low: 97, close: 105, volume: 2000 },
  { time: T0 + 5 * IV, open: 105, high: 106, low: 102, close: 102, volume: 800 },
];

// ---------- 纯函数：SelectionPopupTracker ----------

describe('SelectionPopupTracker', () => {
  it('画线选中：锚点 = bbox 中心 x（钳制 [60, chartW-60]）、顶部 y - 12；id 取多选集合末尾', () => {
    const t = new SelectionPopupTracker();
    const seen: Array<SelectionPopupInfo | null> = [];
    const off = t.subscribe((i) => seen.push(i));
    t.setDrawingSelection(['a', 'b'], { x0: 100, y0: 200, x1: 300, y1: 260 }, 1000);
    expect(seen).toEqual([{ kind: 'drawing', id: 'b', x: 200, y: 188 }]);
    expect(t.current).toEqual({ kind: 'drawing', id: 'b', x: 200, y: 188 });
    off();
    t.setDrawingSelection([], null, 1000); // 退订后不再推送
    expect(seen).toHaveLength(1);
    expect(t.current).toBeNull();
  });

  it('x 钳制：贴左/右缘时收敛到 [60, chartW-60]', () => {
    const t = new SelectionPopupTracker();
    t.setDrawingSelection(['a'], { x0: 0, y0: 50, x1: 10, y1: 60 }, 1000);
    expect(t.current!.x).toBe(60);
    t.setDrawingSelection(['a'], { x0: 990, y0: 50, x1: 1000, y1: 60 }, 1000);
    expect(t.current!.x).toBe(940); // 1000 - 60
    t.setDrawingSelection(['a'], { x0: 0, y0: 50, x1: 10, y1: 60 }, 80); // 窄画布防御
    expect(t.current!.x).toBe(60); // hi = max(60, 20) = 60
  });

  it('指标选中：bbox = 可见 defined 值像素范围', () => {
    const t = new SelectionPopupTracker();
    const seen: Array<SelectionPopupInfo | null> = [];
    t.subscribe((i) => seen.push(i));
    t.setStudySelection('ind_1', { x0: 200, y0: 120, x1: 400, y1: 180 }, 1000);
    expect(seen).toEqual([{ kind: 'indicator', id: 'ind_1', x: 300, y: 108 }]);
  });

  it('互斥单选：画线与指标选中互相顶下', () => {
    const t = new SelectionPopupTracker();
    const seen: Array<SelectionPopupInfo | null> = [];
    t.subscribe((i) => seen.push(i));
    t.setDrawingSelection(['a'], { x0: 100, y0: 100, x1: 200, y1: 140 }, 1000);
    t.setStudySelection('ind_1', { x0: 100, y0: 100, x1: 200, y1: 140 }, 1000);
    expect(t.current).toEqual({ kind: 'indicator', id: 'ind_1', x: 150, y: 88 });
    t.setDrawingSelection(['a'], { x0: 100, y0: 100, x1: 200, y1: 140 }, 1000);
    expect(t.current).toEqual({ kind: 'drawing', id: 'a', x: 150, y: 88 });
    expect(seen).toHaveLength(3); // 两次选中 + 互斥切换各推一次
  });

  it('双空 → null；同值不重复推送', () => {
    const t = new SelectionPopupTracker();
    const seen: Array<SelectionPopupInfo | null> = [];
    t.subscribe((i) => seen.push(i));
    t.setStudySelection(null, null, 1000); // 初始即空：无变化不推
    expect(seen).toEqual([]);
    t.setStudySelection('ind_1', { x0: 10, y0: 10, x1: 20, y1: 20 }, 1000);
    t.setStudySelection('ind_1', { x0: 10, y0: 10, x1: 20, y1: 20 }, 1000); // 同值
    expect(seen).toHaveLength(1);
    t.setStudySelection(null, null, 1000);
    expect(seen).toEqual([{ kind: 'indicator', id: 'ind_1', x: 60, y: -2 }, null]);
    t.setStudySelection(null, null, 1000); // 已空：不重推
    expect(seen).toHaveLength(2);
  });

  it('subscribe 退订函数幂等', () => {
    const t = new SelectionPopupTracker();
    const seen: Array<SelectionPopupInfo | null> = [];
    const off = t.subscribe((i) => seen.push(i));
    off();
    off();
    t.setDrawingSelection(['a'], { x0: 0, y0: 0, x1: 10, y1: 10 }, 1000);
    expect(seen).toEqual([]);
  });

  it('drawingBBox / syncDrawingSelection：选中锚点 min/max；空选中 → null', () => {
    const mk = (id: string, points: Array<{ x: number; y: number }>): Drawing =>
      ({ id, points: points.map((p) => ({ time: p.x, price: p.y })) }) as unknown as Drawing;
    const layer = {
      list: () => [
        mk('a', [
          { x: 10, y: 20 },
          { x: 30, y: 5 },
        ]),
        mk('b', [{ x: 15, y: 40 }]),
      ],
      selectedIdList: ['a'],
    };
    const toPixel = (p: { time: number; price: number }) => ({ x: p.time * 2, y: p.price });
    // 全部对象锚点：(20,20) (60,5) (30,40) → min/max
    expect(drawingBBox(layer.list(), toPixel)).toEqual({ x0: 20, y0: 5, x1: 60, y1: 40 });
    const t = new SelectionPopupTracker();
    syncDrawingSelection(t, layer, toPixel, 1000);
    // 仅选中 a：(20,20) (60,5) → 中心 x=40 钳到 60，顶 y=5-12=-7
    expect(t.current).toEqual({ kind: 'drawing', id: 'a', x: 60, y: -7 });
    syncDrawingSelection(t, { list: layer.list, selectedIdList: [] }, toPixel, 1000);
    expect(t.current).toBeNull();
  });
});

// ---------- 纯函数：指标折线命中 ----------

function makeSeries(): BarSeries {
  const s = new BarSeries();
  s.replace(BARS);
  return s;
}

/** 间距 16：indexToX(i) = (i + 17.75) × 16 → 0:284 / 1:300 / 2:316 / 3:332 / 4:348 / 5:364 */
function makeViewport(): Viewport {
  const v = new Viewport(W);
  v.setBarCount(BARS.length);
  v.setBarSpacing(16);
  v.scrollToRealtime();
  return v;
}

const lineDef: IndicatorDef = {
  id: 'test-line',
  name: '测试线',
  category: 'test',
  overlay: true,
  lookback: 0,
  params: [],
  plots: [{ key: 'v', label: 'V', style: { kind: 'line', color: '#000000', lineWidth: 1 } }],
  compute: (bars) => ({ v: bars.map((b) => b.close) }),
};

const histDef: IndicatorDef = {
  id: 'test-hist',
  name: '测试柱',
  category: 'test',
  overlay: true,
  lookback: 0,
  params: [],
  plots: [{ key: 'h', label: 'H', style: { kind: 'histogram', color: '#000000' } }],
  compute: (bars) => ({ h: bars.map((b) => b.close - b.open) }),
};

describe('hitTestIndicatorLine', () => {
  const series = makeSeries();
  const viewport = makeViewport();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.setRange(90, 110); // 精确线性：priceToY(p) = (110 - p) × 15 → 104 → 90

  it('线上点命中（距 0；线段中点亦中）', () => {
    const inst = new IndicatorInstance(lineDef);
    expect(hitTestIndicatorLine(inst, series.raw(), 0, 5, viewport, priceScale, 284, 90)).toBe(true); // bar0 顶点 close=104
    expect(hitTestIndicatorLine(inst, series.raw(), 0, 5, viewport, priceScale, 292, 112.5)).toBe(true); // bar0→bar1 段中点
  });

  it('容差边界：水平线 6px 命中、7px 外不中', () => {
    const flatDef: IndicatorDef = { ...lineDef, compute: () => ({ v: BARS.map(() => 100) }) };
    const inst = new IndicatorInstance(flatDef);
    const raw = series.raw();
    // 水平线 y = priceToY(100) = 150
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, priceScale, 300, 150)).toBe(true);
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, priceScale, 300, 156)).toBe(true); // 6px
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, priceScale, 300, 157)).toBe(false); // 7px 外
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, priceScale, 300, 60)).toBe(false); // 远处
  });

  it('histogram：柱体矩形内命中，体外不中', () => {
    const inst = new IndicatorInstance(histDef);
    const ps = new PriceScale();
    ps.setSize(H);
    ps.setRange(-10, 10); // 精确线性：zeroY = priceToY(0) = 150
    const raw = series.raw();
    // bar0 close-open = 4 → 柱体 y ∈ [priceToY(4)=90, 150]，x ∈ [278.4, 289.6]（bodyW=11.2）
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, ps, 284, 120)).toBe(true); // 体内
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, ps, 284, 60)).toBe(false); // 柱顶之上
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, ps, 270, 120)).toBe(false); // 柱体左侧外
  });

  it('空窗 undefined 值：断点不连段（与渲染一致）', () => {
    const gapDef: IndicatorDef = {
      ...lineDef,
      compute: (bars) => ({ v: bars.map((b, i) => (i < 2 ? undefined : b.close)) }),
    };
    const inst = new IndicatorInstance(gapDef);
    const raw = series.raw();
    // bar2 顶点（close=103 → y=105）可命中；bar1→bar2 之间（v1 undefined）不连段：中点距最近段 8px > 6
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, priceScale, 316, 105)).toBe(true);
    expect(hitTestIndicatorLine(inst, raw, 0, 5, viewport, priceScale, 308, 105)).toBe(false);
  });

  it('隐藏 plot 不参与命中', () => {
    const inst = new IndicatorInstance(lineDef, { styles: { v: { hidden: true } } });
    expect(hitTestIndicatorLine(inst, series.raw(), 0, 5, viewport, priceScale, 284, 90)).toBe(false);
  });
});

describe('indicatorPixelBBox / hitTestIndicatorAt', () => {
  const series = makeSeries();
  const viewport = makeViewport();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.setRange(90, 110);

  it('bbox = 可见 defined 值 min/max y 与首末可见 index 的 x 范围', () => {
    const inst = new IndicatorInstance(lineDef);
    // close: 104/101/103/100/105/102 → y = (110 - close) × 15；min y = close 105 → 75，max y = close 100 → 150
    expect(indicatorPixelBBox(inst, series.raw(), 0, 5, viewport, priceScale)).toEqual({
      x0: 284,
      y0: 75,
      x1: 364,
      y1: 150,
    });
  });

  it('仅主面板内命中；返回 uid + bbox', () => {
    const inst = new IndicatorInstance(lineDef);
    const main = { y: 0, height: 200, priceScale, indicators: [inst] };
    expect(hitTestIndicatorAt(main, [inst], series.raw(), 0, 5, viewport, 284, 90)).toEqual({
      uid: inst.uid,
      bbox: { x0: 284, y0: 75, x1: 364, y1: 150 },
    });
    expect(hitTestIndicatorAt(main, [inst], series.raw(), 0, 5, viewport, 284, 250)).toBeNull(); // 面板高 200 外
    expect(hitTestIndicatorAt(main, [], series.raw(), 0, 5, viewport, 284, 90)).toBeNull(); // 无可见指标
  });
});

// ---------- ChartController 集成（jsdom：mock canvas 2D） ----------

const CANVAS_W = 1280;
const CANVAS_H = 800;

/** 600 根确定性 K 线（与 renderer-input 同构的固定序列） */
function makeBigBars(n = 600): Bar[] {
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

let ctx: MockCtx;
let canvas: HTMLCanvasElement;

beforeEach(() => {
  ctx = createMockCtx();
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    asCtx(ctx),
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
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRenderer(): ChartRenderer {
  const r = new ChartRenderer(canvas, makeBigBars(), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw(); // 同步首帧（不经 rAF），保证 priceScale 已自动适配
  return r;
}

function pointer(type: string, x: number, y: number): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true }),
  );
}

/** 从 mock ctx 抓某描色折线的顶点（moveTo/lineTo 序列，遇 stroke 收尾） */
function strokePoints(color: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let on = false;
  for (const c of ctx.calls) {
    if (c.m === 'set:strokeStyle' && c.a[0] === color) {
      on = true;
      continue;
    }
    if (!on) continue;
    if (c.m === 'moveTo' || c.m === 'lineTo') pts.push([c.a[0] as number, c.a[1] as number]);
    else if (c.m === 'stroke') on = false;
  }
  return pts;
}

describe('ChartController：选中画线/指标 → 选择工具栏', () => {
  it('指针选中主面板指标折线 → 回调收到 indicator info；点空白 → null', () => {
    const r = makeRenderer();
    const uid = r.addIndicator('sma', { params: { length: 1 } })!; // length=1 → 折线 = 各 bar close
    r.redraw();
    const pts = strokePoints('#ff9800'); // SMA 默认描色
    expect(pts.length).toBeGreaterThan(2);
    const [lx, ly] = pts[1];

    const seen: Array<SelectionPopupInfo | null> = [];
    r.setSelectionPopupCallback((i) => seen.push(i));
    expect(r.selectionPopupInfo).toBeNull(); // 初始空

    pointer('pointerdown', lx, ly); // 命中指标折线
    expect(seen).toHaveLength(1);
    expect(seen[0]?.kind).toBe('indicator');
    expect(seen[0]?.id).toBe(uid);
    expect(seen[0]?.x).toBeGreaterThanOrEqual(60);
    expect(r.selectionPopupInfo?.id).toBe(uid);

    pointer('pointerdown', lx, Math.min(ly + 120, 700)); // 空白处（同 x 下移 120px，必出 6px 容差）
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeNull();
    expect(r.selectionPopupInfo).toBeNull();
    r.dispose();
  });

  it('指针选中画线 → 回调收到 drawing info；点空白清除', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    pointer('pointerdown', 600, 250);
    pointer('pointerup', 600, 250);
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;

    const seen: Array<SelectionPopupInfo | null> = [];
    r.setSelectionPopupCallback((i) => seen.push(i));
    // 放置即选中：add → syncSelection 已推过一次（订阅前的初值由 getter 兜底）
    expect(r.selectionPopupInfo).toMatchObject({ kind: 'drawing', id, x: 600 });
    expect(r.selectionPopupInfo!.y).toBeCloseTo(238, 6); // 锚点 y 250 - 12

    pointer('pointerdown', 100, 400); // 空白（无指标 → 指标选中不干扰）
    expect(seen.at(-1)).toBeNull();
    pointer('pointerdown', 600, 250); // 线体 → 重新选中
    expect(seen.at(-1)).toMatchObject({ kind: 'drawing', id, x: 600 });
    expect(seen.at(-1)!.y).toBeCloseTo(238, 6);
    r.dispose();
  });

  it('画线与指标选中互斥：点指标折线切到 indicator，点画线切回 drawing', () => {
    const r = makeRenderer();
    const uid = r.addIndicator('sma', { params: { length: 1 } })!;
    r.redraw();
    const [lx, ly] = strokePoints('#ff9800')[1];
    r.setActiveTool('hline');
    pointer('pointerdown', 600, 720); // 贴底部放置，远离指标折线（互斥判定不受画线命中干扰）
    pointer('pointerup', 600, 720);
    r.setActiveTool(null);
    const drawingId = r.listDrawings()[0].id;

    const seen: Array<SelectionPopupInfo | null> = [];
    r.setSelectionPopupCallback((i) => seen.push(i));
    expect(r.selectionPopupInfo).toMatchObject({ kind: 'drawing', id: drawingId }); // 放置即选中

    pointer('pointerdown', lx, ly); // 指标折线 → 互斥切到指标
    expect(seen.at(-1)).toMatchObject({ kind: 'indicator', id: uid });
    pointer('pointerdown', 600, 720); // 画线线体 → 互斥切回画线
    expect(seen.at(-1)).toMatchObject({ kind: 'drawing', id: drawingId });
    r.dispose();
  });

  it('移除指标 → 选中目标不存在，回调收到 null', () => {
    const r = makeRenderer();
    const uid = r.addIndicator('sma', { params: { length: 1 } })!;
    r.redraw();
    const [lx, ly] = strokePoints('#ff9800')[1];
    const seen: Array<SelectionPopupInfo | null> = [];
    r.setSelectionPopupCallback((i) => seen.push(i));
    pointer('pointerdown', lx, ly);
    expect(seen.at(-1)?.kind).toBe('indicator');
    r.removeIndicator(uid);
    expect(seen.at(-1)).toBeNull();
    r.dispose();
  });

  it('hideStudies → 指标选中收起', () => {
    const r = makeRenderer();
    r.addIndicator('sma', { params: { length: 1 } });
    r.redraw();
    const [lx, ly] = strokePoints('#ff9800')[1];
    const seen: Array<SelectionPopupInfo | null> = [];
    r.setSelectionPopupCallback((i) => seen.push(i));
    pointer('pointerdown', lx, ly);
    expect(seen.at(-1)?.kind).toBe('indicator');
    r.setHideStudies(true);
    expect(seen.at(-1)).toBeNull();
    r.dispose();
  });
});

// ---------- selectStudyAt：宿主窄接口直连 ----------

describe('selectStudyAt（宿主窄接口）', () => {
  it('未命中 → setStudySelection(null)；命中 → uid + bbox', () => {
    const series = makeSeries();
    const viewport = makeViewport();
    const priceScale = new PriceScale();
    priceScale.setSize(H);
    priceScale.setRange(90, 110); // 精确线性：priceToY(104) = 90
    const inst = new IndicatorInstance(lineDef);
    const host = {
      panes: () => [{ y: 0, height: H, priceScale, indicators: [inst] }],
      displaySeries: () => series,
      viewport,
      visibleRange: () => ({ from: 0, to: 5 }),
      visibleStudies: () => [inst],
      chartW: () => W,
    };
    const popup = new SelectionPopupTracker();
    selectStudyAt(host, popup, 284, 90);
    // bbox {x0:284, y0:75, x1:364, y1:150} → 中心 x=324（[60,400] 内不钳），顶 y=75-12=63
    expect(popup.current).toEqual({ kind: 'indicator', id: inst.uid, x: 324, y: 63 });
    selectStudyAt(host, popup, 284, 200); // 距线 110px → 未命中
    expect(popup.current).toBeNull();
  });
});
