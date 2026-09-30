import type { Bar } from '@/types/market';

export type ParamValue = number | string | boolean;

export interface IndicatorParam {
  key: string;
  label: string;
  type: 'number' | 'color' | 'boolean' | 'select';
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
  /** 关联 plot 全部隐藏时，设置对话框「输入」页隐藏该参数（TV Volume 的 length） */
  hideWhenPlotsHidden?: string[];
}

export type PlotKind = 'line' | 'histogram' | 'band' | 'level';

export interface PlotStyle {
  kind: PlotKind;
  color: string;
  lineWidth?: number;
  /** band：填充的另一条 plot key */
  bandWith?: string;
  /** histogram 以上下零轴分色（涨/跌） */
  upColor?: string;
  downColor?: string;
  /** histogram：按 K 线涨跌分色而非数值正负（成交量等恒为正的指标） */
  colorByBar?: boolean;
}

export interface IndicatorPlot {
  key: string;
  label: string;
  style: PlotStyle;
}

export interface IndicatorDef {
  id: string;
  name: string;
  category: string;
  /** true = 叠加到主图；false = 独立副图 */
  overlay: boolean;
  /** true = 区间几何型指标（Volume Profile）：不产逐 bar 序列、不建实例/面板，
   *  由 IndicatorManager 走专用分支挂图表级状态（P1-F 蓝图 §4） */
  profile?: boolean;
  /** 计算所需的最大回看 bar 数 */
  lookback: number;
  params: IndicatorParam[];
  plots: IndicatorPlot[];
  compute(bars: readonly Bar[], params: Record<string, ParamValue>): IndicatorOutputs;
  /** 可选旁路输出（Pine bgcolor/barcolor 条件序列用）：与 compute 同窗口调用、
   *  同窗口脏缓存周期。窗口对齐由 computeWindow 保证——绘制/图例多窗口下
   *  旁路数据随各自窗口缓存，不会串窗。 */
  computeExtra?(bars: readonly Bar[], params: Record<string, ParamValue>): unknown;
}

/** 逐 bar 绘制指令（Pine paint 旁路的通用形状；core 不依赖 pine 具体类型） */
export interface BarPaint {
  kind: 'bgcolor' | 'barcolor';
  /** CSS 颜色（hex）；渲染层按 kind 决定透明度 */
  color: string;
  /** 与 compute 入窗等长的条件序列：undefined/0 = 该 bar 不生效；null = 恒生效 */
  cond: Array<number | undefined> | null;
  /** 脚本体行号（诊断用） */
  line: number;
}

export type IndicatorOutputs = Record<string, Array<number | undefined>>;
