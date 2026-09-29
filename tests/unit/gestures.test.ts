// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { Crosshair } from '@/engine/crosshair/Crosshair';
import { BarSeries } from '@/data/BarSeries';
import type { Bar } from '@/types/market';
import type { CanvasManager } from '@/engine/canvas/CanvasManager';
import type { IndicatorInstance } from '@/indicators/core/instance';
import { PanZoomGesture, type PanZoomHost, type PanZoomPane } from '@/engine/renderer/PanZoomGesture';
import { DrawingGesture, type DrawingHost } from '@/engine/renderer/DrawingGesture';
import { TradeGesture, type TradeHost, type TradePane } from '@/engine/renderer/TradeGesture';
import { HoverController, type HoverHost, type HoverPane } from '@/engine/renderer/HoverController';
import { InputController, type InputHost, type InputPane } from '@/engine/renderer/InputController';
import { hoverStudyRow } from '@/engine/renderer/cursor';
import type { StudyLegendRect } from '@/engine/renderer/drawCrosshair';

/**
 * D 批次拆分③ 手势模块单测（W6-2）。
 * 目标：平移/价格/缩放、画线放置/拖拽/克隆、交易拖拽分发、悬停/十字光标、
 * 事件路由——被抽出的状态机直接可测，与 renderer-input 集成测试互为补充。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CHART_W = 1216;
const CHART_H = 776;
const AXIS_W = 64;
const AXIS_H = 24;

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

const BARS = makeBars();

function makeSeries(): BarSeries {
  const s = new BarSeries();
  s.replace(BARS);
  return s;
}

function makeViewport(): Viewport {
  const v = new Viewport(CHART_W);
  v.setBarCount(BARS.length);
  v.scrollToRealtime();
  return v;
}

function makePriceScale(height = CHART_H): PriceScale {
  const ps = new PriceScale();
  ps.setSize(height);
  ps.autoScale(29_000, 31_000);
  return ps;
}

/** 双面板（主 + 副图），几何与 ChartRenderer.layout 产出同构 */
function makePanes(): PanZoomPane[] {
  return [
    { y: 0, height: CHART_H * 0.75, heightRatio: 3, priceScale: makePriceScale(CHART_H * 0.75), manual: false, autoBtn: null },
    { y: CHART_H * 0.75, height: CHART_H * 0.25, heightRatio: 1, priceScale: makePriceScale(CHART_H * 0.25), manual: false, autoBtn: null },
  ];
}

// ---------- PanZoomGesture ----------

describe('PanZoomGesture：平移/价格拖拽/缩放', () => {
  function setup() {
    const viewport = makeViewport();
    const panes = makePanes();
    const invalidate = vi.fn();
    const publishViewport = vi.fn();
    const layout = vi.fn();
    const host: PanZoomHost = {
      viewport,
      panes: () => panes,
      paneAt: (y) => panes.find((p) => y >= p.y && y < p.y + p.height) ?? panes[0],
      layout,
      chartH: () => CHART_H,
      invalidate,
      publishViewport,
    };
    return { g: new PanZoomGesture(host), viewport, panes, invalidate, publishViewport, layout };
  }

  it('beginPan + panTo：横向移视口（first 变化 = -dx/spacing），纵向锁 manual', () => {
    const { g, viewport, panes, invalidate } = setup();
    const first0 = viewport.first;
    g.beginPan(300, 300);
    expect(g.panning).toBe(true);
    g.panTo(200, 300, 300); // dx = -100, dy = 0
    expect(viewport.first - first0).toBeCloseTo(100 / viewport.spacing, 6);
    expect(panes[0].manual).toBe(true);
    expect(invalidate).toHaveBeenCalled();
  });

  it('panTo 位移超 3px 置位 movedFar；consumeMoveFlag 读取后清零', () => {
    const { g } = setup();
    g.beginPan(300, 300);
    g.panTo(250, 300, 300); // |dx| = 50 > 3
    expect(g.consumeMoveFlag()).toBe(true);
    expect(g.consumeMoveFlag()).toBe(false);
  });

  it('priceDragTo：价格域平移且 manual 锁定，spacing 不变', () => {
    const { g, viewport, panes } = setup();
    const range0 = { ...panes[0].priceScale.range };
    const spacing0 = viewport.spacing;
    g.beginPriceDrag(300);
    expect(g.pricePanning).toBe(true);
    g.priceDragTo(400); // dy = +100 → 价格域下移
    const range1 = panes[0].priceScale.range;
    expect(range1.min).not.toBe(range0.min);
    expect(viewport.spacing).toBe(spacing0);
    expect(panes[0].manual).toBe(true);
  });

  it('resizeTo：从下一面板借比例，总和不变且触发 layout', () => {
    const { g, panes, layout } = setup();
    const total0 = panes[0].heightRatio + panes[1].heightRatio;
    g.beginResize(0, panes[0].height); // 分隔条处按下
    expect(g.resizing).toBe(true);
    g.resizeTo(panes[0].height + 60); // 下拖 60px
    expect(panes[0].heightRatio + panes[1].heightRatio).toBeCloseTo(total0, 10);
    expect(panes[0].heightRatio).toBeGreaterThan(3);
    expect(layout).toHaveBeenCalled();
  });

  it('wheelZoom：普通滚轮缩放视口并发布；Ctrl 改价格域且不动视口', () => {
    const { g, viewport, panes, publishViewport } = setup();
    const spacing0 = viewport.spacing;
    const range0 = { ...panes[0].priceScale.range };
    g.wheelZoom(400, 300, -100, false); // 放大
    expect(viewport.spacing).toBeCloseTo(spacing0 * 0.9, 6);
    expect(publishViewport).toHaveBeenCalledTimes(1);
    g.wheelZoom(400, 300, 100, true); // Ctrl + 缩小 → 价格域放大
    expect(panes[0].priceScale.range.max - panes[0].priceScale.range.min).toBeGreaterThan(range0.max - range0.min);
    expect(viewport.spacing).toBeCloseTo(spacing0 * 0.9, 6);
    expect(publishViewport).toHaveBeenCalledTimes(2);
  });

  it('hitAutoButton：命中恢复 automatic（manual=false），未命中不消费', () => {
    const { g, panes, invalidate } = setup();
    panes[0].manual = true;
    panes[0].autoBtn = { x: 100, y: 10, w: 40, h: 16 };
    expect(g.hitAutoButton(120, 20, panes[0])).toBe(true); // ly = 20 ∈ [10,26]
    expect(panes[0].manual).toBe(false);
    expect(invalidate).toHaveBeenCalled();
    panes[0].manual = true;
    expect(g.hitAutoButton(10, 300, panes[0])).toBe(false);
    expect(panes[0].manual).toBe(true);
  });

  it('end 清空全部拖拽态', () => {
    const { g } = setup();
    g.beginPan(0, 0);
    g.beginPriceDrag(100);
    g.beginResize(0, 100);
    g.end();
    expect(g.panning).toBe(false);
    expect(g.pricePanning).toBe(false);
    expect(g.resizing).toBe(false);
  });
});

// ---------- DrawingGesture ----------

describe('DrawingGesture：放置/预览/拖拽/克隆', () => {
  function setup(locked = false) {
    const viewport = makeViewport();
    const series = makeSeries();
    const priceScale = makePriceScale();
    const invalidate = vi.fn();
    const notify = vi.fn();
    const host: DrawingHost = {
      drawingCtx: () => ({ viewport, priceScale, series, geo: { chartW: CHART_W, chartH: CHART_H } }),
      mainPaneY: () => 0,
      viewport,
      displaySeries: () => series,
      chartW: () => CHART_W,
      drawingsLocked: () => locked,
      invalidate,
      notifyDrawings: notify,
    };
    const finished = vi.fn();
    const g = new DrawingGesture(host);
    g.setToolFinishedCallback(finished);
    return { g, finished, invalidate, notify };
  }

  it('1 点工具（hline）：单击即落成并触发 toolFinished', () => {
    const { g, finished } = setup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    const ds = g.layer.list();
    expect(ds).toHaveLength(1);
    expect(ds[0].type).toBe('hline');
    expect(ds[0].points).toHaveLength(1);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(g.placingPoints).toHaveLength(0);
  });

  it('2 点工具（trendline）：首击累积锚点，满点落成并清空放置态', () => {
    const { g, finished } = setup();
    g.setTool('trendline');
    g.place(200, 200, 0, false);
    expect(g.layer.list()).toHaveLength(0);
    expect(g.placingPoints).toHaveLength(1);
    expect(g.preview).toBeNull();
    g.place(400, 300, 0, false);
    const ds = g.layer.list();
    expect(ds).toHaveLength(1);
    expect(ds[0].points).toHaveLength(2);
    expect(g.placingPoints).toHaveLength(0);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('放置预览：move 在有锚点后更新 preview 并消费事件', () => {
    const { g } = setup();
    g.setTool('trendline');
    g.place(200, 200, 0, false);
    const consumed = g.onPointerMove(300, 250, 0, false);
    expect(consumed).toBe(true);
    expect(g.preview).not.toBeNull();
  });

  it('setTool(null) 重置放置态；finishPlacing 落成 path', () => {
    const { g, notify } = setup();
    g.setTool('path');
    g.place(100, 100, 0, false);
    g.place(200, 200, 0, false);
    expect(g.placingPoints).toHaveLength(2);
    g.finishPlacing();
    expect(g.layer.list()[0].type).toBe('path');
    expect(g.placingPoints).toHaveLength(0);
    notify.mockClear();
    g.setTool(null);
    expect(g.tool).toBeNull();
    expect(notify).toHaveBeenCalled();
  });

  it('hitAt：锁定态返回 null；解锁后命中线体', () => {
    const locked = setup(true);
    locked.g.setTool('hline');
    locked.g.place(200, 200, 0, false);
    expect(locked.g.hitAt(200, 200, 0)).toBeNull();
    const open = setup();
    open.g.setTool('hline');
    open.g.place(200, 200, 0, false);
    const hit = open.g.hitAt(300, 201, 0); // 避开 7px 手柄区，落在 ±5px 线体容差内
    expect(hit).not.toBeNull();
    expect(hit!.part).toBe('body');
    expect(hit!.id).toBe(open.g.layer.list()[0].id);
  });

  it('beginDrag 后 onPointerUp 结束拖拽；Ctrl 无移动 = 多选切换', () => {
    const { g } = setup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    const id = g.layer.list()[0].id;
    const hit = g.hitAt(200, 200, 0)!;
    // 普通拖拽
    g.beginDrag(200, 200, 0, hit, 0, false);
    expect(g.layer.selectedIdList).toEqual([id]);
    g.onPointerUp();
    // Ctrl+按下（待克隆）→ 松柄 = 多选切换
    g.beginDrag(200, 200, 0, hit, 0, true);
    expect(g.layer.selectedIdList).toEqual([id]); // 尚未切换
    g.onPointerUp();
    expect(g.layer.selectedIdList).toEqual([]); // 无移动 → 切换出集合
  });

  it('Ctrl+拖动超 2px 阈值：懒克隆并拖动克隆体（原对象不动）', () => {
    const { g } = setup();
    g.setTool('hline');
    g.place(200, 200, 0, false);
    const srcId = g.layer.list()[0].id;
    const hit = g.hitAt(200, 200, 0)!;
    g.beginDrag(200, 200, 0, hit, 0, true);
    g.onPointerMove(260, 200, 0, false); // 移动 60px > 2
    const ds = g.layer.list();
    expect(ds).toHaveLength(2);
    expect(g.layer.selectedIdList).toEqual([ds[1].id]);
    expect(ds[1].id).not.toBe(srcId);
  });
});

// ---------- TradeGesture ----------

describe('TradeGesture：交易线拖拽与侵入剥离', () => {
  const P = 30_000;
  function setup() {
    const priceScale = makePriceScale();
    const pane: TradePane = { y: 0, height: CHART_H, priceScale };
    const invalidate = vi.fn();
    const host: TradeHost = {
      paneAt: () => pane,
      mainPane: () => pane,
      chartW: () => CHART_W,
      invalidate,
    };
    const cbs = {
      onOrderMove: vi.fn(),
      onOrderCancel: vi.fn(),
      onPositionTpSl: vi.fn(),
      onPositionClose: vi.fn(),
    };
    const g = new TradeGesture(host);
    g.setCallbacks(cbs);
    g.setVisual({
      orders: [{ id: 'ord_1', side: 'buy', type: 'limit', qty: 1, price: P * 0.95 }],
      position: { side: 'long', qty: 1, avgPrice: P, takeProfit: P * 1.1, stopLoss: P * 0.9, pnl: 0 },
      entries: [],
      exits: [],
    });
    return { g, cbs, priceScale, pane, invalidate };
  }

  it('hitAt 命中挂单线体；onPointerDown 进入拖拽不触发回调', () => {
    const { g, cbs, priceScale } = setup();
    const y = priceScale.priceToY(P * 0.95);
    const pane = { y: 0, height: CHART_H, priceScale };
    expect(g.hitAt(600, y, pane)).toEqual({ kind: 'order', id: 'ord_1' });
    expect(g.onPointerDown(600, y, pane)).toBe(true);
    expect(g.dragging).toBe(true);
    expect(cbs.onOrderMove).not.toHaveBeenCalled();
  });

  it('拖拽挂单线 → onOrderMove 带上新价', () => {
    const { g, cbs, priceScale } = setup();
    const y = priceScale.priceToY(P * 0.95);
    const pane = { y: 0, height: CHART_H, priceScale };
    g.onPointerDown(600, y, pane);
    const target = P * 0.93;
    g.dragTo(priceScale.priceToY(target));
    expect(cbs.onOrderMove).toHaveBeenCalledTimes(1);
    const [, price] = cbs.onOrderMove.mock.calls[0];
    expect(price).toBeCloseTo(target, 6);
  });

  it('挂单线右端撤单按钮 → onOrderCancel', () => {
    const { g, cbs, priceScale } = setup();
    const y = priceScale.priceToY(P * 0.95);
    const pane = { y: 0, height: CHART_H, priceScale };
    expect(g.onPointerDown(CHART_W - 18, y, pane)).toBe(true);
    expect(cbs.onOrderCancel).toHaveBeenCalledWith('ord_1');
    expect(g.dragging).toBe(false);
  });

  it('TP 线拖动 → onPositionTpSl(新价, 原止损)；tp-close → 清除 TP', () => {
    const { g, cbs, priceScale } = setup();
    const pane = { y: 0, height: CHART_H, priceScale };
    const yTp = priceScale.priceToY(P * 1.1);
    g.onPointerDown(600, yTp, pane);
    const newTp = P * 1.12;
    g.dragTo(priceScale.priceToY(newTp));
    expect(cbs.onPositionTpSl).toHaveBeenCalledWith(newTp, P * 0.9);
    cbs.onPositionTpSl.mockClear();
    g.end();
    g.onPointerDown(CHART_W - 18, yTp, pane);
    expect(cbs.onPositionTpSl).toHaveBeenCalledWith(null, P * 0.9);
  });

  it('持仓详情块拖动：多头向上 = 设 TP', () => {
    const { g, cbs, priceScale } = setup();
    const pane = { y: 0, height: CHART_H, priceScale };
    const yAvg = priceScale.priceToY(P);
    g.onPointerDown(1100, yAvg, pane); // 持仓块区域（右端关闭按钮之左）
    const newTp = P * 1.05;
    g.dragTo(priceScale.priceToY(newTp));
    expect(cbs.onPositionTpSl).toHaveBeenCalledWith(newTp, P * 0.9);
  });

  it('未命中返回 false（交还画布平移）', () => {
    const { g, priceScale } = setup();
    const y = priceScale.priceToY(P * 1.2); // 远离全部交易元素
    expect(g.onPointerDown(600, y, { y: 0, height: CHART_H, priceScale })).toBe(false);
    expect(g.dragging).toBe(false);
  });
});

// ---------- cursor.hoverStudyRow ----------

describe('cursor.hoverStudyRow：研究图例行悬停判定', () => {
  const rects: StudyLegendRect[] = [
    { uid: 'sma_1', x: 8, y: 40, w: 100, h: 16, btnX: 120 },
    { uid: 'sma_2', x: 8, y: 60, w: 100, h: 16, btnX: 120 },
  ];

  it('命中行返回 uid；按钮区返回 index，行外返回 null', () => {
    expect(hoverStudyRow(rects, 50, 48)?.uid).toBe('sma_1');
    expect(hoverStudyRow(rects, 50, 48)?.btn).toBeNull();
    expect(hoverStudyRow(rects, 124, 48)?.btn).toBe(0); // 眼睛
    expect(hoverStudyRow(rects, 140, 48)?.btn).toBe(1); // 设置
    expect(hoverStudyRow(rects, 156, 48)?.btn).toBe(2); // 移除
    expect(hoverStudyRow(rects, 156, 68)?.uid).toBe('sma_2');
    expect(hoverStudyRow(rects, 50, 200)).toBeNull();
  });
});

// ---------- HoverController ----------

describe('HoverController：悬停态/十字光标/光标决策', () => {
  function setup() {
    const viewport = makeViewport();
    const series = makeSeries();
    const crosshair = new Crosshair();
    const priceScale = makePriceScale();
    const pane: HoverPane = { id: 'main', y: 0, height: CHART_H, priceScale };
    const published: Array<number | null> = [];
    const canvas = document.createElement('canvas');
    const host: HoverHost = {
      canvas,
      viewport,
      crosshair,
      paneAt: () => pane,
      displaySeries: () => series,
      chartW: () => CHART_W,
      chartH: () => CHART_H,
      separatorIndexAt: () => null,
      studyRects: () => [],
      setHoveredPane: () => {},
      setSelectPreviewX: () => {},
      barSelectMode: () => false,
      publishCrosshairTime: (t) => published.push(t),
      invalidate: () => {},
    };
    const drawing = new DrawingGesture({
      drawingCtx: () => ({ viewport, priceScale, series, geo: { chartW: CHART_W, chartH: CHART_H } }),
      mainPaneY: () => 0,
      viewport,
      displaySeries: () => series,
      chartW: () => CHART_W,
      drawingsLocked: () => false,
      invalidate: () => {},
      notifyDrawings: () => {},
    });
    const trade = new TradeGesture({ paneAt: () => ({ y: 0, height: CHART_H, priceScale }), mainPane: () => ({ y: 0, height: CHART_H, priceScale }), chartW: () => CHART_W, invalidate: () => {} });
    return { h: new HoverController(host, drawing, trade), crosshair, published, canvas, viewport };
  }

  it('图内移动：十字光标定位并发布所在 bar 时间', () => {
    const { h, crosshair, published, viewport } = setup();
    h.update(400, 300);
    const idx = Math.round(400 / 8 + viewport.first);
    expect(published.at(-1)).toBe(BARS[idx].time);
    expect(crosshair.visible).toBe(true);
  });

  it('越出图表区：清除十字光标并发布 null', () => {
    const { h, crosshair, published } = setup();
    h.update(CHART_W + 20, 300);
    expect(published.at(-1)).toBeNull();
    expect(crosshair.visible).toBe(false);
  });

  it('光标决策：价格轴区域 ns-resize', () => {
    const { h, canvas } = setup();
    h.updateHoverCursor(CHART_W + 10, 300);
    expect(canvas.style.cursor).toBe('ns-resize');
  });
});

// ---------- InputController 路由 ----------

describe('InputController：事件路由到手势', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setup() {
    const viewport = makeViewport();
    const series = makeSeries();
    const crosshair = new Crosshair();
    const priceScale = makePriceScale();
    const panes: InputPane[] = [
      {
        id: 'main',
        heightRatio: 3,
        y: 0,
        height: 600,
        priceScale,
        indicators: [] as unknown as IndicatorInstance[],
        manual: false,
        autoBtn: null,
        headerBtns: { settings: { x: 100, y: 4, w: 16, h: 16 }, remove: { x: 120, y: 4, w: 16, h: 16 } },
      },
    ];
    const published: Array<number | null> = [];
    const state = { selected: 'main', hoveredPane: 'main', previewX: null as number | null };
    const host: InputHost = {
      manager: { canvas, width: 1280, height: 800 } as unknown as CanvasManager,
      canvas,
      viewport,
      crosshair,
      panes: () => panes,
      paneAt: () => panes[0],
      separatorIndexAt: () => null,
      displaySeries: () => series,
      invalidate: () => {},
      notifyDrawings: () => {},
      layout: () => {},
      chartW: () => 1216,
      chartH: () => 776,
      drawingCtx: () => ({ viewport, priceScale, series, geo: { chartW: 1216, chartH: 600 } }),
      mainPaneY: () => 0,
      mainPane: () => panes[0],
      drawingsLocked: () => false,
      publishViewport: () => published.push(viewport.first),
      publishCrosshairTime: () => {},
      selectPane: (id) => {
        state.selected = id;
      },
      setHoveredPane: (id) => {
        state.hoveredPane = id;
      },
      setSelectPreviewX: (x) => {
        state.previewX = x;
      },
      studyRects: () => [],
      barSelectMode: () => false,
      replayIndex: () => null,
      barSelected: () => {},
      ensurePaneScaleReady: () => {},
      finishPlacing: () => {},
      studyActionCb: () => null,
      paneActionCb: () => null,
      chartClickCb: () => null,
      contextMenuCb: () => null,
      legendMenuCb: () => null,
      drawingMenuCb: () => null,
      drawingSettingsCb: () => null,
      priceLineDblClickCb: () => null,
    };
    const drawing = new DrawingGesture(host);
    const trade = new TradeGesture(host);
    const hover = new HoverController(host, drawing, trade);
    const panzoom = new PanZoomGesture(host);
    const input = new InputController(host, panzoom, drawing, trade, hover);
    input.bind(canvas);
    return { input, viewport, panes, priceScale, published, state, drawing, panzoom };
  }

  function pointer(type: string, x: number, y: number, button = 0): void {
    canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button, pointerId: 1, bubbles: true, cancelable: true }));
  }

  it('价格轴 pointerdown+move → 价格域变化（路由到 PanZoomGesture）', () => {
    const { panes, priceScale } = setup();
    const range0 = { ...priceScale.range };
    pointer('pointerdown', 1270, 300); // 价格轴区域
    pointer('pointermove', 1270, 400);
    expect(priceScale.range.min).not.toBe(range0.min);
    expect(panes[0].manual).toBe(true);
    pointer('pointerup', 1270, 400);
  });

  it('空白处 pointerdown+move → 视口平移；松柄发布视口提交', () => {
    const { viewport, published } = setup();
    const first0 = viewport.first;
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 200, 300); // dx = -100
    expect(viewport.first - first0).toBeCloseTo(100 / viewport.spacing, 6);
    pointer('pointerup', 200, 300);
    expect(published).toHaveLength(1);
  });

  it('滚轮：普通改视口，Ctrl 改价格域', () => {
    const { viewport, priceScale } = setup();
    const spacing0 = viewport.spacing;
    const range0 = { ...priceScale.range };
    canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 400, clientY: 300, deltaY: -100, bubbles: true, cancelable: true }));
    expect(viewport.spacing).toBeCloseTo(spacing0 * 0.9, 6);
    canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 400, clientY: 300, deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true }));
    expect(priceScale.range.min).not.toBe(range0.min);
    expect(viewport.spacing).toBeCloseTo(spacing0 * 0.9, 6);
  });

  it('工具模式 pointerdown → 画线落点（路由到 DrawingGesture）', () => {
    const { drawing } = setup();
    drawing.setTool('hline');
    pointer('pointerdown', 500, 300);
    expect(drawing.layer.list()).toHaveLength(1);
    expect(drawing.layer.list()[0].type).toBe('hline');
  });

  it('unbind 后事件不再改变状态', () => {
    const { input, viewport } = setup();
    input.unbind(canvas);
    const first0 = viewport.first;
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 200, 300);
    expect(viewport.first).toBe(first0);
  });
});
