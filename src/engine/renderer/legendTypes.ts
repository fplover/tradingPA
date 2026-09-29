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
