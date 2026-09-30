import type { MarketId } from '@/types/instrument';

export interface LegendInfo {
  symbol: string;
  interval: string;
  decimals: number;
  exchange?: string;
  timeframeId?: string;
  /** 市场（用于开/闭市圆点判定，调用方每帧计算 marketOpen） */
  market?: MarketId;
  /** 市场开/闭市状态（TV 图例品种名旁圆点）；undefined = 未知不画 */
  marketOpen?: boolean;
  /** 对比序列（P2-D 叠加）：存在即绘图例第二行；数据经 setLegend 既有公开通道进渲染循环 */
  compare?: CompareLegendInfo;
}

/** 对比序列图例信息（P2-D）：归一化百分比口径 + 与主 series 按 time 对齐的收盘序列 */
export interface CompareLegendInfo {
  symbol: string;
  /** 归一化基准 = 对比序列首根收盘（所有百分比相对它） */
  base: number;
  /** 末点归一化百分比（图例第二行读数；percent 模式下即主序列同一坐标系的读数） */
  lastPct: number;
  /** 对齐主 series 时间栅格的收盘价（index = 主 bar index；null = 该主 bar 无对应对比 bar） */
  aligned: ReadonlyArray<number | null>;
}

/** 图例可见性（TV 图表设置「状态栏」页 + 图例右键菜单） */
export interface LegendOptions {
  /** 商品行（代码 · 周期 · 交易所） */
  showSeriesTitle: boolean;
  showOHLC: boolean;
  showChange: boolean;
  showVolume: boolean;
  /** 指标名称 / 参数 / 数值 三档可分别开关 */
  showStudyNames: boolean;
  showStudyArgs: boolean;
  showStudyValues: boolean;
}

export const DEFAULT_LEGEND_OPTIONS: LegendOptions = {
  showSeriesTitle: true,
  showOHLC: true,
  showChange: true,
  showVolume: true,
  showStudyNames: true,
  showStudyArgs: true,
  showStudyValues: true,
};

/** 图例绘制附加信息：超出可用高度的折叠行数 */
export interface LegendDrawInfo {
  collapsed: number;
}

export interface LegendStudyValues {
  uid: string;
  name: string;
  precision?: number;
  values: Array<{ label: string; value: number }>;
}

/** 研究图例行命中区（含右侧三个悬停按钮的子区） */
export interface StudyLegendRect {
  uid: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 按钮区起点 x：eye / gear / remove 各 16px */
  btnX: number;
}
