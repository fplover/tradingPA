export interface Bar {
  /** UTC 毫秒时间戳，K 线开盘时间 */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SeriesType =
  | 'candles'
  | 'ohlc'
  | 'line'
  | 'area'
  | 'baseline'
  | 'hollow'
  | 'heikin-ashi';

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
