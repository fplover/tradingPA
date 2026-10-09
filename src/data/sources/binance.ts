import type { Bar } from '@/types/market';
import { makeInstrument } from '@/types/instrument';
import { fetchBinanceJson, fetchKlines, toBinanceInterval } from '@/data/feed/binance';
import { NoHistoryError, type BarsRequest, type MarketSource, type SearchHit } from './types';
import { gateSearch } from './gate';

/** 加密货币：主源 Binance（REST 多主机回退，主站被墙时落官方行情镜像），
 *  K 线由 registry 编排 Gate 回退；搜索在 Binance 校验通道失败时回退 Gate 目录。 */

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
}

const TICKER_PATH = '/api/v3/ticker/24hr';
const PRICE_PATH = '/api/v3/ticker/price';
export const binanceSource: MarketSource = {
  name: 'Binance',
  markets: ['crypto'],

  async quotes(instruments) {
    const syms = instruments.filter((i) => i.market === 'crypto').map((i) => i.code.toUpperCase());
    if (syms.length === 0) return [];
    const rows = await fetchBinanceJson<Ticker24h[]>(
      `${TICKER_PATH}?symbols=${encodeURIComponent(JSON.stringify(syms))}`,
    );
    const byId = new Map(instruments.map((i) => [i.code.toUpperCase(), i.id]));
    return rows
      .filter((r) => byId.has(r.symbol))
      .map((r) => ({
        id: byId.get(r.symbol)!,
        price: Number(r.lastPrice),
        change: Number(r.priceChange),
        changePct: Number(r.priceChangePercent),
        prevClose: Number(r.openPrice),
        open: Number(r.openPrice),
        high: Number(r.highPrice),
        low: Number(r.lowPrice),
        volume: Number(r.volume),
        amount: Number(r.quoteVolume),
        time: r.closeTime,
      }));
  },

  async bars({ instrument, timeframe, limit }: BarsRequest): Promise<Bar[]> {
    if (instrument.market !== 'crypto') throw new NoHistoryError(instrument, timeframe);
    return fetchKlines(instrument.code.toUpperCase(), toBinanceInterval(timeframe), { limit });
  },
};

/** 常见计价资产：输入 BTC 时按这些顺序补全成交易对 */
const QUOTE_ASSETS = ['USDT', 'USDC', 'BTC'];

interface PriceRow {
  symbol: string;
  price: string;
}

/**
 * 加密货币搜索。Binance 没有联想接口，exchangeInfo 又有 2MB，
 * 因此按计价资产补全候选交易对，再用一次批量行情校验哪些真实存在。
 * Binance 通道不可达（被墙/断网）时回退 Gate 交易对目录——同一品种 id，
 * K 线由回退链里的 Gate 供数。
 */
export async function cryptoSearch(query: string): Promise<SearchHit[]> {
  const q = query
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (q.length < 2) return [];
  const candidates = QUOTE_ASSETS.some((a) => q.endsWith(a)) ? [q] : QUOTE_ASSETS.map((a) => `${q}${a}`);
  try {
    const rows = await fetchBinanceJson<PriceRow[]>(
      `${PRICE_PATH}?symbols=${encodeURIComponent(JSON.stringify(candidates))}`,
      6000,
    );
    const valid = new Set(rows.map((r) => r.symbol));
    return candidates
      .filter((sym) => valid.has(sym))
      .map((sym) => ({
        instrument: makeInstrument('crypto', sym, sym, { exchange: 'BINANCE', decimals: sym.endsWith('USDT') ? 2 : 6 }),
        source: 'Binance',
      }));
  } catch {
    // Binance 不可达时不给猜测结果，改用 Gate 目录精确匹配
    return gateSearch(q);
  }
}
