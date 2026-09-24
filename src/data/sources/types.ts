import type { Bar, TimeframeId } from '@/types/market';
import type { AssetClass, Instrument, MarketId } from '@/types/instrument';

/** 一条实时行情。自选股列表的行、图表的最后一根 K 线都由它驱动。 */
export interface Quote {
  id: string;
  price: number;
  /** 涨跌额 */
  change: number;
  /** 涨跌幅（百分数，如 -1.37 表示 -1.37%） */
  changePct: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  /** 成交额（元），期货为 0 表示源未提供 */
  amount: number;
  /** 行情时间（ms） */
  time: number;
}

/** 搜索结果条目 */
export interface SearchHit {
  instrument: Instrument;
  /** 命中来源，用于结果右侧徽章（如「东财搜索」「期货列表」） */
  source: string;
}

export interface BarsRequest {
  instrument: Instrument;
  timeframe: TimeframeId;
  /** 期望条数 */
  limit: number;
}

/** 无历史 K 线可用时抛出，UI 据此显示「暂无该市场历史数据」而非假数据 */
export class NoHistoryError extends Error {
  constructor(public instrument: Instrument, public timeframe: TimeframeId) {
    super(`${instrument.symbol} 在 ${timeframe} 周期暂无可用历史数据源`);
    this.name = 'NoHistoryError';
  }
}

export interface MarketSource {
  /** 数据源名，出现在状态提示里便于排查 */
  readonly name: string;
  /** 该源覆盖的市场 */
  readonly markets: MarketId[];
  /** 批量报价。一次请求尽量带多个品种。 */
  quotes?(instruments: Instrument[]): Promise<Quote[]>;
  /** 历史 K 线。不支持时抛 NoHistoryError。 */
  bars?(req: BarsRequest): Promise<Bar[]>;
}

export interface SearchSource {
  readonly name: string;
  /** 返回该源可枚举的全部品种；期货类源用合约列表实现本地即时搜索 */
  universe?(): Promise<Instrument[]>;
  /** 关键字搜索。asset 为空表示全市场。 */
  search(query: string, asset?: AssetClass): Promise<SearchHit[]>;
}
