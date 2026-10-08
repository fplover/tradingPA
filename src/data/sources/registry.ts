import type { Bar } from '@/types/market';
import type { TimeframeId } from '@/types/market';
import type { AssetClass, Instrument, MarketId } from '@/types/instrument';
import { tencentSource } from './tencent';
import { binanceSource, cryptoSearch } from './binance';
import { sinaSource } from './sina';
import { gateSource } from './gate';
import { eastmoneySearch, futuresQuotes, futuresSearch, futuresUniverse } from './eastmoney';
import { NoHistoryError, type MarketSource, type Quote, type SearchHit } from './types';

/**
 * 数据源路由。上层只认 Instrument，不关心哪个站点提供数据。
 * 报价按数据源分组批量请求，K 线按品种所属市场沿候选链取第一个能供应该周期的源。
 */

function dedupe(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const id = h.instrument.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const QUOTE_SOURCES: MarketSource[] = [tencentSource, binanceSource];

/** 市场 → K 线数据源候选链（顺序即优先级） */
const BARS_BY_MARKET: Record<MarketId, MarketSource[]> = {
  'cn-sh': [tencentSource],
  'cn-sz': [tencentSource],
  'cn-bj': [tencentSource],
  // 港股只有日/周/月，分钟线暂无免费源（腾讯/新浪/东财均不提供）——唯一已知缺口
  hk: [tencentSource],
  // 美股日线走腾讯，分钟线落新浪（script 标签 JSONP 直连，生产可用）
  'us-nasdaq': [tencentSource, sinaSource],
  'us-nyse': [tencentSource, sinaSource],
  'us-amex': [tencentSource, sinaSource],
  'cn-index': [tencentSource],
  // 国内/外盘期货：新浪 script 标签 JSONP 直连，开发与生产均可用
  'cn-fut': [sinaSource],
  'global-fut': [sinaSource],
  // 加密：Binance 主源（REST 多主机回退到官方镜像）+ Gate 回退（主站被墙时同对供数）
  crypto: [binanceSource, gateSource],
};

/** 市场 → 报价数据源 */
const QUOTES_BY_MARKET: Record<MarketId, 'source' | 'futures'> = {
  'cn-sh': 'source',
  'cn-sz': 'source',
  'cn-bj': 'source',
  hk: 'source',
  'us-nasdaq': 'source',
  'us-nyse': 'source',
  'us-amex': 'source',
  'cn-index': 'source',
  'cn-fut': 'futures',
  'global-fut': 'futures',
  crypto: 'source',
};

export const dataRegistry = {
  /** 批量报价：按数据源分组，单组失败不影响其他组 */
  async quotes(instruments: Instrument[]): Promise<Quote[]> {
    if (instruments.length === 0) return [];
    const direct: Instrument[] = [];
    const futures: Instrument[] = [];
    for (const inst of instruments) {
      if (QUOTES_BY_MARKET[inst.market] === 'futures') futures.push(inst);
      else direct.push(inst);
    }

    const jobs: Promise<Quote[]>[] = [];
    if (futures.length > 0) jobs.push(futuresQuotes(futures).catch(() => []));
    if (direct.length > 0) {
      for (const source of QUOTE_SOURCES) {
        const group = direct.filter((i) => source.markets.includes(i.market));
        if (group.length === 0) continue;
        if (!source.quotes) continue;
        jobs.push(source.quotes(group).catch(() => []));
      }
    }
    const results = await Promise.all(jobs);
    return results.flat();
  },

  /** 历史 K 线。无可用源时抛 NoHistoryError，调用方应显示空状态而不是编造数据。 */
  async bars(instrument: Instrument, timeframe: TimeframeId, limit = 500): Promise<Bar[]> {
    const chain = BARS_BY_MARKET[instrument.market];
    if (chain.length === 0) throw new NoHistoryError(instrument, timeframe);
    let lastError: unknown = null;
    for (const source of chain) {
      if (!source.bars) continue;
      try {
        return await source.bars({ instrument, timeframe, limit });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new NoHistoryError(instrument, timeframe);
  },

  /** 向左翻页取更早历史。源不支持（或已到数据起点）时返回空数组。 */
  async barsBefore(instrument: Instrument, timeframe: TimeframeId, before: number, limit = 500): Promise<Bar[]> {
    for (const source of BARS_BY_MARKET[instrument.market]) {
      if (!source.barsBefore) continue;
      try {
        const rows = await source.barsBefore({ instrument, timeframe, limit, before });
        if (rows.length > 0) return rows;
      } catch {
        /* 该源取不到就试下一个 */
      }
    }
    return [];
  },

  /** 符号搜索：东财全市场联想；期货分类并上合约全集，加密分类走 Binance 交易对校验 */
  async search(query: string, asset?: AssetClass): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const suggest = eastmoneySearch.search(q, asset).catch(() => [] as SearchHit[]);

    if (asset === 'crypto') {
      const [a, b] = await Promise.all([suggest, cryptoSearch(q)]);
      return dedupe([...b, ...a]);
    }
    if (asset !== 'futures') return suggest;
    const [a, b] = await Promise.all([suggest, futuresSearch(q, asset).catch(() => [] as SearchHit[])]);
    return dedupe([...a, ...b]);
  },

  /** 期货合约全集（浏览/搜索用） */
  allFutures(): Promise<Instrument[]> {
    return futuresUniverse();
  },

  sourceName(instrument: Instrument): string {
    return BARS_BY_MARKET[instrument.market]?.[0]?.name ?? '—';
  },

  hasHistory(instrument: Instrument): boolean {
    return BARS_BY_MARKET[instrument.market].length > 0;
  },
};

export { NoHistoryError };
export type { Quote, SearchHit };
