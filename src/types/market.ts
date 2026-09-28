export interface Bar {
  /** UTC 毫秒时间戳，K 线开盘时间 */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceScaleOptions {
  /** 上下留白比例（占可见价格范围的百分比） */
  paddingTop: number;
  paddingBottom: number;
}

export interface TimeScaleOptions {
  /** 右侧预留的空 bar 数 */
  rightOffset: number;
  minBarSpacing: number;
  maxBarSpacing: number;
}

export type TimeframeId =
  | '1s'
  | '5s'
  | '15s'
  | '30s'
  | '1m'
  | '2m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '45m'
  | '1H'
  | '2H'
  | '3H'
  | '4H'
  | '6H'
  | '8H'
  | '12H'
  | '1D'
  | '3D'
  | '1W'
  | '1M';

export interface Timeframe {
  id: TimeframeId;
  label: string;
  /** 秒数；周/月为 0，走日历分桶 */
  seconds: number;
  /** 日历分桶类型 */
  calendar?: 'week' | 'month';
}

export const TIMEFRAMES: Timeframe[] = [
  { id: '1s', label: '1秒', seconds: 1 },
  { id: '5s', label: '5秒', seconds: 5 },
  { id: '15s', label: '15秒', seconds: 15 },
  { id: '30s', label: '30秒', seconds: 30 },
  { id: '1m', label: '1分', seconds: 60 },
  { id: '2m', label: '2分', seconds: 120 },
  { id: '3m', label: '3分', seconds: 180 },
  { id: '5m', label: '5分', seconds: 300 },
  { id: '15m', label: '15分', seconds: 900 },
  { id: '30m', label: '30分', seconds: 1800 },
  { id: '45m', label: '45分', seconds: 2700 },
  { id: '1H', label: '1时', seconds: 3600 },
  { id: '2H', label: '2时', seconds: 7200 },
  { id: '3H', label: '3时', seconds: 10800 },
  { id: '4H', label: '4时', seconds: 14400 },
  { id: '6H', label: '6时', seconds: 21600 },
  { id: '8H', label: '8时', seconds: 28800 },
  { id: '12H', label: '12时', seconds: 43200 },
  { id: '1D', label: '1日', seconds: 86400 },
  { id: '3D', label: '3日', seconds: 259200 },
  { id: '1W', label: '1周', seconds: 0, calendar: 'week' },
  { id: '1M', label: '1月', seconds: 0, calendar: 'month' },
];

export function getTimeframe(id: TimeframeId): Timeframe {
  return TIMEFRAMES.find((t) => t.id === id) ?? TIMEFRAMES[4];
}

/** 运行时注册自定义周期（B5 自定义间隔）：幂等追加到档位表末尾，同 id 不覆盖。
 *  注册后 getTimeframe 及一切 TIMEFRAMES 派生（顶栏下拉、图表单元格、指标可见周期）
 *  立即认得该周期；内置档位不受影响。自定义周期 id 形如 custom:<分钟数>。 */
export function registerTimeframe(tf: Timeframe): void {
  if (TIMEFRAMES.some((t) => t.id === tf.id)) return;
  TIMEFRAMES.push(tf);
}

/** id 是否为已知周期（内置 + 运行时注册的自定义周期）。
 *  布局快照校验用：自定义周期 id 不在编译期 TimeframeId 联合类型内，但运行时合法，
 *  模块级快照（new Set(TIMEFRAMES.map)）认不得后注册的周期，须用本函数做活校验。 */
export function isKnownTimeframeId(id: unknown): boolean {
  return typeof id === 'string' && TIMEFRAMES.some((t) => t.id === id);
}

export type ChartTypeId =
  | 'candles'
  | 'ohlc'
  | 'line'
  | 'step-line'
  | 'line-markers'
  | 'area'
  | 'hlc-area'
  | 'columns'
  | 'high-low'
  | 'baseline'
  | 'hollow'
  | 'heikin-ashi'
  | 'volume-candles'
  | 'renko'
  | 'kagi'
  | 'line-break'
  | 'point-figure'
  | 'range';

export interface ChartTypeDef {
  id: ChartTypeId;
  label: string;
  /** 基于价格的常规类型；false 为砖块类型（由源数据变换而来） */
  timeBased: boolean;
}

export const CHART_TYPES: ChartTypeDef[] = [
  { id: 'candles', label: '蜡烛图', timeBased: true },
  { id: 'ohlc', label: '竹线图', timeBased: true },
  { id: 'line', label: '线形图', timeBased: true },
  { id: 'step-line', label: '阶梯线', timeBased: true },
  { id: 'line-markers', label: '带标记线形', timeBased: true },
  { id: 'area', label: '面积图', timeBased: true },
  { id: 'hlc-area', label: 'HLC 面积', timeBased: true },
  { id: 'columns', label: '柱状图', timeBased: true },
  { id: 'high-low', label: '高低图', timeBased: true },
  { id: 'baseline', label: '基线图', timeBased: true },
  { id: 'hollow', label: '空心蜡烛', timeBased: true },
  { id: 'heikin-ashi', label: '平均K线', timeBased: true },
  { id: 'volume-candles', label: '成交量蜡烛', timeBased: true },
  { id: 'renko', label: '砖形图', timeBased: false },
  { id: 'kagi', label: '卡吉图', timeBased: false },
  { id: 'line-break', label: '新价图', timeBased: false },
  { id: 'point-figure', label: '点数图', timeBased: false },
  { id: 'range', label: '区间图', timeBased: false },
];
