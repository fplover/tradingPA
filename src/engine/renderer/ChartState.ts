import type { Viewport } from '../viewport/Viewport';
import type { Crosshair } from '../crosshair/Crosshair';
import { BarSeries } from '@/data/BarSeries';
import type { CloseCountdown } from '../countdown';
import { heikinAshi, renko, kagi, lineBreak, pointAndFigure, rangeBars, atr, type BrickOptions } from '@/data/transforms';
import { CHART_TYPES, type Bar, type ChartTypeId } from '@/types/market';
import { DEFAULT_LEGEND_OPTIONS, type LegendOptions, type StudyLegendRect } from './drawCrosshair';
import type { GridMode } from './drawAxes';
import { IndicatorManager } from './IndicatorManager';
import { DEFAULT_VP_PARAMS, VolumeProfileModel, coerceVpParams } from '../profile/volumeProfile';
import { PANE_GAP, createPane, type PaneState } from './chartPanes';
import { type VolumeProfileRuntime, bindVpRuntime } from './chartVp';

export { AXIS_HEIGHT, AXIS_WIDTH, type PaneKind, type PaneState, createPane } from './chartPanes';
export { type VolumeProfileRuntime, vpRuntimeOf } from './chartVp';

/**
 * 图表级状态（D 批次拆分④；架构映射：ChartRenderer 字段区、resetPriceScale、
 * layout、applyData/materialize）。Model 层：只持有状态与状态迁移，不画图、
 * 不绑事件；viewport/crosshair/countdown 构造注入，重绘经 invalidate 上送。
 * 面板/几何与 VP 运行态迁 chartPanes.ts / chartVp.ts，导出面 barrel 保持不变。
 */

/** 砖块类图表类型的默认参数（按 ATR 自适应） */
function brickOptions(bars: Bar[]): BrickOptions {
  const size = atr(bars.slice(-200)) || (bars[bars.length - 1]?.close ?? 1) * 0.001;
  return { brickSize: size, reversal: size * 3, lineCount: 3 };
}

/** 砖块类图表类型（无收盘概念，VP 不绘制；applyData 变换分支同用此清单） */
const TRANSFORM_TYPES: ChartTypeId[] = ['heikin-ashi', 'renko', 'kagi', 'line-break', 'point-figure', 'range'];

export function isTimeBasedChartType(type: ChartTypeId): boolean {
  return !TRANSFORM_TYPES.includes(type);
}

export class ChartState {
  // 面板与序列
  panes: PaneState[] = [];
  baseSeries = new BarSeries();
  /** 当前图表类型下实际渲染的序列（砖块/HA 为变换结果） */
  displaySeries: BarSeries = this.baseSeries;
  brickOpts: BrickOptions = {};
  /** 当前图表类型是否时间-based（砖块类无收盘概念，不显示倒计时） */
  timeBasedChart = true;

  // 图表级配置（公开 setter 的落点）
  chartType: ChartTypeId = 'candles';
  logScale = false;
  autoScaleOn = true;
  drawingsHidden = false;
  drawingsLocked = false;
  percentOn = false;
  gridMode: GridMode = 'both';
  bordersVisible = true;
  /** 预留：水印渲染未实现，开关态先落状态层 */
  watermarkVisible = false;
  hideStudies = false;
  legendOptions: LegendOptions = { ...DEFAULT_LEGEND_OPTIONS };

  // 交互态中的图表级部分（输入层经 host 读写；draw() 同读）
  selectedPaneId = 'main';
  hoveredPaneId = 'main';
  replayIndex: number | null = null;
  barSelectMode = false;
  /** 选择K线预览线 x（跟随光标，选中后清除） */
  selectPreviewX: number | null = null;
  /** 研究图例行命中区（drawLegendBlock 回写，输入层读取） */
  studyRects: StudyLegendRect[] = [];

  /** 指标生命周期（拆分④：pane 数组操作独立成模块） */
  readonly indicators: IndicatorManager;
  /** Volume Profile 运行态（P1-F）：经 vpRuntimeOf 暴露给渲染层，IndicatorManager 专用分支读写 */
  readonly vp: VolumeProfileRuntime = { on: false, params: { ...DEFAULT_VP_PARAMS }, dataEpoch: 0, model: new VolumeProfileModel() };

  constructor(
    private viewport: Viewport,
    private crosshair: Crosshair,
    private countdown: CloseCountdown,
    /** 图表区宽（画布宽 - 价格轴宽；随尺寸变化，getter 注入） */
    private chartW: () => number,
    private invalidate: () => void,
  ) {
    bindVpRuntime(viewport, this.vp);
    this.indicators = new IndicatorManager({
      panes: { get: () => this.panes, set: (p) => (this.panes = p) },
      selectedPaneId: { get: () => this.selectedPaneId, set: (id) => (this.selectedPaneId = id) },
      invalidate: () => this.invalidate(),
      vp: {
        getState: () => ({ on: this.vp.on, params: { ...this.vp.params } }),
        setVolumeProfile: (on, params) => this.setVolumeProfile(on, params),
      },
    });
  }

  // ---------- 初始化与面板布局 ----------

  /** 首批数据装载（构造期调用）：建主面板并同步视口 bar 数 */
  initData(bars: Bar[]): void {
    this.baseSeries.replace(bars);
    this.brickOpts = brickOptions(bars);
    this.panes = [createPane('main', 'price', 3)];
    this.viewport.setBarCount(this.displaySeries.length);
  }

  /** 当前选中面板（无效 id 回落主面板） */
  selectedPane(): PaneState {
    return this.panes.find((p) => p.id === this.selectedPaneId) ?? this.panes[0];
  }

  /** 按高度比例重算面板几何（chartH = 画布高 - 时间轴高） */
  layout(chartH: number): void {
    const total = this.panes.reduce((s, p) => s + p.heightRatio, 0);
    let y = 0;
    for (const pane of this.panes) {
      pane.height = (chartH * pane.heightRatio) / total - PANE_GAP;
      pane.y = y;
      y += pane.height + PANE_GAP;
      pane.priceScale.setSize(pane.height);
    }
  }

  /** 恢复全部面板为自动价格适配 */
  resetPriceScale(): void {
    for (const pane of this.panes) {
      pane.manual = false;
      pane.autoBtn = null;
    }
    this.invalidate();
  }

  // ---------- 数据与图表类型 ----------

  get lastBarTime(): number {
    return this.baseSeries.last?.time ?? 0;
  }

  /** 指标计算/绘制用的只读 bar 数组（零拷贝） */
  bars(): readonly Bar[] {
    return this.displaySeries.raw();
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

  /** 前插更早的历史（懒加载）：重建序列，视口平移由调用方做 */
  prependData(bars: Bar[]): void {
    this.baseSeries.prepend(bars);
    this.applyData(false);
  }

  setChartType(type: ChartTypeId): void {
    this.chartType = type;
    this.resetPriceScale();
    this.applyData(true);
  }

  /** 数据/图表类型变化后：重建 displaySeries 并重置视口 */
  applyData(resetView: boolean): void {
    this.vp.dataEpoch++; // VP 缓存签名：数据替换/实时跳动/图表类型切换全失效
    if (TRANSFORM_TYPES.includes(this.chartType)) {
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

  // ---------- 配置 setter（状态 + 重绘） ----------

  setLogScale(on: boolean): void {
    this.logScale = on;
    for (const pane of this.panes) pane.priceScale.setLogMode(on);
    this.invalidate();
  }

  /** 关闭后不再每帧自动适配价格域（TV 底部 auto 开关） */
  setAutoScale(on: boolean): void {
    this.autoScaleOn = on;
    this.invalidate();
  }

  /** 隐藏全部画线（TV 左工具栏眼睛开关） */
  setDrawingsHidden(hidden: boolean): void {
    this.drawingsHidden = hidden;
    this.invalidate();
  }

  /** 锁定全部画线：不可选中/拖动（TV 左工具栏锁开关） */
  setDrawingsLocked(locked: boolean): void {
    this.drawingsLocked = locked;
    this.invalidate();
  }

  /** 百分比坐标（TV 底栏 % 开关）：几何不变，轴与标签改显涨跌幅 */
  setPercentMode(on: boolean): void {
    this.percentOn = on;
    this.invalidate();
  }

  /** 图例可见性（TV 图表设置「状态栏」页） */
  setLegendOptions(options: Partial<LegendOptions>): void {
    this.legendOptions = { ...this.legendOptions, ...options };
    this.invalidate();
  }

  /** 隐藏全部指标（TV 底栏 hide-indicators 开关） */
  setHideStudies(hidden: boolean): void {
    this.hideStudies = hidden;
    this.invalidate();
  }

  /** Volume Profile 开关 + 参数（IndicatorManager profile 分支落点，蓝图 §7） */
  setVolumeProfile(on: boolean, params?: Record<string, string | number | boolean>): void {
    this.vp.on = on;
    if (params) this.vp.params = coerceVpParams(params);
    this.invalidate();
  }

  /** VP 状态只读快照（IndicatorManager.list/模板持久化用） */
  getVpState(): { on: boolean; params: Record<string, string | number | boolean> } {
    return { on: this.vp.on, params: { ...this.vp.params } };
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

  /** 水印显隐（TV 画布页）。预留：引擎水印渲染未实现，状态先落状态层 */
  setWatermarkVisible(visible: boolean): void {
    this.watermarkVisible = visible;
    this.invalidate();
  }

  // ---------- 复盘 / 选线 ----------

  /** 选择K线模式（回调注册在门面；状态与预览线清理在此） */
  setBarSelectMode(on: boolean): void {
    this.barSelectMode = on;
    if (!on) this.selectPreviewX = null;
    this.invalidate();
  }

  /** 可视 bar 区间（复盘模式隐藏 index 之后的 K 线） */
  visibleRange(): { from: number; to: number } {
    const count = this.displaySeries.length;
    let from = Math.max(0, Math.floor(this.viewport.first));
    let to = Math.min(count - 1, from + Math.ceil(this.chartW() / this.viewport.spacing));
    // 复盘模式：隐藏 index 之后的 K 线
    if (this.replayIndex !== null) to = Math.min(to, this.replayIndex);
    if (to < from) from = Math.max(0, to); // 防御：永远不出现空可视域
    return { from, to };
  }
}
