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
import { getToolDef, type Drawing, type DrawingTypeId } from '../drawing/types';
import { drawDrawings, pixelToPoint, type DrawContext } from '../drawing/drawDrawings';
import { drawTrading, type TradeVisual } from './drawTrading';
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
import { autoscaleIndicators, autoscalePrice, ensurePriceScaleReady, type AutoscaleOptions, type ScalablePane } from './autoscale';
import { InputController, type InputHost } from './InputController';
import { PanZoomGesture } from './PanZoomGesture';
import { DrawingGesture } from './DrawingGesture';
import { TradeGesture, type TradeCallbacks } from './TradeGesture';
import { HoverController } from './HoverController';

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
  private percentOn = false;
  private drawingsLocked = false;
  private gridMode: GridMode = 'both';
  private bordersVisible = true;
  /** 预留：水印渲染未实现，开关态先落 renderer */
  private watermarkVisible = false;
  private hideStudies = false;
  private legendOptions: LegendOptions = { ...DEFAULT_LEGEND_OPTIONS };
  /** 研究图例行命中区（图例右侧 眼睛/设置/移除 按钮；drawLegendBlock 回写，悬停层读取） */
  private studyRects: StudyLegendRect[] = [];
  private studyActionCb: ((action: 'hide' | 'settings' | 'remove', uid: string) => void) | null = null;
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

  // 画线（D 批次拆分③：图层与放置/拖拽态迁入 DrawingGesture，订阅监听器留门面）
  private drawingsListeners = new Set<() => void>();

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

  // 输入层（D 批次拆分③：手势状态机 + 悬停控制 + 事件路由；host 为结构子集，避免反向依赖）
  private panzoom: PanZoomGesture;
  private drawing: DrawingGesture;
  private trade: TradeGesture;
  private hover: HoverController;
  private input: InputController;

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
    // 输入层装配（D 批次拆分③）：host 提供几何/序列/状态/回调的结构子集，
    // 三个手势与 InputController 各持窄接口，依赖只向下
    const inputHost: InputHost = {
      manager: this.manager,
      canvas: this.manager.canvas,
      viewport: this.viewport,
      crosshair: this.crosshair,
      panes: () => this.panes,
      paneAt: (y) => this.paneAt(y),
      separatorIndexAt: (y) => this.separatorIndexAt(y),
      displaySeries: () => this.displaySeries,
      invalidate: () => this.invalidate(),
      notifyDrawings: () => this.notifyDrawings(),
      layout: () => this.layout(),
      chartW: () => this.manager.width - AXIS_WIDTH,
      chartH: () => this.manager.height - AXIS_HEIGHT,
      drawingCtx: () => this.drawingCtx(),
      mainPaneY: () => this.panes[0].y,
      mainPane: () => this.panes[0],
      drawingsLocked: () => this.drawingsLocked,
      publishViewport: () => this.sync.publishViewport(),
      publishCrosshairTime: (t) => this.sync.publishCrosshairTime(t),
      selectPane: (id) => {
        this.selectedPaneId = id;
      },
      setHoveredPane: (id) => {
        this.hoveredPaneId = id;
      },
      setSelectPreviewX: (x) => {
        this.selectPreviewX = x;
      },
      studyRects: () => this.studyRects,
      barSelectMode: () => this.barSelectMode,
      replayIndex: () => this.replayIndex,
      barSelected: (rawIndex) => {
        const idx = Math.min(Math.max(rawIndex, 0), Math.max(0, this.displaySeries.length - 1));
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
    this.input.bind(canvas);
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
    this.drawing.setToolFinishedCallback(cb);
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
    this.input.unbind(this.manager.canvas);
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
    this.trade.setVisual(visual);
  }

  /** 注册交易交互回调（拖拽改价/撤单/TP-SL） */
  setTradeCallbacks(cbs: TradeCallbacks): void {
    this.trade.setCallbacks(cbs);
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
    this.drawing.setTool(tool);
  }

  setMagnet(on: boolean): void {
    this.drawing.layer.setMagnet(on);
  }

  /** 磁吸档位：weak（50px 内吸附）/ strong（始终吸附） */
  setMagnetMode(mode: 'weak' | 'strong'): void {
    this.drawing.layer.setMagnetMode(mode);
  }

  get magnetMode(): 'weak' | 'strong' {
    return this.drawing.layer.mode;
  }

  /** 清空全部画线 */
  clearDrawings(): void {
    this.drawing.layer.clear();
    this.notifyDrawings();
    this.invalidate();
  }

  /** 克隆画线（偏移少量像素，避免与原图完全重合） */
  duplicateDrawing(id: string): void {
    const src = this.drawing.layer.list().find((d) => d.id === id);
    if (!src) return;
    const iv = this.displaySeries.length > 1 ? this.displaySeries.raw()[1].time - this.displaySeries.raw()[0].time : 60_000;
    const span = this.panes[0].priceScale.range;
    const dPrice = (span.max - span.min) * 0.02;
    const clone = this.drawing.layer.add(src.type, src.points.map((p) => ({ time: p.time + iv * 3, price: p.price + dPrice })), src.style);
    this.drawing.layer.select(clone.id);
    this.notifyDrawings();
    this.invalidate();
  }

  listDrawings(): Drawing[] {
    return [...this.drawing.layer.list()];
  }

  get selectedDrawingId(): string | null {
    return this.drawing.layer.selected?.id ?? null;
  }

  updateDrawingStyle(id: string, style: Partial<Drawing['style']>): void {
    this.drawing.layer.updateStyle(id, style);
    this.notifyDrawings();
    this.invalidate();
  }

  setDrawingVisible(id: string, visible: boolean): void {
    this.drawing.layer.setVisible(id, visible);
    this.notifyDrawings();
    this.invalidate();
  }

  setDrawingLocked(id: string, locked: boolean): void {
    this.drawing.layer.setLocked(id, locked);
    this.notifyDrawings();
    this.invalidate();
  }

  /** 选中画线（对象树点击行） */
  selectDrawing(id: string | null): void {
    this.drawing.layer.select(id);
    this.invalidate();
  }

  /** Ctrl+点击切换多选集合成员（对象树/画布同语义） */
  toggleDrawingSelection(id: string): void {
    this.drawing.layer.toggleSelect(id);
    this.notifyDrawings();
    this.invalidate();
  }

  /** 多选集合（B7：Ctrl+点击累积；对象树高亮/ Delete 删除用） */
  get selectedDrawingIds(): string[] {
    return this.drawing.layer.selectedIdList;
  }

  /** 是否存在选中画线（方向键微调 vs 视口平移的路由判据） */
  hasSelectedDrawing(): boolean {
    return this.drawing.layer.selectedIdList.length > 0;
  }

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
  setDrawingOrder(id: string, action: 'front' | 'forward' | 'backward' | 'back'): void {
    this.drawing.layer.setOrder(id, action);
    this.notifyDrawings();
    this.invalidate();
  }

  removeDrawing(id: string): void {
    this.drawing.layer.remove(id);
    this.notifyDrawings();
    this.invalidate();
  }

  removeSelectedDrawing(): void {
    this.drawing.layer.removeSelected();
    this.notifyDrawings();
    this.invalidate();
  }

  undoDrawing(): void {
    this.drawing.layer.undo();
    this.notifyDrawings();
    this.invalidate();
  }

  redoDrawing(): void {
    this.drawing.layer.redo();
    this.notifyDrawings();
    this.invalidate();
  }

  exportDrawings(): string {
    return serializeDrawings(this.drawing.layer.list());
  }

  importDrawings(raw: string): void {
    this.drawing.layer.replaceAll(deserializeDrawings(raw));
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

  /** 完成路径类画线（双击/回车） */
  finishPlacing(): void {
    this.drawing.finishPlacing();
  }

  cancelPlacing(): void {
    this.drawing.cancelPlacing();
  }

  // ---------- 输入（D 批次拆分③：事件处理迁入 InputController + 三手势） ----------

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
  private ensurePaneScaleReady(pane: ScalablePane): void {
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
      const sel = this.drawing.layer.selectedIdList;
      const primary = sel.length > 0 ? sel[sel.length - 1] : null;
      drawDrawings(ctx, this.drawing.layer.list(), primary, this.drawingCtx(), this.legend.decimals, sel.slice(0, -1));
    }
    // 交易可视化：挂单线 / 持仓线 / TP-SL / K 线进出场标记（数据迁入 TradeGesture）
    drawTrading(
      ctx,
      this.trade.tradeVisual,
      main.priceScale,
      { chartW: this.manager.width - AXIS_WIDTH, chartH: main.height },
      this.legend.decimals,
      this.displaySeries,
      this.viewport,
    );
    const previewTool = this.drawing.tool;
    if (previewTool && this.drawing.placingPoints.length > 0) {
      const placing = this.drawing.placingPoints;
      const pts = this.drawing.preview ? [...placing, this.drawing.preview] : placing;
      const def = getToolDef(previewTool);
      drawDrawings(
        ctx,
        [{ id: '__preview', type: previewTool, points: pts, style: { ...def.defaultStyle, color: theme.crosshair }, locked: false, visible: true }],
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
      this.hover.hoveredStudyUid,
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
