import { CanvasManager } from '../canvas/CanvasManager';
import { Viewport } from '../viewport/Viewport';
import { PriceScale } from '../scale/PriceScale';
import { Crosshair } from '../crosshair/Crosshair';
import { BarSeries } from '@/data/BarSeries';
import { theme, TV_FONT } from '../theme';
import type { Bar, ChartTypeId, Timeframe } from '@/types/market';
import { CHART_TYPES, TIMEFRAMES } from '@/types/market';
import { heikinAshi, renko, kagi, lineBreak, pointAndFigure, rangeBars, atr, type BrickOptions } from '@/data/transforms';
import { isMarketOpen } from '@/data/marketHours';
import { IndicatorInstance, type IndicatorOptions } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import { DrawingLayer } from '../drawing/DrawingLayer';
import { getToolDef, isConstrainableTool, type Drawing, type DrawingPoint, type DrawingTypeId } from '../drawing/types';
import { drawDrawings, hitTestDrawing, pixelToPoint, pointToPixel, type DrawContext } from '../drawing/drawDrawings';
import { detectVisibleSwing } from '../drawing/fibMath';
import { drawTrading, hitTestTrading, type TradeVisual, type TradeHit } from './drawTrading';
import { serializeDrawings, deserializeDrawings } from '../drawing/types';
import { drawCandles, type DrawGeometry } from './drawSeries';
import { drawGrid, drawPriceAxis, drawTimeAxis, drawBorders, drawPaneLegend, drawPaneButtons, drawLastPrice, type GridMode, type PaneButtonRects } from './drawAxes';
import { CloseCountdown } from '../countdown';
import { formatCompact } from '@/data/format';
import { drawOhlc, drawLine, drawArea, drawBaseline, drawColumns, drawHighLow, drawStepLine, drawLineMarkers, drawHlcArea, drawVolumeCandles } from './seriesRenderers';
import { drawCrosshair, drawLegendBlock, type LegendInfo, type LegendOptions, type LegendStudyValues, type StudyLegendRect, type LegendDrawInfo, DEFAULT_LEGEND_OPTIONS } from './drawCrosshair';
import { drawIndicator, indicatorValuesAt } from './drawIndicator';
import type { ViewportTimeRange } from '@/store/syncBus';
import { SyncBridge } from './SyncBridge';
import { autoscaleIndicators, autoscalePrice, ensurePriceScaleReady, type AutoscaleOptions } from './autoscale';

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
  /** 跨图表联动边界（D 批次拆分①：联动状态/回调/时间空间换算/参考线绘制） */
  private sync: SyncBridge;
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
  private autoScaleOn = true;
  private drawingsHidden = false;
  private paneResizeIndex: number | null = null;
  private paneResizeStartY = 0;
  private paneResizeStartHeight = 0;
  private percentOn = false;
  private drawingsLocked = false;
  private gridMode: GridMode = 'both';
  private bordersVisible = true;
  /** 预留：水印渲染未实现，开关态先落 renderer */
  private watermarkVisible = false;
  private hideStudies = false;
  private legendOptions: LegendOptions = { ...DEFAULT_LEGEND_OPTIONS };
  /** 研究图例行命中区与悬停态（图例右侧 眼睛/设置/移除 按钮） */
  private studyRects: StudyLegendRect[] = [];
  private hoverStudyUid: string | null = null;
  private studyHoverBtn: number | null = null;
  private movedFar = false;
  private studyActionCb: ((action: 'hide' | 'settings' | 'remove', uid: string) => void) | null = null;
  /** 画线悬停光标：body=move、handle=pointer */
  private drawingHoverCursor = '';
  private toolFinishedCb: (() => void) | null = null;
  private drawingSettingsCb: ((id: string) => void) | null = null;
  /** 双击最新价线 → 打开图表设置（TV 行为） */
  private priceLineDblClickCb: (() => void) | null = null;
  private legendMenuCb: ((x: number, y: number) => void) | null = null;
  private drawingMenuCb: ((id: string, x: number, y: number) => void) | null = null;
  private brickOpts: BrickOptions = {};
  /** K 线收盘倒计时（TV 价格轴右端徽章旁 mm:ss）：状态/节流在 countdown.ts，此处仅接线 */
  private countdown = new CloseCountdown();
  /** 当前图表类型是否时间-based（砖块类无收盘概念，不显示倒计时） */
  private timeBasedChart = true;

  // 画线状态
  private drawingLayer = new DrawingLayer();
  private activeTool: DrawingTypeId | null = null;
  private placing: DrawingPoint[] = [];
  private previewPoint: DrawingPoint | null = null;
  /** 拖拽画线：ids 为本次受动的对象集合（单选=1 个；多选整体拖拽=全部选中；手柄拖拽=1 个） */
  private dragDrawing: { ids: string[]; part: 'body' | 'handle'; index: number; start: DrawingPoint; origins: Map<string, DrawingPoint[]> } | null = null;
  /** B7 Ctrl+按下待克隆：首次移动超过阈值才懒克隆（无移动的 Ctrl+点击 = 多选切换） */
  private pendingClone: { id: string; part: 'body' | 'handle'; index: number; start: DrawingPoint } | null = null;
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
  private contextMenuCb: ((price: number, time: number, clientX: number, clientY: number) => void) | null = null;
  /** 当前选中面板 id（TV：点击面板即选中；面板被移除后回落主面板） */
  private selectedPaneId = 'main';
  /** 面板头部按钮动作回调（设置/移除指标） */
  private paneActionCb: ((action: 'settings' | 'remove', indicatorId: string) => void) | null = null;

  // 联动 / 复盘
  private replayIndex: number | null = null;
  private barSelectMode = false;
  /** 选择K线预览线 x（跟随光标，选中后清除） */
  private selectPreviewX: number | null = null;
  private barSelectCb: ((index: number) => void) | null = null;

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
    // 联动边界：viewport 直接注入；displaySeries/画布宽/重绘请求用 getter（随图表类型与尺寸变化）
    this.sync = new SyncBridge(this.viewport, () => this.displaySeries, () => this.manager.width - AXIS_WIDTH, () => this.invalidate());
    this.legend = { symbol: 'BTC/USDT', interval: '1m', decimals: 2, ...legend };
    this.countdown.setTimeframe(this.resolveTimeframe());
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
    this.countdown.setTimeframe(this.resolveTimeframe()); // 周期切换 → 重算倒计时
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

  get chartTypeNow(): ChartTypeId {
    return this.chartType;
  }

  setLogScale(on: boolean): void {
    this.logScale = on;
    for (const pane of this.panes) pane.priceScale.setLogMode(on);
    this.invalidate();
  }

  /** 关闭后不再每帧自动适配价格域（TV 底部 auto 开关），手动拖拽/缩放的范围得以保留 */
  setAutoScale(on: boolean): void {
    this.autoScaleOn = on;
    this.invalidate();
  }

  get isAutoScale(): boolean {
    return this.autoScaleOn;
  }

  /** 隐藏全部画线（TV 左工具栏眼睛开关） */
  setDrawingsHidden(hidden: boolean): void {
    this.drawingsHidden = hidden;
    this.invalidate();
  }

  /** 百分比坐标（TV 底栏 % 开关）：几何不变，轴与标签改显涨跌幅 */
  setPercentMode(on: boolean): void {
    this.percentOn = on;
    this.invalidate();
  }

  /** 锁定全部画线：不可选中/拖动（TV 左工具栏锁开关） */
  setDrawingsLocked(locked: boolean): void {
    this.drawingsLocked = locked;
    this.invalidate();
  }

  /** 图例可见性（TV 图表设置「状态栏」页） */
  setLegendOptions(options: Partial<LegendOptions>): void {
    this.legendOptions = { ...this.legendOptions, ...options };
    this.invalidate();
  }

  setStudyActionCallback(cb: ((action: 'hide' | 'settings' | 'remove', uid: string) => void) | null): void {
    this.studyActionCb = cb;
  }

  setToolFinishedCallback(cb: (() => void) | null): void {
    this.toolFinishedCb = cb;
  }

  setDrawingSettingsCallback(cb: ((id: string) => void) | null): void {
    this.drawingSettingsCb = cb;
  }

  /** 双击最新价线打开图表设置（TV：double-click on the price line → settings） */
  setPriceLineDblClickCallback(cb: (() => void) | null): void {
    this.priceLineDblClickCb = cb;
  }

  setLegendMenuCallback(cb: ((x: number, y: number) => void) | null): void {
    this.legendMenuCb = cb;
  }

  setDrawingMenuCallback(cb: ((id: string, x: number, y: number) => void) | null): void {
    this.drawingMenuCb = cb;
  }

  /** 隐藏全部指标（TV 底栏 hide-indicators 开关） */
  setHideStudies(hidden: boolean): void {
    this.hideStudies = hidden;
    this.invalidate();
  }

  get studiesHidden(): boolean {
    return this.hideStudies;
  }

  /** 网格四态（TV 画布页）：none / horizontal / vertical / both */
  setGridMode(mode: GridMode): void {
    this.gridMode = mode;
    this.invalidate();
  }

  /** 画布边框显隐（TV 画布页） */
  setBordersVisible(visible: boolean): void {
    this.bordersVisible = visible;
    this.invalidate();
  }

  /** 水印显隐（TV 画布页）。预留：引擎水印渲染未实现，状态先落 renderer，
   *  渲染侧支持后 drawWatermark 直接读 this.watermarkVisible。 */
  setWatermarkVisible(visible: boolean): void {
    this.watermarkVisible = visible;
    this.invalidate();
  }

  get watermarkOn(): boolean {
    return this.watermarkVisible;
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
  addIndicator(id: string, options?: IndicatorOptions): string | null {
    const def = getIndicatorDef(id);
    if (!def) return null;
    const instance = new IndicatorInstance(def, options);
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

  updateIndicator(uid: string, options: IndicatorOptions): void {
    for (const pane of this.panes) {
      const inst = pane.indicators.find((i) => i.uid === uid);
      if (inst) {
        inst.applyOptions(options);
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
    for (const item of list) this.addIndicator(item.id, { params: item.params });
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
    this.timeBasedChart = CHART_TYPES.find((t) => t.id === this.chartType)?.timeBased ?? true;
    this.viewport.setBarCount(this.displaySeries.length);
    if (resetView && this.displaySeries.length > 0) this.viewport.scrollToRealtime();
    this.crosshair.clear();
    this.countdown.setLastBar(this.lastBarTime); // 新 bar / 数据替换 → 重算收盘时刻
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

  setContextMenuCallback(cb: ((price: number, time: number, clientX: number, clientY: number) => void) | null): void {
    this.contextMenuCb = cb;
  }

  /** 重置视图：恢复自动价格适配并让最新 K 线贴右 */
  resetView(): void {
    this.resetPriceScale();
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
    const series = this.displaySeries;
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

  get atRightEdge(): boolean {
    return this.viewport.isAtRightEdge();
  }

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
    this.sync.setSyncCrosshair(time);
  }

  /** 联动：外部视口变化（平移/缩放广播，索引空间） */
  setSyncViewport(v: { first: number; spacing: number }): void {
    this.sync.setSyncViewport(v);
  }

  /**
   * 联动发布：当前视口的时间空间范围 {fromTime, toTime}（供 syncBus 广播）。
   * 跨周期/跨品种图表按 TV 语义对齐时间轴——接收方用自己的 series 换算，
   * 因此这里广播时间而非索引（索引空间跨周期会错位）。
   */
  getViewportTimeRange(): ViewportTimeRange {
    return this.sync.getViewportTimeRange();
  }

  /**
   * 联动接收：按时间范围对齐视口——用自己的 BarSeries.fractionalIndexAt 把
   * {fromTime, toTime} 换算回索引/间距（TV 时间轴同步语义）。
   * 无效载荷（非有限值/空区间/空序列）安全忽略，不扰动当前视口。
   */
  setViewportTimeRange(range: ViewportTimeRange): void {
    this.sync.setViewportTimeRange(range);
  }

  getViewport(): { first: number; spacing: number } {
    return this.sync.getViewport();
  }

  /** 视口提交（拖拽/缩放结束）回调，用于多图表联动 */
  onViewportCommit(cb: ((v: { first: number; spacing: number }) => void) | null): void {
    this.sync.onViewportCommit(cb);
  }

  /** 十字光标所在 bar 时间回调，用于多图表联动 */
  onCrosshairTime(cb: ((t: number | null) => void) | null): void {
    this.sync.onCrosshairTime(cb);
  }

  /** 最新 bar 时间戳（缺口检测用） */
  get lastBarTime(): number {
    return this.baseSeries.last?.time ?? 0;
  }

  /** 当前全部 bar（缺口回补合并用） */
  getBars(): Bar[] {
    return [...this.baseSeries.raw()];
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
    if (this.replayIndex !== null || !this.timeBasedChart) return null;
    return this.countdown.sample(now);
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

  /** 磁吸档位：weak（50px 内吸附）/ strong（始终吸附） */
  setMagnetMode(mode: 'weak' | 'strong'): void {
    this.drawingLayer.setMagnetMode(mode);
  }

  get magnetMode(): 'weak' | 'strong' {
    return this.drawingLayer.mode;
  }

  /** 清空全部画线 */
  clearDrawings(): void {
    this.drawingLayer.clear();
    this.notifyDrawings();
    this.invalidate();
  }

  /** 克隆画线（偏移少量像素，避免与原图完全重合） */
  duplicateDrawing(id: string): void {
    const src = this.drawingLayer.list().find((d) => d.id === id);
    if (!src) return;
    const iv = this.displaySeries.length > 1 ? this.displaySeries.raw()[1].time - this.displaySeries.raw()[0].time : 60_000;
    const span = this.panes[0].priceScale.range;
    const dPrice = (span.max - span.min) * 0.02;
    const clone = this.drawingLayer.add(src.type, src.points.map((p) => ({ time: p.time + iv * 3, price: p.price + dPrice })), src.style);
    this.drawingLayer.select(clone.id);
    this.notifyDrawings();
    this.invalidate();
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

  /** 选中画线（对象树点击行） */
  selectDrawing(id: string | null): void {
    this.drawingLayer.select(id);
    this.invalidate();
  }

  /** Ctrl+点击切换多选集合成员（对象树/画布同语义） */
  toggleDrawingSelection(id: string): void {
    this.drawingLayer.toggleSelect(id);
    this.notifyDrawings();
    this.invalidate();
  }

  /** 多选集合（B7：Ctrl+点击累积；对象树高亮/ Delete 删除用） */
  get selectedDrawingIds(): string[] {
    return this.drawingLayer.selectedIdList;
  }

  /** 是否存在选中画线（方向键微调 vs 视口平移的路由判据） */
  hasSelectedDrawing(): boolean {
    return this.drawingLayer.selectedIdList.length > 0;
  }

  /** 方向键微调（B7）：以像素步长平移全部选中对象，Shift = 大步长。
   *  每次调用为单步历史（入撤销栈）；无选中返回 false 不改动。 */
  nudgeSelectedDrawing(dxPx: number, dyPx: number): boolean {
    if (this.drawingLayer.selectedIdList.length === 0) return false;
    const dctx = this.drawingCtx();
    const p0 = pixelToPoint(0, 0, dctx, 'off');
    const p1 = pixelToPoint(dxPx, dyPx, dctx, 'off');
    const dt = p1.time - p0.time;
    const dp = p1.price - p0.price;
    if (dt === 0 && dp === 0) return false;
    this.drawingLayer.beginHistory();
    const moved = this.drawingLayer.translateSelected(dt, dp);
    if (!moved) return false;
    this.notifyDrawings();
    this.invalidate();
    return true;
  }

  /** 视觉顺序：置于顶层/上移一层/下移一层/置于底层 */
  setDrawingOrder(id: string, action: 'front' | 'forward' | 'backward' | 'back'): void {
    this.drawingLayer.setOrder(id, action);
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
    if (this.drawingsLocked) return null;
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
    this.pendingClone = null;
    // Esc 同时退出多选态（TV：Esc 取消当前操作并取消选择）
    this.drawingLayer.select(null);
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

  /** 面板分隔条命中（面板底边 ±4px，最后一个面板除外） */
  private separatorIndexAt(y: number): number | null {
    for (let i = 0; i < this.panes.length - 1; i++) {
      const edge = this.panes[i].y + this.panes[i].height;
      if (Math.abs(y - edge) <= 4) return i;
    }
    return null;
  }

  /** 拖分隔条改面板高度：从下一面板借比例，二者都设下限 */
  private resizePane(index: number, y: number): void {
    const pane = this.panes[index];
    const next = this.panes[index + 1];
    if (!pane || !next) return;
    const chartH = this.manager.height - AXIS_HEIGHT;
    const total = this.panes.reduce((s, p) => s + p.heightRatio, 0);
    const delta = y - this.paneResizeStartY;
    const minH = 48;
    const newHeight = Math.min(Math.max(this.paneResizeStartHeight + delta, minH), chartH - minH * this.panes.length);
    const newRatio = (newHeight * total) / chartH;
    const taken = newRatio - pane.heightRatio;
    if (next.heightRatio - taken < 0.08 || pane.heightRatio + taken < 0.08) return;
    pane.heightRatio += taken;
    next.heightRatio -= taken;
    this.layout();
    this.invalidate();
  }

  private onPointerDown = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    const inPriceAxis = x > this.manager.width - AXIS_WIDTH;
    const inTimeAxis = y > this.manager.height - AXIS_HEIGHT;
    this.movedFar = false;
    this.manager.canvas.setPointerCapture(e.pointerId);
    const sep = !inPriceAxis && !inTimeAxis && e.button === 0 ? this.separatorIndexAt(y) : null;
    if (sep !== null) {
      this.paneResizeIndex = sep;
      this.paneResizeStartY = y;
      this.paneResizeStartHeight = this.panes[sep].height;
      return;
    }
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
        this.handleToolPointerDown(x, y, pane, e.shiftKey);
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
        // B7：Ctrl+按下 = 待克隆（移动超阈值才克隆）；无移动的 Ctrl+点击 = 多选切换
        if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
          this.pendingClone = {
            id: hit.id,
            part: hit.part,
            index: hit.index,
            start: pixelToPoint(x, y - pane.y, this.drawingCtx(), 'off'),
          };
          this.invalidate();
          return;
        }
        // 多选态下点击已选中对象 = 整组拖拽；否则单选该对象
        const groupDrag =
          hit.part === 'body' && this.drawingLayer.isSelected(hit.id) && this.drawingLayer.selectedIdList.length > 1;
        if (!groupDrag) this.drawingLayer.select(hit.id);
        const ids = groupDrag ? this.drawingLayer.selectedIdList : [hit.id];
        const origins = new Map<string, DrawingPoint[]>();
        for (const id of ids) {
          const dd = this.drawingLayer.list().find((z) => z.id === id);
          if (dd && !dd.locked) origins.set(id, dd.points.map((p) => ({ ...p })));
        }
        this.drawingLayer.beginHistory();
        this.dragDrawing = {
          ids: [...origins.keys()],
          part: hit.part,
          index: hit.index,
          start: pixelToPoint(x, y - pane.y, this.drawingCtx(), 'off'),
          origins,
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
  private handleToolPointerDown(x: number, y: number, pane: PaneState, shift: boolean): void {
    let pt = pixelToPoint(x, y - pane.y, this.drawingCtx(), this.drawingLayer.magnetModeForDraw);
    // Auto Fib：无锚点点击——一次点击即按可见区间 swing 生成标准回撤对象
    if (this.activeTool === 'fib-auto') {
      const swing = this.detectSwingForAutoFib();
      if (swing) {
        this.drawingLayer.add('fib-auto', [swing.start, swing.end]);
        this.toolFinishedCb?.();
      }
      this.invalidate();
      return;
    }
    // B7：Shift 约束——新落点相对上一个锚点按主导轴锁轴（TV 肌肉记忆）
    if (shift && this.placing.length > 0 && isConstrainableTool(this.activeTool!)) {
      pt = this.constrainPoint(this.placing[this.placing.length - 1], x, y - pane.y);
    }
    const def = getToolDef(this.activeTool!);
    if (def.points === 1) {
      this.drawingLayer.add(this.activeTool!, [pt]);
      this.invalidate();
      this.toolFinishedCb?.();
      return;
    }
    this.placing.push(pt);
    if (def.points > 0 && this.placing.length >= def.points) {
      this.drawingLayer.add(this.activeTool!, this.placing);
      this.placing = [];
      this.previewPoint = null;
      this.toolFinishedCb?.();
    }
    this.invalidate();
  }

  /** Shift 约束：像素域按主导轴锁轴——|Δx| ≥ |Δy| 锁水平（价格固定），否则锁垂直（时间固定） */
  private constrainPoint(anchor: DrawingPoint, px: number, py: number): DrawingPoint {
    const dctx = this.drawingCtx();
    const a = pointToPixel(anchor, dctx);
    const magnet = this.drawingLayer.magnetModeForDraw;
    if (Math.abs(px - a.x) >= Math.abs(py - a.y)) return pixelToPoint(px, a.y, dctx, magnet);
    return pixelToPoint(a.x, py, dctx, magnet);
  }

  /** Auto Fib 摆动检测：可见 bar 区间的最高/最低点对（不足则 null，本次点击不放置） */
  private detectSwingForAutoFib(): { start: DrawingPoint; end: DrawingPoint } | null {
    const chartW = this.manager.width - AXIS_WIDTH;
    const from = Math.max(0, Math.floor(this.viewport.first));
    const to = Math.min(this.displaySeries.length - 1, Math.ceil(this.viewport.xToIndex(chartW)));
    return detectVisibleSwing(this.displaySeries.raw(), from, to);
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    if (this.paneResizeIndex !== null) {
      this.resizePane(this.paneResizeIndex, y);
      return;
    }
    if (this.dragging) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.movedFar = true;
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
    } else if (this.pendingClone) {
      // B7：Ctrl+拖动——首次移动超过 2px 阈值即懒克隆并进入克隆体拖拽（原对象不动）
      const pane = this.paneAt(y);
      const dctx = this.drawingCtx();
      const sp = pointToPixel(this.pendingClone.start, dctx);
      if (Math.hypot(x - sp.x, y - pane.y - sp.y) > 2) {
        const pc = this.pendingClone;
        this.pendingClone = null;
        const src = this.drawingLayer.list().find((d) => d.id === pc.id);
        if (src && !src.locked) {
          // 先快照再克隆：克隆 + 拖拽 = 单步撤销
          this.drawingLayer.beginHistory();
          const clone = this.drawingLayer.cloneDrawing(src.id)!;
          this.dragDrawing = {
            ids: [clone.id],
            part: pc.part,
            index: pc.index,
            start: pc.start,
            origins: new Map([[clone.id, clone.points.map((p) => ({ ...p }))]]),
          };
          this.updateDrawingDrag(x, y, e.shiftKey);
        } else {
          this.invalidate();
        }
      }
    } else if (this.dragDrawing) {
      this.updateDrawingDrag(x, y, e.shiftKey);
    } else if (this.tradeDrag) {
      this.updateTradeDrag(y);
    } else if (this.activeTool && this.placing.length > 0) {
      const pane = this.paneAt(y);
      let pt = pixelToPoint(x, y - pane.y, this.drawingCtx(), this.drawingLayer.magnetModeForDraw);
      // B7：Shift 约束预览——与落点约束同规则（相对上一个锚点按主导轴锁轴）
      if (e.shiftKey && isConstrainableTool(this.activeTool)) {
        pt = this.constrainPoint(this.placing[this.placing.length - 1], x, y - pane.y);
      }
      this.previewPoint = pt;
      this.invalidate();
    } else {
      this.updateHoverCursor(x, y);
      this.updateCrosshair(x, y);
    }
  };

  /** TV 光标语义：面板分隔条与价格轴 ns-resize，时间轴 ew-resize，可交互元素 pointer */
  private updateHoverCursor(x: number, y: number): void {
    let cursor = '';
    if (this.separatorIndexAt(y) !== null) cursor = 'ns-resize';
    else if (x > this.manager.width - AXIS_WIDTH) cursor = 'ns-resize';
    else if (y > this.manager.height - AXIS_HEIGHT) cursor = 'ew-resize';
    else if (this.studyHoverBtn !== null) cursor = 'pointer';
    else if (this.drawingHoverCursor) cursor = this.drawingHoverCursor;
    else if (this.tradeHoverCursor) cursor = 'pointer';
    const canvas = this.manager.canvas;
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }

  /** 拖拽画线：整体平移（单选/多选整组）或单手柄移动；Shift = 水平/垂直约束（按主导轴） */
  private updateDrawingDrag(x: number, y: number, shift: boolean): void {
    const drag = this.dragDrawing;
    if (!drag) return;
    const pane = this.panes[0];
    const dctx = this.drawingCtx();
    const cur = pixelToPoint(x, y - pane.y, dctx, 'off');
    // Shift 约束仅对线类工具生效（趋势线/射线/箭头/信息线/斐波那契家族）
    const constrain =
      shift &&
      drag.ids.some((id) => isConstrainableTool(this.drawingLayer.list().find((d) => d.id === id)?.type ?? 'rect'));
    if (drag.part === 'body') {
      let dt = cur.time - drag.start.time;
      let dp = cur.price - drag.start.price;
      if (constrain) {
        const sp = pointToPixel(drag.start, dctx);
        if (Math.abs(x - sp.x) >= Math.abs(y - pane.y - sp.y)) dp = 0;
        else dt = 0;
      }
      for (const [id, origin] of drag.origins) {
        this.drawingLayer.updatePoints(
          id,
          origin.map((p) => ({ time: p.time + dt, price: p.price + dp })),
        );
      }
    } else {
      let target = cur;
      if (constrain) {
        const h = drag.origins.get(drag.ids[0])?.[drag.index];
        if (h) {
          const hp = pointToPixel(h, dctx);
          target =
            Math.abs(x - hp.x) >= Math.abs(y - pane.y - hp.y)
              ? pixelToPoint(x, hp.y, dctx, 'off')
              : pixelToPoint(hp.x, y - pane.y, dctx, 'off');
        }
      }
      const pts = (drag.origins.get(drag.ids[0]) ?? []).map((p) => ({ ...p }));
      if (pts[drag.index]) pts[drag.index] = target;
      this.drawingLayer.updatePoints(drag.ids[0], pts);
    }
    this.invalidate();
  }

  private updateCrosshair(x: number, y: number): void {
    const chartW = this.manager.width - AXIS_WIDTH;
    const chartH = this.manager.height - AXIS_HEIGHT;
    if (x < 0 || x > chartW || y < 0 || y > chartH) {
      this.crosshair.clear();
      this.selectPreviewX = null;
      this.sync.publishCrosshairTime(null);
      this.setTradeHoverCursor(false);
      this.updateHoverCursor(x, y);
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
    // 研究图例行悬停：记录命中行与按钮区（眼睛/设置/移除）
    this.studyHoverBtn = null;
    this.hoverStudyUid = null;
    for (const r of this.studyRects) {
      if (x >= r.x && x <= r.btnX + 48 && y >= r.y && y <= r.y + r.h) {
        this.hoverStudyUid = r.uid;
        if (x >= r.btnX) this.studyHoverBtn = Math.min(2, Math.floor((x - r.btnX) / 16));
        break;
      }
    }
    const pane = this.paneAt(y);
    this.hoveredPaneId = pane.id;
    // 画线悬停光标：顶点手柄 pointer、线体 move
    const dHit = this.hitDrawings(x, y, pane);
    this.drawingHoverCursor = dHit ? (dHit.part === 'handle' ? 'pointer' : 'move') : '';
    const hit = hitTestTrading(this.tradeVisual, x, y - pane.y, pane.priceScale, { chartW, chartH: pane.height });
    this.setTradeHoverCursor(hit !== null);
    const idx = Math.round(this.viewport.xToIndex(x));
    const bar = this.displaySeries.barAt(idx);
    if (bar) {
      const price = pane.priceScale.yToPrice(y - pane.y);
      this.crosshair.set(x, y, idx, bar.time, price);
      this.sync.publishCrosshairTime(bar.time);
    } else {
      this.crosshair.clear();
      this.sync.publishCrosshairTime(null);
    }
    this.invalidate();
  }

  /** 悬停交易可视化元素时记录 pointer 意图（光标由 updateHoverCursor 统一写） */
  private setTradeHoverCursor(on: boolean): void {
    this.tradeHoverCursor = on;
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
    // TV：中键点击研究图例行 = 移除该研究
    if (e.button === 1 && this.hoverStudyUid) {
      const uid = this.hoverStudyUid;
      this.hoverStudyUid = null;
      this.studyActionCb?.('remove', uid);
      return;
    }
    const studyBtn = this.studyHoverBtn;
    const studyUid = this.hoverStudyUid;
    this.studyHoverBtn = null;
    if (studyBtn !== null && studyUid && !this.movedFar) {
      this.studyActionCb?.(studyBtn === 0 ? 'hide' : studyBtn === 1 ? 'settings' : 'remove', studyUid);
    }
    this.movedFar = false;
    // B7：无移动的 Ctrl+点击 = 多选切换（TV）；移动过的已在 onPointerMove 懒克隆并清空
    if (this.pendingClone) {
      this.drawingLayer.toggleSelect(this.pendingClone.id);
      this.notifyDrawings();
    }
    this.pendingClone = null;
    this.dragging = false;
    this.priceDragging = false;
    this.paneResizeIndex = null;
    this.dragDrawing = null;
    this.tradeDrag = null;
    this.sync.publishViewport();
    if (this.manager.canvas.hasPointerCapture(e.pointerId)) {
      this.manager.canvas.releasePointerCapture(e.pointerId);
    }
  };

  /** 右键：禁默认菜单；回放中在空白处右键 → 弹出下单浮窗（左键保留拖动），
   *  非回放时 → 交给上层弹图表上下文菜单 */
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const { x, y } = this.toLocal(e);
    const chartW = this.manager.width - AXIS_WIDTH;
    const chartH = this.manager.height - AXIS_HEIGHT;
    if (x < 0 || x > chartW || y < 0 || y > chartH) return;
    const pane = this.paneAt(y);

    if (this.replayIndex !== null && this.chartClickCb) {
      // 命中交易可视化/画线时不弹下单
      if (hitTestTrading(this.tradeVisual, x, y - pane.y, pane.priceScale, { chartW, chartH: pane.height })) return;
      if (this.hitDrawings(x, y, pane)) return;
      this.ensurePaneScaleReady(pane);
      const price = pane.priceScale.yToPrice(y - pane.y);
      const bar = this.displaySeries.barAt(this.replayIndex);
      this.chartClickCb(price, bar?.time ?? Date.now(), e.clientX, e.clientY);
      return;
    }

    if (!this.contextMenuCb) return;
    // 右键命中画线 → 画线上下文菜单（设置/移除/视觉顺序）
    const dHit = this.hitDrawings(x, y, pane);
    if (dHit) {
      this.drawingMenuCb?.(dHit.id, e.clientX, e.clientY);
      return;
    }
    // 图例区（商品行或研究行）右键 → 图例菜单（TV legend_context_menu）
    const inStudyRow = this.studyRects.some((r) => x >= r.x && x <= r.btnX + 48 && y >= r.y && y <= r.y + r.h);
    if (y <= 24 || inStudyRow) {
      this.legendMenuCb?.(e.clientX, e.clientY);
      return;
    }
    this.ensurePaneScaleReady(pane);
    const price = pane.priceScale.yToPrice(y - pane.y);
    const idx = Math.round(this.viewport.xToIndex(x));
    const bar = this.displaySeries.barAt(idx);
    this.contextMenuCb(price, bar?.time ?? Date.now(), e.clientX, e.clientY);
  };

  private onDoubleClick = (e: MouseEvent) => {
    const { x, y } = this.toLocal(e);
    // 双击价格轴 → 恢复该面板自动适配
    if (x > this.manager.width - AXIS_WIDTH) {
      this.paneAt(y).manual = false;
      this.invalidate();
      return;
    }
    // 双击最新价线（±4px 命中区）→ 打开图表设置（TV 行为）
    const main = this.panes[0];
    const lastBar = this.displaySeries.last;
    if (lastBar && y >= main.y && y < main.y + main.height) {
      const lineY = main.priceScale.priceToY(lastBar.close);
      if (Math.abs(y - main.y - lineY) <= 4) {
        this.priceLineDblClickCb?.();
        return;
      }
    }
    // 双击画线 → 打开画线设置（TV 行为）
    const pane = this.paneAt(y);
    const dHit = this.hitDrawings(x, y, pane);
    if (dHit) {
      this.drawingSettingsCb?.(dHit.id);
      return;
    }
    this.finishPlacing();
  };

  private onPointerLeave = () => {
    this.crosshair.clear();
    this.hoverStudyUid = null;
    this.studyHoverBtn = null;
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
    this.sync.publishViewport();
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

  /** 确保面板价格轴尺寸与自适应范围最新（rAF 暂停时拖拽换算也正确）：
   *  layout + 可视区间换算是渲染器关注点，价格域适配本身在 autoscale.ts */
  private ensurePaneScaleReady(pane: PaneState): void {
    this.layout();
    const { from, to } = this.visibleRange();
    ensurePriceScaleReady(pane, this.displaySeries, from, to, this.logScale);
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
    const now = Date.now(); // 倒计时用墙钟（纪元毫秒），与 bar time 同时钟
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
    const autoscaleOpts: AutoscaleOptions = { autoScaleOn: this.autoScaleOn, logScale: this.logScale, timeframeId: this.legend.timeframeId };
    for (const pane of this.panes) {
      const geo: DrawGeometry = { chartW: w - AXIS_WIDTH, chartH: pane.height };
      ctx.save();
      ctx.translate(0, pane.y);

      if (pane.kind === 'indicator') {
        autoscaleIndicators(pane, this.displaySeries, from, to, autoscaleOpts);
        drawGrid(ctx, this.viewport, pane.priceScale, geo, this.gridMode);
        for (const inst of pane.indicators) {
          if (this.hideStudies || !inst.isVisibleOn(this.legend.timeframeId)) continue;
          drawIndicator(ctx, inst, this.barsArray(), from, to, this.viewport, pane.priceScale, geo);
        }
      } else {
        autoscalePrice(pane, this.displaySeries, from, to, autoscaleOpts);
        drawGrid(ctx, this.viewport, pane.priceScale, geo, this.gridMode);
        this.drawPriceSeries(ctx, pane, geo, from, to);
        // 主图叠加指标
        for (const inst of pane.indicators) {
          if (this.hideStudies || !inst.isVisibleOn(this.legend.timeframeId)) continue;
          drawIndicator(ctx, inst, this.barsArray(), from, to, this.viewport, pane.priceScale, geo);
        }
      }

      // 每面板数值轴：主面板全精度，副面板紧凑格式（K/M）
      if (pane.kind === 'price') {
        pane.priceScale.setPercentBase(this.percentOn ? (this.displaySeries.barAt(from)?.close ?? null) : null);
      }
      drawPriceAxis(ctx, pane.priceScale, this.legend.decimals, geo, pane.kind !== 'price');

      // 主图最新价：点线 + 右轴方向着色徽章（徽章旁附带收盘倒计时）
      if (pane.kind === 'price') {
        const bs = this.barsArray();
        if (bs.length > 0) {
          const lastBar = bs[bs.length - 1];
          const prevClose = bs.length > 1 ? bs[bs.length - 2].close : lastBar.open;
          drawLastPrice(ctx, pane.priceScale, lastBar, prevClose, this.legend.decimals, geo, this.countdownText(now));
        }
      }

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
        ctx.font = `10px ${TV_FONT}`;
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
    if (this.bordersVisible) drawBorders(ctx, mainGeo);

    // 画线层（主面板局部坐标）
    const main = this.panes[0];
    ctx.save();
    ctx.translate(0, main.y);
    if (!this.drawingsHidden) {
      const sel = this.drawingLayer.selectedIdList;
      const primary = sel.length > 0 ? sel[sel.length - 1] : null;
      drawDrawings(ctx, this.drawingLayer.list(), primary, this.drawingCtx(), this.legend.decimals, sel.slice(0, -1));
    }
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
    const legendIndicators: LegendStudyValues[] = [];
    const mainPane = this.panes[0];
    const legendIndex = this.crosshair.visible && hoveredBar ? this.crosshair.barIndex : this.displaySeries.length - 1;
    if (!this.hideStudies && mainPane.indicators.length > 0 && legendIndex >= 0) {
      const bars = this.barsArray();
      for (const inst of mainPane.indicators) {
        if (!inst.isVisibleOn(this.legend.timeframeId)) continue;
        legendIndicators.push({
          uid: inst.uid,
          name: inst.name,
          precision: inst.precision,
          values: indicatorValuesAt(inst, bars, Math.max(0, legendIndex - 50), legendIndex),
        });
      }
    }
    drawCrosshair(
      ctx,
      this.crosshair,
      this.viewport,
      hoveredPane.priceScale,
      mainGeo,
      this.legend,
      hoveredPane.y,
      hoveredPane.height,
    );
    // 图例常驻：悬停跟随十字光标，否则显示最后一根；同时收集研究行命中区
    this.studyRects = [];
    const legendInfo: LegendDrawInfo = { collapsed: 0 };
    drawLegendBlock(
      ctx,
      hoveredBar ?? this.displaySeries.last,
      { ...this.legend, marketOpen: this.legend.market ? isMarketOpen(this.legend.market) : undefined },
      legendIndicators,
      this.legendOptions,
      this.hoverStudyUid,
      this.studyRects,
      legendInfo,
      mainGeo,
      this.chartType,
    );
    if (legendInfo.collapsed > 0) {
      ctx.save();
      ctx.font = `11px ${TV_FONT}`;
      ctx.fillStyle = theme.legendDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`+${legendInfo.collapsed}`, this.studyRects.length ? this.studyRects[this.studyRects.length - 1].btnX + 56 : 120, 28);
      ctx.restore();
    }

    // 联动：其他图表十字光标时间的垂直参考线（小数 index 插值定位——
    // 跨周期图表的时间戳不落在 bar 上时也能对齐，不再因精确匹配失败而错位/消失）
    this.sync.drawReferenceLine(ctx, mainGeo.chartW, mainGeo.chartH, this.crosshair.visible);

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
      case 'step-line':
        drawStepLine(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'line-markers':
        drawLineMarkers(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'area':
        drawArea(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'hlc-area':
        drawHlcArea(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'columns':
        drawColumns(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'high-low':
        drawHighLow(ctx, this.displaySeries, from, to, vs, ps, geo);
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
      case 'volume-candles':
        drawVolumeCandles(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      default:
        // candles / hollow / heikin-ashi / renko / kagi / line-break / pnf / range
        drawCandles(ctx, this.displaySeries, from, to, vs, ps, geo);
    }
  }
}

/** 绘制剪刀图标（选择K线预览线顶端标记，蓝底白字）。
 *  与 lucide-react `Scissors` 同源：按 24×24 viewBox 的 path 数据等比缩放到 16px 绘制，
 *  保持全项目统一描边（1.5）与圆角线帽，不用字符字形（字体依赖重、光学重量不可控）。 */
function drawScissors(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#2962ff';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = 16 / 24;
  const p = (px: number, py: number): [number, number] => [x + (px - 12) * s, y + (py - 12) * s];
  // 两个指环
  for (const [cx, cy] of [
    [6, 6],
    [6, 18],
  ] as const) {
    ctx.beginPath();
    ctx.arc(...p(cx, cy), 3 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 三条剪线（M8.12 8.12 L12 12 / M20 4 L8.12 15.88 / M14.8 14.8 L20 20）
  for (const [x1, y1, x2, y2] of [
    [8.12, 8.12, 12, 12],
    [20, 4, 8.12, 15.88],
    [14.8, 14.8, 20, 20],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(...p(x1, y1));
    ctx.lineTo(...p(x2, y2));
    ctx.stroke();
  }
  ctx.restore();
}
