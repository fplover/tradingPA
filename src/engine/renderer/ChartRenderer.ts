import { CanvasManager } from '../canvas/CanvasManager';
import { Viewport } from '../viewport/Viewport';
import { PriceScale } from '../scale/PriceScale';
import { Crosshair } from '../crosshair/Crosshair';
import { BarSeries } from '@/data/BarSeries';
import { theme } from '../theme';
import type { Bar, ChartTypeId } from '@/types/market';
import { heikinAshi, renko, kagi, lineBreak, pointAndFigure, rangeBars, atr, type BrickOptions } from '@/data/transforms';
import { IndicatorInstance } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import { DrawingLayer } from '../drawing/DrawingLayer';
import { getToolDef, type Drawing, type DrawingPoint, type DrawingTypeId } from '../drawing/types';
import { drawDrawings, hitTestDrawing, pixelToPoint, type DrawContext } from '../drawing/drawDrawings';
import { drawTrading, hitTestTrading, type TradeVisual, type TradeHit } from './drawTrading';
import { serializeDrawings, deserializeDrawings } from '../drawing/types';
import { drawCandles, type DrawGeometry } from './drawSeries';
import { drawGrid, drawPriceAxis, drawTimeAxis, drawBorders, drawPaneLegend, drawPaneButtons, formatCompact, type PaneButtonRects } from './drawAxes';
import { drawOhlc, drawLine, drawArea, drawBaseline } from './seriesRenderers';
import { drawCrosshair, type LegendInfo } from './drawCrosshair';
import { drawIndicator, indicatorRange, indicatorValuesAt } from './drawIndicator';

const AXIS_WIDTH = 64;
const AXIS_HEIGHT = 24;
const PANE_GAP = 0;

type PaneKind = 'price' | 'indicator';

interface PaneState {
  id: string;
  kind: PaneKind;
  heightRatio: number;
  priceScale: PriceScale;
  indicators: IndicatorInstance[];
  y: number;
  height: number;
  /** 手动价格域：上下拖动/价格轴拖动后锁定，不再自动适配 */
  manual: boolean;
  /** “自动”按钮命中区（面板局部坐标） */
  autoBtn: { x: number; y: number; w: number; h: number } | null;
  /** 面板头部操作按钮命中区（设置/移除，选中指标面板时绘制） */
  headerBtns: PaneButtonRects | null;
}

/** 砖块类图表类型的默认参数（按 ATR 自适应） */
function brickOptions(bars: Bar[]): BrickOptions {
  const size = atr(bars.slice(-200)) || (bars[bars.length - 1]?.close ?? 1) * 0.001;
  return { brickSize: size, reversal: size * 3, lineCount: 3 };
}

/**
 * 图表渲染器：拥有画布/视口/多面板/数据/十字光标，rAF 合帧重绘。
 * 面板模型：index 0 为主价格面板，其余为副面板（指标，成交量也以 VOL 指标挂副图）。
 */
export class ChartRenderer {
  private manager: CanvasManager;
  private viewport: Viewport;
  private panes: PaneState[] = [];
  private baseSeries = new BarSeries();
  /** 当前图表类型下实际渲染的序列（砖块/HA 为变换结果） */
  private displaySeries: BarSeries = this.baseSeries;
  private crosshair = new Crosshair();
  private legend: LegendInfo;
  private rafId = 0;
  private dirty = true;
  private disposed = false;
  private hoveredPaneId = 'main';

  private chartType: ChartTypeId = 'candles';
  private logScale = false;
  private brickOpts: BrickOptions = {};

  // 画线状态
  private drawingLayer = new DrawingLayer();
  private activeTool: DrawingTypeId | null = null;
  private placing: DrawingPoint[] = [];
  private previewPoint: DrawingPoint | null = null;
  private dragDrawing: { id: string; part: 'body' | 'handle'; index: number; start: DrawingPoint; origin: DrawingPoint[] } | null = null;
  private drawingsListeners = new Set<() => void>();

  // 交易可视化（挂单线/持仓线/TP-SL）
  private tradeVisual: TradeVisual = { orders: [], position: null, entries: [], exits: [] };
  private tradeDrag: TradeHit = null;
  /** 悬停交易可视化元素时的 pointer 光标状态（避免每帧写样式） */
  private tradeHoverCursor = false;
  private tradeCbs: {
    onOrderMove?: (id: string, price: number) => void;
    onOrderCancel?: (id: string) => void;
    onPositionTpSl?: (tp: number | null, sl: number | null) => void;
    onPositionClose?: () => void;
  } = {};
  private chartClickCb: ((price: number, time: number, clientX: number, clientY: number) => void) | null = null;
  /** 当前选中面板 id（TV：点击面板即选中；面板被移除后回落主面板） */
  private selectedPaneId = 'main';
  /** 面板头部按钮动作回调（设置/移除指标） */
  private paneActionCb: ((action: 'settings' | 'remove', indicatorId: string) => void) | null = null;

  // 联动 / 复盘
  private syncCrosshairTime: number | null = null;
  private replayIndex: number | null = null;
  private barSelectMode = false;
  /** 选择K线预览线 x（跟随光标，选中后清除） */
  private selectPreviewX: number | null = null;
  private barSelectCb: ((index: number) => void) | null = null;
  private viewportCommitCb: ((v: { first: number; spacing: number }) => void) | null = null;
  private crosshairTimeCb: ((t: number | null) => void) | null = null;

  /** 订阅画线变更（对象树等 React UI 用） */
  onDrawingsChanged(cb: () => void): () => void {
    this.drawingsListeners.add(cb);
    return () => this.drawingsListeners.delete(cb);
  }

  private notifyDrawings(): void {
    for (const cb of this.drawingsListeners) cb();
  }

  /** 最近一帧绘制耗时（ms），供性能监控与测试 */
  lastFrameMs = 0;

  // 拖拽状态
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private priceDragging = false;
  private priceYAtDragStart = 0;

  constructor(canvas: HTMLCanvasElement, bars: Bar[] = [], legend?: Partial<LegendInfo>) {
    this.manager = new CanvasManager(canvas);
    this.viewport = new Viewport(this.manager.width - AXIS_WIDTH);
    this.legend = { symbol: 'BTC/USDT', interval: '1m', decimals: 2, ...legend };
    this.baseSeries.replace(bars);
    this.brickOpts = brickOptions(bars);
    this.panes = [this.createPane('main', 'price', 3)];
    this.viewport.setBarCount(this.displaySeries.length);
    this.manager.onResize(() => {
      this.viewport.setSize(this.manager.width - AXIS_WIDTH);
      this.invalidate();
    });
    this.bindInput(canvas);
    this.applyData(true);
  }

  private createPane(id: string, kind: PaneKind, heightRatio: number): PaneState {
    return { id, kind, heightRatio, priceScale: new PriceScale(), indicators: [], y: 0, height: 0, manual: false, autoBtn: null, headerBtns: null };
  }

  // ---------- 公开 API ----------

  setLegend(legend: Partial<LegendInfo>): void {
    this.legend = { ...this.legend, ...legend };
    this.invalidate();
  }

  setData(bars: Bar[]): void {
    this.baseSeries.replace(bars);
    this.brickOpts = brickOptions(bars);
    this.resetPriceScale();
    this.applyData(true);
  }

  /** 实时推送单根 K 线：贴在右边缘时跟随滚动，否则保持当前视图 */
  updateBar(bar: Bar): void {
    const atRightEdge = this.viewport.isAtRightEdge();
    this.baseSeries.update(bar);
    this.applyData(atRightEdge);
  }

  /** 前插更早的历史（懒加载），保持当前视口不跳动 */
  prependBars(bars: Bar[]): void {
    if (bars.length === 0) return;
    this.baseSeries.prepend(bars);
    this.applyData(false);
    this.viewport.panByBars(bars.length);
    this.notifyDrawings();
    this.invalidate();
  }

  setChartType(type: ChartTypeId): void {
    this.chartType = type;
    this.resetPriceScale();
    this.applyData(true);
  }

  setLogScale(on: boolean): void {
    this.logScale = on;
    for (const pane of this.panes) pane.priceScale.setLogMode(on);
    this.invalidate();
  }

  /** 恢复全部面板为自动价格适配 */
  resetPriceScale(): void {
    for (const pane of this.panes) {
      pane.manual = false;
      pane.autoBtn = null;
    }
    this.invalidate();
  }

  // ---------- 指标 ----------

  /** 添加指标：overlay 进主面板，否则新建独立副图面板。返回实例 uid */
  addIndicator(id: string, overrides?: Record<string, string | number | boolean>): string | null {
    const def = getIndicatorDef(id);
    if (!def) return null;
    const instance = new IndicatorInstance(def, overrides);
    if (def.overlay) {
      this.panes[0].indicators.push(instance);
    } else {
      this.panes.push(this.createPane(`pane_${instance.uid}`, 'indicator', 1));
      this.panes[this.panes.length - 1].indicators.push(instance);
    }
    this.invalidate();
    return instance.uid;
  }

  removeIndicator(uid: string): void {
    for (const pane of this.panes) {
      const idx = pane.indicators.findIndex((i) => i.uid === uid);
      if (idx >= 0) pane.indicators.splice(idx, 1);
    }
    // 指标面板空了就移除
    this.panes = this.panes.filter((p) => !(p.kind === 'indicator' && p.indicators.length === 0));
    // 选中面板被移除时回落主面板
    if (!this.panes.some((p) => p.id === this.selectedPaneId)) {
      this.selectedPaneId = this.panes[0]?.id ?? 'main';
    }
    this.invalidate();
  }

  updateIndicatorParams(uid: string, params: Record<string, string | number | boolean>): void {
    for (const pane of this.panes) {
      const inst = pane.indicators.find((i) => i.uid === uid);
      if (inst) {
        inst.params = { ...inst.params, ...params };
        this.invalidate();
        return;
      }
    }
  }

  /** 全部激活指标（供 UI 列表） */
  listIndicators(): Array<{ uid: string; id: string; name: string; overlay: boolean; params: Record<string, string | number | boolean> }> {
    const out: Array<{ uid: string; id: string; name: string; overlay: boolean; params: Record<string, string | number | boolean> }> = [];
    for (const pane of this.panes) {
      for (const inst of pane.indicators) {
        out.push({ uid: inst.uid, id: inst.id, name: inst.name, overlay: inst.overlay, params: inst.params });
      }
    }
    return out;
  }

  /** 默认指标组合模板（localStorage 由 UI 层持久化） */
  exportIndicatorTemplate(): Array<{ id: string; params: Record<string, string | number | boolean> }> {
    return this.listIndicators().map(({ id, params }) => ({ id, params }));
  }

  importIndicatorTemplate(list: Array<{ id: string; params?: Record<string, string | number | boolean> }>): void {
    for (const pane of this.panes) pane.indicators = [];
    this.panes = this.panes.filter((p) => p.kind !== 'indicator');
    for (const item of list) this.addIndicator(item.id, item.params);
  }

  /** 数据/图表类型变化后：重建 displaySeries 并重置视口 */
  private applyData(resetView: boolean): void {
    const transformTypes: ChartTypeId[] = [
      'heikin-ashi',
      'renko',
      'kagi',
      'line-break',
      'point-figure',
      'range',
    ];
    if (transformTypes.includes(this.chartType)) {
      const bars = this.materialize();
      const opts = this.brickOpts;
      const transformed =
        this.chartType === 'heikin-ashi'
          ? heikinAshi(bars)
          : this.chartType === 'renko'
            ? renko(bars, opts.brickSize ?? 1)
            : this.chartType === 'kagi'
              ? kagi(bars, opts.reversal ?? 1)
              : this.chartType === 'line-break'
                ? lineBreak(bars, opts.lineCount ?? 3)
                : this.chartType === 'point-figure'
                  ? pointAndFigure(bars, opts.brickSize ?? 1, 3)
                  : rangeBars(bars, opts.brickSize ?? 1);
      this.displaySeries = new BarSeries();
      this.displaySeries.replace(transformed);
    } else {
      this.displaySeries = this.baseSeries;
    }
    this.viewport.setBarCount(this.displaySeries.length);
    if (resetView && this.displaySeries.length > 0) this.viewport.scrollToRealtime();
    this.crosshair.clear();
    this.invalidate();
  }

  private materialize(): Bar[] {
    const bars: Bar[] = [];
    const n = this.baseSeries.length;
    for (let i = 0; i < n; i++) bars.push(this.baseSeries.barAt(i)!);
    return bars;
  }

  start(): void {
    if (this.rafId || this.disposed) return;
    const loop = () => {
      if (this.disposed) return;
      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.unbindInput(this.manager.canvas);
    this.manager.dispose();
  }

  invalidate(): void {
    this.dirty = true;
  }

  /** 强制立即重绘（主题切换等需要零延迟的场景，不等 rAF） */
  redraw(): void {
    this.dirty = false;
    this.draw();
  }

  /** 视口首个可见 bar 的 index（懒加载检测用） */
  get viewportFirst(): number {
    return this.viewport.first;
  }

  /** 截图：画布 PNG dataURL */
  screenshot(): string {
    return this.manager.canvas.toDataURL('image/png');
  }

  /** 复盘模式：只渲染到指定 index（null = 关闭）；首次选中居中，播放/越界贴右带入 */
  setReplayIndex(index: number | null): void {
    const prev = this.replayIndex;
    this.replayIndex = index;
    this.viewport.setReplayEdge(index);
    if (index !== null && this.displaySeries.length > 0) {
      const visibleCount = (this.manager.width - AXIS_WIDTH) / this.viewport.spacing;
      if (prev === null) {
        // 首次选中：回放位置居中
        this.viewport.setFirstPublic(index - visibleCount / 2);
      } else {
        const first = this.viewport.first;
        const outOfView = index < first + 2 || index > first + visibleCount - 2;
        if (outOfView) {
          // 播放/步进/跳转：回放点越出视野时靠右带入
          this.viewport.setFirstPublic(index - visibleCount + 5);
        }
      }
    }
    this.invalidate();
  }

  /** 选择K线模式：开启后图表点击落点即为复盘位置 */
  setBarSelectMode(on: boolean, cb: ((index: number) => void) | null): void {
    this.barSelectMode = on;
    this.barSelectCb = cb;
    if (!on) this.selectPreviewX = null;
    this.invalidate();
  }

  /** 注册图表空白处点击回调（弹出下单浮窗） */
  setChartClickCallback(cb: ((price: number, time: number, clientX: number, clientY: number) => void) | null): void {
    this.chartClickCb = cb;
  }

  /** 注册面板头部按钮回调（选中副图面板后显示 设置/移除） */
  setPaneActionCallback(cb: ((action: 'settings' | 'remove', indicatorId: string) => void) | null): void {
    this.paneActionCb = cb;
  }

  /** 当前选中面板（无效 id 回落主面板） */
  private selectedPane(): PaneState {
    return this.panes.find((p) => p.id === this.selectedPaneId) ?? this.panes[0];
  }

  /** 同步交易可视化数据（挂单/持仓） */
  setTradeVisual(visual: TradeVisual): void {
    this.tradeVisual = visual;
    this.invalidate();
  }

  /** 注册交易交互回调（拖拽改价/撤单/TP-SL） */
  setTradeCallbacks(cbs: typeof this.tradeCbs): void {
    this.tradeCbs = cbs;
  }

  /** 联动：外部图表十字光标时间（绘制垂直参考线） */
  setSyncCrosshair(time: number | null): void {
    this.syncCrosshairTime = time;
    this.invalidate();
  }

  /** 联动：外部视口变化（平移/缩放广播） */
  setSyncViewport(v: { first: number; spacing: number }): void {
    this.viewport.setBarSpacing(v.spacing);
    this.viewport.setFirstPublic(v.first);
    this.invalidate();
  }

  getViewport(): { first: number; spacing: number } {
    return { first: this.viewport.first, spacing: this.viewport.spacing };
  }

  /** 视口提交（拖拽/缩放结束）回调，用于多图表联动 */
  onViewportCommit(cb: ((v: { first: number; spacing: number }) => void) | null): void {
    this.viewportCommitCb = cb;
  }

  /** 十字光标所在 bar 时间回调，用于多图表联动 */
  onCrosshairTime(cb: ((t: number | null) => void) | null): void {
    this.crosshairTimeCb = cb;
  }

  /** 最新 bar 时间戳（缺口检测用） */
  get lastBarTime(): number {
    return this.baseSeries.last?.time ?? 0;
  }

  /** 当前全部 bar（缺口回补合并用） */
  getBars(): Bar[] {
    return [...this.baseSeries.raw()];
  }

  // ---------- 画线 ----------

  /** 设置当前工具（null = 光标模式） */
  setActiveTool(tool: DrawingTypeId | null): void {
    this.activeTool = tool;
    this.placing = [];
    this.previewPoint = null;
    this.notifyDrawings();
    this.invalidate();
  }

  setMagnet(on: boolean): void {
    this.drawingLayer.setMagnet(on);
  }

  listDrawings(): Drawing[] {
    return [...this.drawingLayer.list()];
  }

  get selectedDrawingId(): string | null {
    return this.drawingLayer.selected?.id ?? null;
  }

  updateDrawingStyle(id: string, style: Partial<Drawing['style']>): void {
    this.drawingLayer.updateStyle(id, style);
    this.notifyDrawings();
    this.invalidate();
  }

  setDrawingVisible(id: string, visible: boolean): void {
    this.drawingLayer.setVisible(id, visible);
    this.notifyDrawings();
    this.invalidate();
  }

  setDrawingLocked(id: string, locked: boolean): void {
    this.drawingLayer.setLocked(id, locked);
    this.notifyDrawings();
    this.invalidate();
  }

  removeDrawing(id: string): void {
    this.drawingLayer.remove(id);
    this.notifyDrawings();
    this.invalidate();
  }

  removeSelectedDrawing(): void {
    this.drawingLayer.removeSelected();
    this.notifyDrawings();
    this.invalidate();
  }

  undoDrawing(): void {
    this.drawingLayer.undo();
    this.notifyDrawings();
    this.invalidate();
  }

  redoDrawing(): void {
    this.drawingLayer.redo();
    this.notifyDrawings();
    this.invalidate();
  }

  clearDrawings(): void {
    this.drawingLayer.clear();
    this.notifyDrawings();
    this.invalidate();
  }

  exportDrawings(): string {
    return serializeDrawings(this.drawingLayer.list());
  }

  importDrawings(raw: string): void {
    this.drawingLayer.replaceAll(deserializeDrawings(raw));
    this.notifyDrawings();
    this.invalidate();
  }

  /** 主面板局部绘制上下文 */
  private drawingCtx(): DrawContext {
    const main = this.panes[0];
    return {
      viewport: this.viewport,
      priceScale: main.priceScale,
      series: this.displaySeries,
      geo: { chartW: this.manager.width - AXIS_WIDTH, chartH: main.height },
    };
  }

  private hitDrawings(x: number, y: number, pane: PaneState): { id: string; part: 'body' | 'handle'; index: number } | null {
    const dctx = this.drawingCtx();
    const list = this.drawingLayer.list();
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (!d.visible || d.locked) continue;
      const hit = hitTestDrawing(d, x, y - pane.y, dctx);
      if (hit) return { id: d.id, part: hit.part, index: hit.part === 'handle' ? hit.index : -1 };
    }
    return null;
  }

  /** 面板头部按钮命中（设置/移除，仅选中指标面板绘制了按钮） */
  private hitPaneButtons(x: number, y: number, pane: PaneState): { action: 'settings' | 'remove'; indicatorId: string } | null {
    if (!pane.headerBtns || pane.indicators.length === 0) return null;
    const ly = y - pane.y;
    const inRect = (r: { x: number; y: number; w: number; h: number }) =>
      x >= r.x - 2 && x <= r.x + r.w + 2 && ly >= r.y - 2 && ly <= r.y + r.h + 2;
    const indicatorId = pane.indicators[0].def.id;
    if (inRect(pane.headerBtns.settings)) return { action: 'settings', indicatorId };
    if (inRect(pane.headerBtns.remove)) return { action: 'remove', indicatorId };
    return null;
  }

  /** 完成路径类画线（双击/回车） */
  finishPlacing(): void {
    if (this.activeTool === 'path' && this.placing.length >= 2) {
      this.drawingLayer.add('path', this.placing);
    }
    this.placing = [];
    this.previewPoint = null;
    this.notifyDrawings();
    this.invalidate();
  }

  cancelPlacing(): void {
    this.placing = [];
    this.previewPoint = null;
    this.notifyDrawings();
    this.invalidate();
  }

  // ---------- 输入 ----------

  private toLocal(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.manager.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private paneAt(y: number): PaneState {
    for (const pane of this.panes) {
      if (y >= pane.y && y < pane.y + pane.height) return pane;
    }
    return this.panes[0];
  }

  private onPointerDown = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    const inPriceAxis = x > this.manager.width - AXIS_WIDTH;
    const inTimeAxis = y > this.manager.height - AXIS_HEIGHT;
    this.manager.canvas.setPointerCapture(e.pointerId);
    if (inPriceAxis) {
      const pane = this.paneAt(y);
      // 点击“自动”按钮 → 恢复自动适配
      if (pane.autoBtn) {
        const b = pane.autoBtn;
        const ly = y - pane.y;
        if (x >= b.x && x <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) {
          pane.manual = false;
          this.invalidate();
          return;
        }
      }
      this.priceDragging = true;
      this.priceYAtDragStart = y;
    } else if (!inTimeAxis) {
      const pane = this.paneAt(y);
      // 选择K线模式：点击任意位置完成选择，预览线与蒙层即消失；
      // 越界点击（右侧空白/蒙层区）clamp 到最近的有效 bar
      if (this.barSelectMode) {
        const raw = Math.round(this.viewport.xToIndex(x));
        const idx = Math.min(Math.max(raw, 0), Math.max(0, this.displaySeries.length - 1));
        this.barSelectCb?.(idx);
        this.setBarSelectMode(false, null);
        return;
      }
      if (this.activeTool) {
        this.handleToolPointerDown(x, y, pane);
        return;
      }
      // 面板头部按钮（设置/移除指标）优先于画线/交易命中
      const btnHit = this.hitPaneButtons(x, y, pane);
      if (btnHit) {
        this.paneActionCb?.(btnHit.action, btnHit.indicatorId);
        return;
      }
      // 点击即选中面板（TV 行为）
      this.selectedPaneId = pane.id;
      const hit = this.hitDrawings(x, y, pane);
      if (hit) {
        this.drawingLayer.select(hit.id);
        const d = this.drawingLayer.list().find((dd) => dd.id === hit.id)!;
        this.drawingLayer.beginHistory();
        this.dragDrawing = {
          id: hit.id,
          part: hit.part,
          index: hit.index,
          start: pixelToPoint(x, y - pane.y, this.drawingCtx(), false),
          origin: d.points.map((p) => ({ ...p })),
        };
    this.invalidate();
        return;
      }
      // 交易可视化命中：挂单线拖动改价 / 撤单 / 持仓详情块拖动设 TP-SL
      const tradeHit = hitTestTrading(
        this.tradeVisual,
        x,
        y - pane.y,
        pane.priceScale,
        { chartW: this.manager.width - AXIS_WIDTH, chartH: pane.height },
      );
      if (tradeHit) {
        if (tradeHit.kind === 'order-cancel') {
          this.tradeCbs.onOrderCancel?.(tradeHit.id);
          return;
        }
        if (tradeHit.kind === 'position-close') {
          this.tradeCbs.onPositionClose?.();
          return;
        }
        if (tradeHit.kind === 'tp-close') {
          this.tradeCbs.onPositionTpSl?.(null, this.tradeVisual.position?.stopLoss ?? null);
          return;
        }
        if (tradeHit.kind === 'sl-close') {
          this.tradeCbs.onPositionTpSl?.(this.tradeVisual.position?.takeProfit ?? null, null);
          return;
        }
        this.tradeDrag = tradeHit;
        return;
      }
      this.drawingLayer.select(null);
      this.dragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.crosshair.clear();
    this.invalidate();
    }
  };

  /** 工具模式下的落点 */
  private handleToolPointerDown(x: number, y: number, pane: PaneState): void {
    const pt = pixelToPoint(x, y - pane.y, this.drawingCtx(), this.drawingLayer.magnetEnabled);
    const def = getToolDef(this.activeTool!);
    if (def.points === 1) {
      this.drawingLayer.add(this.activeTool!, [pt]);
    this.invalidate();
      return;
    }
    this.placing.push(pt);
    if (def.points > 0 && this.placing.length >= def.points) {
      this.drawingLayer.add(this.activeTool!, this.placing);
      this.placing = [];
      this.previewPoint = null;
    }
    this.invalidate();
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    if (this.dragging) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.viewport.panByBars(-dx / this.viewport.spacing);
      const pane = this.paneAt(y);
      const { min, max } = pane.priceScale.range;
      const span = max - min;
      const shift = (dy / Math.max(1, pane.height)) * span;
      pane.manual = true; // 上下拖动 → 锁定价格域
      pane.priceScale.shift(shift);
      this.invalidate();
    } else if (this.priceDragging) {
      const dy = y - this.priceYAtDragStart;
      const pane = this.paneAt(y);
      const { min, max } = pane.priceScale.range;
      const span = max - min;
      const shift = -(dy / Math.max(1, pane.height)) * span;
      pane.manual = true;
      pane.priceScale.shift(shift);
      this.invalidate();
    } else if (this.dragDrawing) {
      this.updateDrawingDrag(x, y);
    } else if (this.tradeDrag) {
      this.updateTradeDrag(y);
    } else if (this.activeTool && this.placing.length > 0) {
      const pane = this.paneAt(y);
      this.previewPoint = pixelToPoint(x, y - pane.y, this.drawingCtx(), this.drawingLayer.magnetEnabled);
    this.invalidate();
    } else {
      this.updateCrosshair(x, y);
    }
  };

  /** 拖拽画线：整体平移或单手柄移动 */
  private updateDrawingDrag(x: number, y: number): void {
    const drag = this.dragDrawing;
    if (!drag) return;
    const pane = this.panes[0];
    const cur = pixelToPoint(x, y - pane.y, this.drawingCtx(), false);
    if (drag.part === 'body') {
      const dt = cur.time - drag.start.time;
      const dp = cur.price - drag.start.price;
      this.drawingLayer.updatePoints(
        drag.id,
        drag.origin.map((p) => ({ time: p.time + dt, price: p.price + dp })),
      );
    } else {
      const pts = drag.origin.map((p) => ({ ...p }));
      if (pts[drag.index]) pts[drag.index] = { time: cur.time, price: cur.price };
      this.drawingLayer.updatePoints(drag.id, pts);
    }
    this.invalidate();
  }

  private updateCrosshair(x: number, y: number): void {
    const chartW = this.manager.width - AXIS_WIDTH;
    const chartH = this.manager.height - AXIS_HEIGHT;
    if (x < 0 || x > chartW || y < 0 || y > chartH) {
      this.crosshair.clear();
      this.selectPreviewX = null;
      this.crosshairTimeCb?.(null);
      this.setTradeHoverCursor(false);
      this.invalidate();
      return;
    }
    // 选择K线模式：预览线跟随光标（不显示十字光标）
    if (this.barSelectMode) {
      this.crosshair.clear();
      this.selectPreviewX = x;
      this.invalidate();
      return;
    }
    const pane = this.paneAt(y);
    this.hoveredPaneId = pane.id;
    // 悬停交易可视化元素（标签/关闭按钮/TP-SL 线）→ pointer 光标提示可交互
    const hit = hitTestTrading(this.tradeVisual, x, y - pane.y, pane.priceScale, { chartW, chartH: pane.height });
    this.setTradeHoverCursor(hit !== null);
    const idx = Math.round(this.viewport.xToIndex(x));
    const bar = this.displaySeries.barAt(idx);
    if (bar) {
      const price = pane.priceScale.yToPrice(y - pane.y);
      this.crosshair.set(x, y, idx, bar.time, price);
      this.crosshairTimeCb?.(bar.time);
    } else {
      this.crosshair.clear();
      this.crosshairTimeCb?.(null);
    }
    this.invalidate();
  }

  /** 悬停交易可视化元素时切换 pointer 光标（状态不变不写样式） */
  private setTradeHoverCursor(on: boolean): void {
    if (on === this.tradeHoverCursor) return;
    this.tradeHoverCursor = on;
    this.manager.canvas.style.cursor = on ? 'pointer' : '';
  }

  /** 拖拽交易可视化：挂单改价 / TP-SL 设置或改价 */
  private updateTradeDrag(y: number): void {
    const drag = this.tradeDrag;
    if (!drag) return;
    const pane = this.panes[0];
    const price = pane.priceScale.yToPrice(y - pane.y);
    const pos = this.tradeVisual.position;
    if (drag.kind === 'order') {
      this.tradeCbs.onOrderMove?.(drag.id, price);
    } else if (drag.kind === 'position') {
      // 拖动持仓详情块：按拖动方向与订单类型设置止盈/止损
      if (pos) {
        const above = price > pos.avgPrice;
        const isTp = pos.side === 'long' ? above : !above;
        if (isTp) this.tradeCbs.onPositionTpSl?.(price, pos.stopLoss ?? null);
        else this.tradeCbs.onPositionTpSl?.(pos.takeProfit ?? null, price);
      }
    } else if (drag.kind === 'tp') {
      // 直接拖动止盈线改价
      this.tradeCbs.onPositionTpSl?.(price, pos?.stopLoss ?? null);
    } else if (drag.kind === 'sl') {
      // 直接拖动止损线改价
      this.tradeCbs.onPositionTpSl?.(pos?.takeProfit ?? null, price);
    }
    this.invalidate();
  }

  private onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    this.priceDragging = false;
    this.dragDrawing = null;
    this.tradeDrag = null;
    this.viewportCommitCb?.(this.getViewport());
    if (this.manager.canvas.hasPointerCapture(e.pointerId)) {
      this.manager.canvas.releasePointerCapture(e.pointerId);
    }
  };

  /** 右键：禁默认菜单；回放中在空白处右键 → 弹出下单浮窗（左键保留拖动） */
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (this.replayIndex === null || !this.chartClickCb) return;
    const { x, y } = this.toLocal(e);
    const chartW = this.manager.width - AXIS_WIDTH;
    const chartH = this.manager.height - AXIS_HEIGHT;
    if (x < 0 || x > chartW || y < 0 || y > chartH) return;
    // 命中交易可视化/画线时不弹下单
    const pane = this.paneAt(y);
    if (hitTestTrading(this.tradeVisual, x, y - pane.y, pane.priceScale, { chartW, chartH: pane.height })) return;
    if (this.hitDrawings(x, y, pane)) return;
    this.ensurePriceScaleReady(pane);
    const price = pane.priceScale.yToPrice(y - pane.y);
    const bar = this.displaySeries.barAt(this.replayIndex);
    this.chartClickCb(price, bar?.time ?? Date.now(), e.clientX, e.clientY);
  };

  private onDoubleClick = (e: MouseEvent) => {
    const { x, y } = this.toLocal(e);
    // 双击价格轴 → 恢复该面板自动适配
    if (x > this.manager.width - AXIS_WIDTH) {
      this.paneAt(y).manual = false;
      this.invalidate();
      return;
    }
    this.finishPlacing();
  };

  private onPointerLeave = () => {
    this.crosshair.clear();
    this.setTradeHoverCursor(false);
    this.invalidate();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { x } = this.toLocal(e);
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const { y } = this.toLocal(e);
      const pane = this.paneAt(y);
      const { min, max } = pane.priceScale.range;
      const mid = (min + max) / 2;
      const half = ((max - min) / 2) * factor;
      pane.manual = true; // 价格轴缩放同样锁定
      pane.priceScale.setRange(mid - half, mid + half);
    } else {
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      this.viewport.zoomAt(x, factor);
    }
    this.viewportCommitCb?.(this.getViewport());
    this.invalidate();
  };

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('dblclick', this.onDoubleClick);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindInput(canvas: HTMLCanvasElement) {
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    canvas.removeEventListener('wheel', this.onWheel);
  }

  // ---------- 绘制 ----------

  private layout(): void {
    const chartH = this.manager.height - AXIS_HEIGHT;
    const total = this.panes.reduce((s, p) => s + p.heightRatio, 0);
    let y = 0;
    for (const pane of this.panes) {
      pane.height = (chartH * pane.heightRatio) / total - PANE_GAP;
      pane.y = y;
      y += pane.height + PANE_GAP;
      pane.priceScale.setSize(pane.height);
    }
  }

  /** 确保面板价格轴尺寸与自适应范围最新（rAF 暂停时拖拽换算也正确） */
  private ensurePriceScaleReady(pane: PaneState): void {
    this.layout();
    const { from, to } = this.visibleRange();
    if (to < from) return;
    let low = Infinity;
    let high = -Infinity;
    for (let i = from; i <= to; i++) {
      const bar = this.displaySeries.barAt(i)!;
      if (bar.low < low) low = bar.low;
      if (bar.high > high) high = bar.high;
    }
    if (low !== Infinity) {
      pane.priceScale.setLogMode(this.logScale);
      pane.priceScale.autoScale(low, high);
    }
  }

  private visibleRange(): { from: number; to: number } {
    const count = this.displaySeries.length;
    let from = Math.max(0, Math.floor(this.viewport.first));
    let to = Math.min(count - 1, from + Math.ceil((this.manager.width - AXIS_WIDTH) / this.viewport.spacing));
    // 复盘模式：隐藏 index 之后的 K 线
    if (this.replayIndex !== null) to = Math.min(to, this.replayIndex);
    if (to < from) from = Math.max(0, to); // 防御：永远不出现空可视域
    return { from, to };
  }

  /** 指标计算用的只读 bar 数组（零拷贝） */
  private barsArray(): readonly Bar[] {
    return this.displaySeries.raw();
  }

  /** 指标在指定 index 的首个 plot 值（副图图例用） */
  private indicatorValueAt(inst: IndicatorInstance, index: number): number | null {
    const vals = indicatorValuesAt(inst, this.barsArray(), Math.max(0, index - 50), index);
    return vals.length > 0 ? vals[0].value : null;
  }

  private draw(): void {
    const t0 = performance.now();
    const ctx = this.manager.context;
    const w = this.manager.width;
    const h = this.manager.height;

    this.manager.beginFrame();
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    if (this.displaySeries.length === 0) {
      this.lastFrameMs = performance.now() - t0;
      return;
    }
    this.layout();

    const { from, to } = this.visibleRange();
    if (to < from) {
      this.lastFrameMs = performance.now() - t0;
      return;
    }

    const selected = this.selectedPane();
    for (const pane of this.panes) {
      const geo: DrawGeometry = { chartW: w - AXIS_WIDTH, chartH: pane.height };
      ctx.save();
      ctx.translate(0, pane.y);

      if (pane.kind === 'indicator') {
        this.autoscaleIndicators(pane, from, to);
        drawGrid(ctx, this.viewport, pane.priceScale, geo);
        for (const inst of pane.indicators) {
          drawIndicator(ctx, inst, this.barsArray(), from, to, this.viewport, pane.priceScale, geo);
        }
      } else {
        this.autoscalePrice(pane, from, to);
        drawGrid(ctx, this.viewport, pane.priceScale, geo);
        this.drawPriceSeries(ctx, pane, geo, from, to);
        // 主图叠加指标
        for (const inst of pane.indicators) {
          drawIndicator(ctx, inst, this.barsArray(), from, to, this.viewport, pane.priceScale, geo);
        }
      }

      // 每面板数值轴：主面板全精度，副面板紧凑格式（K/M）
      drawPriceAxis(ctx, pane.priceScale, this.legend.decimals, geo, pane.kind !== 'price');

      // 选中面板淡色高亮（内容与轴之后绘制，避免冲淡文字/按钮）
      pane.headerBtns = null;
      if (pane.id === selected.id) {
        ctx.fillStyle = theme.paneActive;
        ctx.fillRect(0, 0, w, geo.chartH);
      }

      // 副图面板：指标图例（左上角）+ 选中时的操作按钮（右上角）
      if (pane.kind === 'indicator' && pane.indicators.length > 0) {
        const inst = pane.indicators[0];
        const value = this.indicatorValueAt(inst, to);
        drawPaneLegend(
          ctx,
          inst.name,
          value === null ? '' : formatCompact(value),
          inst.def.plots[0]?.style.color ?? theme.axisText,
        );
        if (pane.id === selected.id) {
          pane.headerBtns = drawPaneButtons(ctx, geo);
        }
      }

      // 手动价格域指示：“自动”恢复按钮（价格轴底部）
      pane.autoBtn = null;
      if (pane.manual) {
        const text = '自动';
        ctx.font = '10px system-ui, sans-serif';
        const bw = ctx.measureText(text).width + 14;
        const bh = 16;
        const bx = geo.chartW + (AXIS_WIDTH - bw) / 2;
        const by = geo.chartH - bh - 4;
        ctx.fillStyle = theme.tooltipBg;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = theme.axisLine;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = theme.axisText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + bw / 2, by + bh / 2);
        pane.autoBtn = { x: bx, y: by, w: bw, h: bh };
      }

      ctx.restore();
    }

    // 面板分隔线：各副图面板顶边（贯穿含数值轴的全宽，TV 风格）
    ctx.strokeStyle = theme.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let pi = 1; pi < this.panes.length; pi++) {
      const sy = Math.round(this.panes[pi].y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // 共享时间轴 + 边框 + 十字光标（全画布坐标）
    const mainGeo: DrawGeometry = { chartW: w - AXIS_WIDTH, chartH: h - AXIS_HEIGHT };
    drawTimeAxis(ctx, this.displaySeries, this.viewport, mainGeo);
    drawBorders(ctx, mainGeo);

    // 画线层（主面板局部坐标）
    const main = this.panes[0];
    ctx.save();
    ctx.translate(0, main.y);
    drawDrawings(ctx, this.drawingLayer.list(), this.drawingLayer.selected?.id ?? null, this.drawingCtx(), this.legend.decimals);
    // 交易可视化：挂单线 / 持仓线 / TP-SL / K 线进出场标记
    drawTrading(
      ctx,
      this.tradeVisual,
      main.priceScale,
      { chartW: this.manager.width - AXIS_WIDTH, chartH: main.height },
      this.legend.decimals,
      this.displaySeries,
      this.viewport,
    );
    if (this.activeTool && this.placing.length > 0) {
      const pts = this.previewPoint ? [...this.placing, this.previewPoint] : this.placing;
      const def = getToolDef(this.activeTool);
      drawDrawings(
        ctx,
        [{ id: '__preview', type: this.activeTool, points: pts, style: { ...def.defaultStyle, color: theme.crosshair }, locked: false, visible: true }],
        null,
        this.drawingCtx(),
        this.legend.decimals,
      );
    }
    ctx.restore();

    const hoveredPane = this.panes.find((p) => p.id === this.hoveredPaneId) ?? this.panes[0];
    const hoveredBar = this.crosshair.bar(this.displaySeries);
    // 主图叠加指标在悬停 bar 上的值（图例展示）
    const legendIndicators: Array<{ name: string; values: Array<{ label: string; value: number }> }> = [];
    const mainPane = this.panes[0];
    const legendIndex = this.crosshair.visible && hoveredBar ? this.crosshair.barIndex : this.displaySeries.length - 1;
    if (mainPane.indicators.length > 0 && legendIndex >= 0) {
      const bars = this.barsArray();
      for (const inst of mainPane.indicators) {
        legendIndicators.push({ name: inst.name, values: indicatorValuesAt(inst, bars, Math.max(0, legendIndex - 50), legendIndex) });
      }
    }
    drawCrosshair(
      ctx,
      this.crosshair,
      hoveredBar,
      this.displaySeries.last,
      this.viewport,
      hoveredPane.priceScale,
      mainGeo,
      this.legend,
      hoveredPane.y,
      hoveredPane.height,
      legendIndicators,
    );

    // 联动：其他图表十字光标时间的垂直参考线
    if (this.syncCrosshairTime !== null && !this.crosshair.visible) {
      const idx = this.displaySeries.indexOfTime(this.syncCrosshairTime);
      if (idx >= 0) {
        const sx = this.viewport.indexToX(idx);
        if (sx >= 0 && sx <= mainGeo.chartW) {
          ctx.strokeStyle = theme.crosshair;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(Math.round(sx) + 0.5, 0);
          ctx.lineTo(Math.round(sx) + 0.5, mainGeo.chartH);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // 选择K线预览线：实线 + 剪刀图标 + 线右侧淡蒙层（选中后由复盘标记线取代）
    if (this.barSelectMode && this.selectPreviewX !== null) {
      const px = this.selectPreviewX;
      if (px >= 0 && px <= mainGeo.chartW) {
        // 线右侧淡蒙层（“未来”区域提示）
        ctx.fillStyle = 'rgba(41, 98, 255, 0.06)';
        ctx.fillRect(px, 0, mainGeo.chartW - px, mainGeo.chartH);
        // 实线
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(Math.round(px) + 0.5, 0);
        ctx.lineTo(Math.round(px) + 0.5, mainGeo.chartH);
        ctx.stroke();
        // 顶端剪刀图标
        drawScissors(ctx, px, 10);
      }
    }

    // 回放位置不绘制标记（蒙层/竖线/标签），图表截至该 K 线即为标示
    this.lastFrameMs = performance.now() - t0;
  }


  private autoscalePrice(pane: PaneState, from: number, to: number): void {
    let low = Infinity;
    let high = -Infinity;
    for (let i = from; i <= to; i++) {
      const bar = this.displaySeries.barAt(i)!;
      if (bar.low < low) low = bar.low;
      if (bar.high > high) high = bar.high;
    }
    // 叠加指标参与主图价格域
    const bars = this.barsArray();
    for (const inst of pane.indicators) {
      const r = indicatorRange(inst, bars, from, to);
      if (r.low < low) low = r.low;
      if (r.high > high) high = r.high;
    }
    if (low === Infinity) return;
    pane.priceScale.setLogMode(this.logScale);
    if (pane.manual) return; // 手动价格域：保持当前范围
    pane.priceScale.autoScale(low, high);
  }

  private autoscaleIndicators(pane: PaneState, from: number, to: number): void {
    if (pane.manual) return;
    let low = Infinity;
    let high = -Infinity;
    const bars = this.barsArray();
    for (const inst of pane.indicators) {
      const r = indicatorRange(inst, bars, from, to);
      if (r.low < low) low = r.low;
      if (r.high > high) high = r.high;
    }
    if (low === Infinity) return;
    // 含零轴（histogram 需要）
    pane.priceScale.autoScale(Math.min(low, 0), Math.max(high, 0));
  }

  private drawPriceSeries(
    ctx: CanvasRenderingContext2D,
    pane: PaneState,
    geo: DrawGeometry,
    from: number,
    to: number,
  ): void {
    // 面板局部坐标：绘制内容已通过 translate 偏移
    const vs = this.viewport;
    const ps = pane.priceScale;
    switch (this.chartType) {
      case 'ohlc':
        drawOhlc(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'line':
        drawLine(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'area':
        drawArea(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'baseline': {
        let low = Infinity;
        let high = -Infinity;
        for (let i = from; i <= to; i++) {
          const c = this.displaySeries.barAt(i)!.close;
          if (c < low) low = c;
          if (c > high) high = c;
        }
        drawBaseline(ctx, this.displaySeries, from, to, vs, ps, geo, (low + high) / 2);
        break;
      }
      default:
        // candles / hollow / heikin-ashi / renko / kagi / line-break / pnf / range
        drawCandles(ctx, this.displaySeries, from, to, vs, ps, geo);
    }
  }
}

/** 绘制剪刀图标（选择K线预览线顶端标记，蓝底白字） */
function drawScissors(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#2962ff';
  ctx.fill();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('✀', x, y + 0.5);
  ctx.restore();
}
