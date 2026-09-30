import { CanvasManager } from '../canvas/CanvasManager';
import { Viewport } from '../viewport/Viewport';
import { Crosshair } from '../crosshair/Crosshair';
import { TIMEFRAMES, type Bar, type ChartTypeId, type Timeframe } from '@/types/market';
import { CloseCountdown } from '../countdown';
import type { IndicatorInstance, IndicatorOptions } from '@/indicators/core/instance';
import { serializeDrawings, deserializeDrawings, type Drawing, type DrawingTypeId } from '../drawing/types';
import { AnchorDropState } from '../drawing/anchorDrop';
import { pixelToPoint, type DrawContext } from '../drawing/drawDrawings';
import type { TradeVisual } from './drawTrading';
import type { LegendInfo, LegendOptions } from './drawCrosshair';
import type { GridMode } from './drawAxes';
import type { ViewportTimeRange } from '@/store/syncBus';
import { SyncBridge } from './SyncBridge';
import { ensurePriceScaleReady, type ScalablePane } from './autoscale';
import { AXIS_WIDTH, AXIS_HEIGHT, ChartState, type PaneState } from './ChartState';
import type { IndicatorInfo } from './IndicatorManager';
import { PanZoomGesture } from './PanZoomGesture';
import { DrawingGesture } from './DrawingGesture';
import { TradeGesture, type TradeCallbacks } from './TradeGesture';
import { HoverController } from './HoverController';
import { InputController, type InputHost } from './InputController';
import { PaneRenderer, type PaneRenderHost } from './PaneRenderer';
import { RenderPipeline } from './RenderPipeline';

/**
 * 图表控制器（D 批次拆分④；架构映射：ChartRenderer 门面化）。
 * 公开 API 全量委托：状态迁移给 ChartState，输入给 InputController + 三手势，
 * 帧绘制给 RenderPipeline + PaneRenderer，联动给 SyncBridge；
 * 本类只做装配、生命周期（rAF/dispose）与少量跨模块编排（画线上下文/倒计时）。
 */

export class ChartController {
  private manager: CanvasManager;
  private viewport: Viewport;
  private crosshair = new Crosshair();
  /** 跨图表联动边界（D 批次拆分①） */
  private sync: SyncBridge;
  private state: ChartState;
  private panzoom: PanZoomGesture;
  private drawing: DrawingGesture;
  private trade: TradeGesture;
  private hover: HoverController;
  private input: InputController;
  private pipeline: RenderPipeline;
  private legend: LegendInfo;
  private countdown = new CloseCountdown();
  private rafId = 0;
  private dirty = true;
  private disposed = false;
  /** 最近一帧绘制耗时（ms），供性能监控与测试 */
  lastFrameMs = 0;
  private drawingsListeners = new Set<() => void>();
  // 交互回调（UI 层经 setXxxCallback 注册）
  private studyActionCb: ((action: 'hide' | 'settings' | 'remove', uid: string) => void) | null = null;
  private drawingSettingsCb: ((id: string) => void) | null = null;
  private priceLineDblClickCb: (() => void) | null = null;
  private legendMenuCb: ((x: number, y: number) => void) | null = null;
  private drawingMenuCb: ((id: string, x: number, y: number) => void) | null = null;
  private chartClickCb: ((price: number, time: number, clientX: number, clientY: number) => void) | null = null;
  private contextMenuCb: ((price: number, time: number, clientX: number, clientY: number) => void) | null = null;
  private paneActionCb: ((action: 'settings' | 'remove', indicatorId: string) => void) | null = null;
  private barSelectCb: ((index: number) => void) | null = null;
  /** AVWAP 锚定落点状态机（P2-B：active = 选 bar 模式由 AVWAP 持有） */
  private anchorDrop = new AnchorDropState();

  constructor(canvas: HTMLCanvasElement, bars: Bar[] = [], legend?: Partial<LegendInfo>) {
    this.manager = new CanvasManager(canvas);
    this.viewport = new Viewport(this.manager.width - AXIS_WIDTH);
    this.legend = { symbol: 'BTC/USDT', interval: '1m', decimals: 2, ...legend };
    this.countdown.setTimeframe(this.resolveTimeframe());
    // Model 层：viewport/crosshair/countdown 注入，重绘经 invalidate 上送
    this.state = new ChartState(this.viewport, this.crosshair, this.countdown, () => this.manager.width - AXIS_WIDTH, () => this.invalidate());
    this.state.initData(bars);
    // 联动边界：viewport 直接注入；displaySeries/画布宽/重绘请求用 getter（随图表类型与尺寸变化）
    this.sync = new SyncBridge(this.viewport, () => this.state.displaySeries, () => this.manager.width - AXIS_WIDTH, () => this.invalidate());
    this.manager.onResize(() => {
      this.viewport.setSize(this.manager.width - AXIS_WIDTH);
      this.invalidate();
    });
    // 输入层装配：host 提供几何/序列/状态/回调的结构子集，各模块持窄接口，依赖只向下
    const inputHost: InputHost = {
      manager: this.manager,
      canvas: this.manager.canvas,
      viewport: this.viewport,
      crosshair: this.crosshair,
      panes: () => this.state.panes,
      paneAt: (y) => this.paneAt(y),
      separatorIndexAt: (y) => this.separatorIndexAt(y),
      displaySeries: () => this.state.displaySeries,
      invalidate: () => this.invalidate(),
      notifyDrawings: () => this.notifyDrawings(),
      layout: () => this.state.layout(this.manager.height - AXIS_HEIGHT),
      chartW: () => this.manager.width - AXIS_WIDTH,
      chartH: () => this.manager.height - AXIS_HEIGHT,
      drawingCtx: () => this.drawingCtx(),
      mainPaneY: () => this.state.panes[0].y,
      mainPane: () => this.state.panes[0],
      drawingsLocked: () => this.state.drawingsLocked,
      publishViewport: () => this.sync.publishViewport(),
      publishCrosshairTime: (t) => this.sync.publishCrosshairTime(t),
      selectPane: (id) => (this.state.selectedPaneId = id),
      setHoveredPane: (id) => (this.state.hoveredPaneId = id),
      setSelectPreviewX: (x) => (this.state.selectPreviewX = x),
      studyRects: () => this.state.studyRects,
      barSelectMode: () => this.state.barSelectMode,
      replayIndex: () => this.state.replayIndex,
      barSelected: (rawIndex) => {
        const idx = Math.min(Math.max(rawIndex, 0), Math.max(0, this.state.displaySeries.length - 1));
        this.barSelectCb?.(idx);
        this.setBarSelectMode(false, null);
      },
      ensurePaneScaleReady: (pane) => this.ensurePaneScaleReady(pane),
      finishPlacing: () => this.finishPlacing(),
      studyActionCb: () => this.studyActionCb,
      paneActionCb: () => this.paneActionCb,
      chartClickCb: () => this.chartClickCb,
      contextMenuCb: () => this.contextMenuCb,
      legendMenuCb: () => this.legendMenuCb,
      drawingMenuCb: () => this.drawingMenuCb,
      drawingSettingsCb: () => this.drawingSettingsCb,
      priceLineDblClickCb: () => this.priceLineDblClickCb,
    };
    this.panzoom = new PanZoomGesture(inputHost);
    this.drawing = new DrawingGesture(inputHost);
    this.trade = new TradeGesture(inputHost);
    this.hover = new HoverController(inputHost, this.drawing, this.trade);
    this.input = new InputController(inputHost, this.panzoom, this.drawing, this.trade, this.hover);
    // 渲染层装配：单面板渲染 + 帧编排
    const paneHost: PaneRenderHost = {
      viewport: this.viewport,
      series: () => this.state.displaySeries,
      canvasW: () => this.manager.width,
      chartW: () => this.manager.width - AXIS_WIDTH,
      chartType: () => this.state.chartType,
      gridMode: () => this.state.gridMode,
      hideStudies: () => this.state.hideStudies,
      timeframeId: () => this.legend.timeframeId,
      decimals: () => this.legend.decimals,
      percentOn: () => this.state.percentOn,
      selectedPaneId: () => this.state.selectedPane().id,
    };
    this.pipeline = new RenderPipeline(
      {
        manager: this.manager,
        viewport: this.viewport,
        crosshair: this.crosshair,
        state: this.state,
        legend: () => this.legend,
        sync: this.sync,
        drawing: this.drawing,
        trade: this.trade,
        drawingCtx: () => this.drawingCtx(),
        countdownText: (now) => this.countdownText(now),
        setLastFrameMs: (ms) => (this.lastFrameMs = ms),
        hoveredStudyUid: () => this.hover.hoveredStudyUid,
      },
      new PaneRenderer(paneHost),
    );
    this.input.bind(canvas);
    this.state.applyData(true);
  }

  /** 订阅画线变更（对象树等 React UI 用） */
  onDrawingsChanged(cb: () => void): () => void {
    this.drawingsListeners.add(cb);
    return () => this.drawingsListeners.delete(cb);
  }

  private notifyDrawings(): void {
    for (const cb of this.drawingsListeners) cb();
  }

  // ---------- 公开 API ----------

  setLegend(legend: Partial<LegendInfo>): void {
    this.legend = { ...this.legend, ...legend };
    this.countdown.setTimeframe(this.resolveTimeframe()); // 周期切换 → 重算倒计时
    this.invalidate();
  }

  /** 日历桶时区（分钟，东为正）：crypto=UTC / CN 源=本地（bar 时间戳语义决定，见 data/tz.ts） */
  setCalendarTzOffset(minutes: number): void {
    this.countdown.setCalendarTzOffset(minutes);
    this.invalidate();
  }

  setData(bars: Bar[]): void { this.state.setData(bars); }
  updateBar(bar: Bar): void { this.state.updateBar(bar); }

  /** 前插更早的历史（懒加载），保持当前视口不跳动 */
  prependBars(bars: Bar[]): void {
    if (bars.length === 0) return;
    this.state.prependData(bars);
    this.viewport.panByBars(bars.length);
    this.notifyDrawings();
    this.invalidate();
  }

  setChartType(type: ChartTypeId): void { this.state.setChartType(type); }
  get chartTypeNow(): ChartTypeId { return this.state.chartType; }
  setLogScale(on: boolean): void { this.state.setLogScale(on); }
  setAutoScale(on: boolean): void { this.state.setAutoScale(on); }
  get isAutoScale(): boolean { return this.state.autoScaleOn; }
  setDrawingsHidden(hidden: boolean): void { this.state.setDrawingsHidden(hidden); }
  setPercentMode(on: boolean): void { this.state.setPercentMode(on); }
  setDrawingsLocked(locked: boolean): void { this.state.setDrawingsLocked(locked); }
  setLegendOptions(options: Partial<LegendOptions>): void { this.state.setLegendOptions(options); }
  setStudyActionCallback(cb: ((action: 'hide' | 'settings' | 'remove', uid: string) => void) | null): void { this.studyActionCb = cb; }
  setToolFinishedCallback(cb: (() => void) | null): void { this.drawing.setToolFinishedCallback(cb); }
  setDrawingSettingsCallback(cb: ((id: string) => void) | null): void { this.drawingSettingsCb = cb; }
  /** 双击最新价线打开图表设置（TV：double-click on the price line → settings） */
  setPriceLineDblClickCallback(cb: (() => void) | null): void { this.priceLineDblClickCb = cb; }
  setLegendMenuCallback(cb: ((x: number, y: number) => void) | null): void { this.legendMenuCb = cb; }
  setDrawingMenuCallback(cb: ((id: string, x: number, y: number) => void) | null): void { this.drawingMenuCb = cb; }
  setHideStudies(hidden: boolean): void { this.state.setHideStudies(hidden); }
  get studiesHidden(): boolean { return this.state.hideStudies; }
  /** 回放位置公开读 API（拆分前为实例私有字段、运行时经 window.__chartRenderer 可读；
   *  D 批次迁入 ChartState 后补此 getter 保持对外读取面不变——E2E 回放用例依赖） */
  get replayIndex(): number | null { return this.state.replayIndex; }
  setGridMode(mode: GridMode): void { this.state.setGridMode(mode); }
  setBordersVisible(visible: boolean): void { this.state.setBordersVisible(visible); }
  setWatermarkVisible(visible: boolean): void { this.state.setWatermarkVisible(visible); }
  get watermarkOn(): boolean { return this.state.watermarkVisible; }
  resetPriceScale(): void { this.state.resetPriceScale(); }

  // ---------- 指标 ----------

  addIndicator(id: string, options?: IndicatorOptions): string | null {
    const uid = this.state.indicators.add(id, options);
    // AVWAP（P2-B）：无锚点参数添加 → 进入选 bar 模式，图表点击落点即为锚定 bar
    // （复用画线锚定落点交互：与 fib-auto 同款的「单击图表解析 bar」模式）
    if (id === 'avwap' && uid && options?.params?.anchorTime === undefined) {
      this.beginAvwapAnchor(uid);
    }
    return uid;
  }

  removeIndicator(uid: string): void {
    // 被锚定的实例被移除：退出选 bar 模式（回调目标已不存在）
    if (this.anchorDrop.target === uid) {
      this.anchorDrop.cancel();
      this.setBarSelectMode(false, null);
    }
    this.state.indicators.remove(uid);
  }

  updateIndicator(uid: string, options: IndicatorOptions): void {
    // AVWAP 锚点保持：store 侧参数不含 anchorTime 时沿用实例当前值（UI 改色不丢锚）
    const inst = this.findIndicator(uid);
    if (inst?.id === 'avwap' && options.params && options.params.anchorTime === undefined) {
      options = { ...options, params: { ...options.params, anchorTime: inst.params.anchorTime } };
    }
    this.state.indicators.update(uid, options);
  }

  listIndicators(): IndicatorInfo[] { return this.state.indicators.list(); }
  exportIndicatorTemplate(): Array<{ id: string; params: Record<string, string | number | boolean> }> { return this.state.indicators.exportTemplate(); }
  importIndicatorTemplate(list: Array<{ id: string; params?: Record<string, string | number | boolean> }>): void { this.state.indicators.importTemplate(list); }

  /** 按 uid 找指标实例（AVWAP 锚点保持用；不建索引，面板数量极小） */
  private findIndicator(uid: string): IndicatorInstance | undefined {
    for (const pane of this.state.panes) {
      const inst = pane.indicators.find((i) => i.uid === uid);
      if (inst) return inst;
    }
    return undefined;
  }

  /** AVWAP 锚定落点（P2-B）：选 bar 模式开启后，单击图表即把该 bar 时间写为实例锚点 */
  private beginAvwapAnchor(uid: string): void {
    this.anchorDrop.begin(uid, (u, barTime) => this.updateIndicator(u, { params: { anchorTime: barTime } }));
    this.setBarSelectMode(true, (idx) => {
      const bar = this.state.displaySeries.barAt(idx);
      if (bar) this.anchorDrop.drop(bar.time);
    });
    this.invalidate();
  }

  // ---------- 生命周期 ----------

  start(): void {
    if (this.rafId || this.disposed) return;
    const loop = () => {
      if (this.disposed) return;
      if (this.dirty) {
        this.dirty = false;
        this.pipeline.draw();
      } else if (this.countdown.needsRedraw(Date.now())) {
        // 收盘倒计时秒级唤醒：借既有 rAF 合帧机制，不另起定时器抢帧
        // （Date.now 为纪元毫秒，与 bar time 同一时钟；performance.now 是页面相对时间，不可用）
        this.dirty = true;
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
    this.countdown.reset();
    this.input.unbind(this.manager.canvas);
    this.manager.dispose();
  }

  invalidate(): void { this.dirty = true; }

  /** 强制立即重绘（主题切换等需要零延迟的场景，不等 rAF） */
  redraw(): void {
    this.dirty = false;
    this.pipeline.draw();
  }

  /** 视口首个可见 bar 的 index（懒加载检测用） */
  get viewportFirst(): number { return this.viewport.first; }

  /** 截图：画布 PNG dataURL */
  screenshot(): string { return this.manager.canvas.toDataURL('image/png'); }

  // ---------- 复盘 / 选线 / 视口 ----------

  /** 复盘模式：只渲染到指定 index（null = 关闭）；首次选中居中，播放/越界贴右带入 */
  setReplayIndex(index: number | null): void {
    const st = this.state;
    const prev = st.replayIndex;
    st.replayIndex = index;
    this.viewport.setReplayEdge(index);
    if (index !== null && st.displaySeries.length > 0) {
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
    this.barSelectCb = cb;
    this.state.setBarSelectMode(on);
  }

  /** 注册图表空白处点击回调（弹出下单浮窗） */
  setChartClickCallback(cb: ((price: number, time: number, clientX: number, clientY: number) => void) | null): void { this.chartClickCb = cb; }
  setContextMenuCallback(cb: ((price: number, time: number, clientX: number, clientY: number) => void) | null): void { this.contextMenuCb = cb; }

  /** 重置视图：恢复自动价格适配并让最新 K 线贴右 */
  resetView(): void {
    this.state.resetPriceScale();
    this.viewport.scrollToRealtime();
    this.invalidate();
  }

  scrollToRealtime(): void {
    this.viewport.scrollToRealtime();
    this.invalidate();
  }

  /** 显示 fromTime 以来的区间（底部时间范围预设条：1D/5D/1M…）。
   *  二分定位首个 >= fromTime 的 K 线，右侧留少量呼吸；无匹配时回到实时。 */
  showRange(fromTime: number): void {
    if (fromTime <= 0) {
      this.viewport.setFirstPublic(0);
      this.invalidate();
      return;
    }
    const series = this.state.displaySeries;
    const n = series.length;
    let lo = 0;
    let hi = n - 1;
    let ans = n;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (series.barAt(mid)!.time >= fromTime) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    if (ans >= n) {
      this.scrollToRealtime();
      return;
    }
    this.viewport.setFirstPublic(Math.max(0, ans - 4));
    this.invalidate();
  }

  get atRightEdge(): boolean { return this.viewport.isAtRightEdge(); }

  /** 以画布中心为锚点缩放 */
  zoom(factor: number): void {
    this.viewport.zoomAt(this.manager.width / 2, factor);
    this.sync.publishViewport();
    this.invalidate();
  }

  pan(bars: number): void {
    this.viewport.panByBars(bars);
    this.sync.publishViewport();
    this.invalidate();
  }

  /** 注册面板头部按钮回调（选中副图面板后显示 设置/移除） */
  setPaneActionCallback(cb: ((action: 'settings' | 'remove', indicatorId: string) => void) | null): void { this.paneActionCb = cb; }

  // ---------- 交易可视化 ----------

  setTradeVisual(visual: TradeVisual): void { this.trade.setVisual(visual); }
  setTradeCallbacks(cbs: TradeCallbacks): void { this.trade.setCallbacks(cbs); }

  // ---------- 联动 ----------

  /** 联动：外部图表十字光标时间（绘制垂直参考线） */
  setSyncCrosshair(time: number | null): void { this.sync.setSyncCrosshair(time); }

  /** 联动：外部视口变化（平移/缩放广播，索引空间） */
  setSyncViewport(v: { first: number; spacing: number }): void { this.sync.setSyncViewport(v); }

  /**
   * 联动发布：当前视口的时间空间范围 {fromTime, toTime}（供 syncBus 广播）。
   * 跨周期/跨品种图表按 TV 语义对齐时间轴——接收方用自己的 series 换算，
   * 因此这里广播时间而非索引（索引空间跨周期会错位）。
   */
  getViewportTimeRange(): ViewportTimeRange { return this.sync.getViewportTimeRange(); }

  /**
   * 联动接收：按时间范围对齐视口——用自己的 BarSeries.fractionalIndexAt 把
   * {fromTime, toTime} 换算回索引/间距（TV 时间轴同步语义）。
   * 无效载荷（非有限值/空区间/空序列）安全忽略，不扰动当前视口。
   */
  setViewportTimeRange(range: ViewportTimeRange): void { this.sync.setViewportTimeRange(range); }
  getViewport(): { first: number; spacing: number } { return this.sync.getViewport(); }

  /** 视口提交（拖拽/缩放结束）回调，用于多图表联动 */
  onViewportCommit(cb: ((v: { first: number; spacing: number }) => void) | null): void { this.sync.onViewportCommit(cb); }

  /** 十字光标所在 bar 时间回调，用于多图表联动 */
  onCrosshairTime(cb: ((t: number | null) => void) | null): void { this.sync.onCrosshairTime(cb); }

  /** 最新 bar 时间戳（缺口检测用） */
  get lastBarTime(): number { return this.state.lastBarTime; }

  /** 当前全部 bar（缺口回补合并用） */
  getBars(): Bar[] { return [...this.state.baseSeries.raw()]; }

  // ---------- 画线 ----------

  /** 设置当前工具（null = 光标模式） */
  setActiveTool(tool: DrawingTypeId | null): void {
    // AVWAP 锚定落点进行中切换工具 = 放弃锚定（退出选 bar 模式）
    if (this.anchorDrop.active) {
      this.anchorDrop.cancel();
      this.setBarSelectMode(false, null);
    }
    this.drawing.setTool(tool);
  }
  setMagnet(on: boolean): void { this.drawing.layer.setMagnet(on); }

  /** 磁吸档位：weak（50px 内吸附）/ strong（始终吸附） */
  setMagnetMode(mode: 'weak' | 'strong'): void { this.drawing.layer.setMagnetMode(mode); }
  get magnetMode(): 'weak' | 'strong' { return this.drawing.layer.mode; }

  /** 清空全部画线 */
  clearDrawings(): void { this.drawing.layer.clear(); this.notifyDrawings(); this.invalidate(); }

  /** 克隆画线（偏移少量像素，避免与原图完全重合） */
  duplicateDrawing(id: string): void {
    const src = this.drawing.layer.list().find((d) => d.id === id);
    if (!src) return;
    const iv = this.state.displaySeries.length > 1 ? this.state.displaySeries.raw()[1].time - this.state.displaySeries.raw()[0].time : 60_000;
    const span = this.state.panes[0].priceScale.range;
    const dPrice = (span.max - span.min) * 0.02;
    const clone = this.drawing.layer.add(src.type, src.points.map((p) => ({ time: p.time + iv * 3, price: p.price + dPrice })), src.style);
    this.drawing.layer.select(clone.id);
    this.notifyDrawings();
    this.invalidate();
  }

  listDrawings(): Drawing[] { return [...this.drawing.layer.list()]; }
  get selectedDrawingId(): string | null { return this.drawing.layer.selected?.id ?? null; }
  updateDrawingStyle(id: string, style: Partial<Drawing['style']>): void { this.drawing.layer.updateStyle(id, style); this.notifyDrawings(); this.invalidate(); }
  setDrawingVisible(id: string, visible: boolean): void { this.drawing.layer.setVisible(id, visible); this.notifyDrawings(); this.invalidate(); }
  setDrawingLocked(id: string, locked: boolean): void { this.drawing.layer.setLocked(id, locked); this.notifyDrawings(); this.invalidate(); }

  /** 选中画线（对象树点击行） */
  selectDrawing(id: string | null): void { this.drawing.layer.select(id); this.invalidate(); }

  /** Ctrl+点击切换多选集合成员（对象树/画布同语义） */
  toggleDrawingSelection(id: string): void { this.drawing.layer.toggleSelect(id); this.notifyDrawings(); this.invalidate(); }

  /** 多选集合（B7：Ctrl+点击累积；对象树高亮/ Delete 删除用） */
  get selectedDrawingIds(): string[] { return this.drawing.layer.selectedIdList; }

  /** 是否存在选中画线（方向键微调 vs 视口平移的路由判据） */
  hasSelectedDrawing(): boolean { return this.drawing.layer.selectedIdList.length > 0; }

  /** 方向键微调（B7）：以像素步长平移全部选中对象，Shift = 大步长。
   *  每次调用为单步历史（入撤销栈）；无选中返回 false 不改动。 */
  nudgeSelectedDrawing(dxPx: number, dyPx: number): boolean {
    if (this.drawing.layer.selectedIdList.length === 0) return false;
    const dctx = this.drawingCtx();
    const p0 = pixelToPoint(0, 0, dctx, 'off');
    const p1 = pixelToPoint(dxPx, dyPx, dctx, 'off');
    const dt = p1.time - p0.time;
    const dp = p1.price - p0.price;
    if (dt === 0 && dp === 0) return false;
    this.drawing.layer.beginHistory();
    const moved = this.drawing.layer.translateSelected(dt, dp);
    if (!moved) return false;
    this.notifyDrawings();
    this.invalidate();
    return true;
  }

  /** 视觉顺序：置于顶层/上移一层/下移一层/置于底层 */
  setDrawingOrder(id: string, action: 'front' | 'forward' | 'backward' | 'back'): void { this.drawing.layer.setOrder(id, action); this.notifyDrawings(); this.invalidate(); }
  removeDrawing(id: string): void { this.drawing.layer.remove(id); this.notifyDrawings(); this.invalidate(); }
  removeSelectedDrawing(): void { this.drawing.layer.removeSelected(); this.notifyDrawings(); this.invalidate(); }
  undoDrawing(): void { this.drawing.layer.undo(); this.notifyDrawings(); this.invalidate(); }
  redoDrawing(): void { this.drawing.layer.redo(); this.notifyDrawings(); this.invalidate(); }
  exportDrawings(): string { return serializeDrawings(this.drawing.layer.list()); }
  importDrawings(raw: string): void { this.drawing.layer.replaceAll(deserializeDrawings(raw)); this.notifyDrawings(); this.invalidate(); }

  /** 完成路径类画线（双击/回车）：path 既有语义 +
   *  P2-B 多边形（≥3 顶点）/ 艾略特波浪（≥2 锚点）支持提前收尾（不足则继续累积） */
  finishPlacing(): void {
    const tool = this.drawing.tool;
    const minPoints = tool === 'polygon' ? 3 : tool === 'elliott-wave' ? 2 : 0;
    if (tool && minPoints > 0 && this.drawing.placingPoints.length >= minPoints) {
      this.drawing.layer.add(tool, this.drawing.placingPoints);
      this.drawing.setTool(tool); // 重置放置态并保持工具激活（可连续放置下一条）
      this.notifyDrawings();
      return;
    }
    this.drawing.finishPlacing();
  }

  /** Esc：取消放置并退出多选（TV：Esc 取消当前操作并取消选择）。
   *  P2-B 附加语义：测量对象被选中时一并移除（浮层临时对象，Esc 即取消）；
   *  AVWAP 锚定落点中进行时退出选 bar 模式。 */
  cancelPlacing(): void {
    const selected = this.drawing.layer.selected;
    if (selected?.type === 'measure') {
      this.drawing.layer.remove(selected.id);
      this.notifyDrawings();
    }
    if (this.anchorDrop.active) {
      this.anchorDrop.cancel();
      this.setBarSelectMode(false, null);
    }
    this.drawing.cancelPlacing();
  }

  // ---------- 内部：跨模块编排 ----------

  /** 主面板局部绘制上下文 */
  private drawingCtx(): DrawContext {
    const main = this.state.panes[0];
    return {
      viewport: this.viewport,
      priceScale: main.priceScale,
      series: this.state.displaySeries,
      geo: { chartW: this.manager.width - AXIS_WIDTH, chartH: main.height },
    };
  }

  private paneAt(y: number): PaneState {
    for (const pane of this.state.panes) {
      if (y >= pane.y && y < pane.y + pane.height) return pane;
    }
    return this.state.panes[0];
  }

  /** 面板分隔条命中（面板底边 ±4px，最后一个面板除外） */
  private separatorIndexAt(y: number): number | null {
    for (let i = 0; i < this.state.panes.length - 1; i++) {
      const edge = this.state.panes[i].y + this.state.panes[i].height;
      if (Math.abs(y - edge) <= 4) return i;
    }
    return null;
  }

  /** 确保面板价格轴尺寸与自适应范围最新（rAF 暂停时拖拽换算也正确）：
   *  layout + 可视区间换算是控制器关注点，价格域适配本身在 autoscale.ts */
  private ensurePaneScaleReady(pane: ScalablePane): void {
    this.state.layout(this.manager.height - AXIS_HEIGHT);
    const { from, to } = this.state.visibleRange();
    ensurePriceScaleReady(pane, this.state.displaySeries, from, to, this.state.logScale);
  }

  /** 图例 timeframeId → Timeframe（缺失/无效时倒计时停用） */
  private resolveTimeframe(): Timeframe | null {
    const id = this.legend.timeframeId;
    return id ? TIMEFRAMES.find((t) => t.id === id) ?? null : null;
  }

  /**
   * 收盘倒计时文本：价格轴右端、最新价徽章旁的实时 mm:ss。
   * 回放模式 / 砖块类图表（无收盘概念）不显示；视口是否贴右缘不影响显示——
   * 与 TV 一致：倒计时跟随当前周期而非可视位置；数据断开时末 bar 过期，自动隐藏。
   */
  private countdownText(now: number): string | null {
    if (this.state.replayIndex !== null || !this.state.timeBasedChart) return null;
    return this.countdown.sample(now);
  }
}
