import type { Bar } from '@/types/market';
import { makeInstrument } from '@/types/instrument';
import { fetchKlines, toBinanceInterval } from '@/data/feed/binance';
import { fetchJson } from './http';
import { NoHistoryError, type BarsRequest, type MarketSource, type SearchHit } from './types';

/** 加密货币：沿用既有 Binance 通道。本网络环境下 Binance 不可达，失败时由上层降级。 */

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

const TICKER_URL = 'https://api.binance.com/api/v3/ticker/24hr';
const PRICE_URL = 'https://api.binance.com/api/v3/ticker/price';

export const binanceSource: MarketSource = {
  name: 'Binance',
  markets: ['crypto'],

  async quotes(instruments) {
    const syms = instruments.filter((i) => i.market === 'crypto').map((i) => i.code.toUpperCase());
    if (syms.length === 0) return [];
    const url = `${TICKER_URL}?symbols=${encodeURIComponent(JSON.stringify(syms))}`;
    const rows = await fetchJson<Ticker24h[]>(url);
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
 */
export async function cryptoSearch(query: string): Promise<SearchHit[]> {
  const q = query
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (q.length < 2) return [];
  const candidates = QUOTE_ASSETS.some((a) => q.endsWith(a)) ? [q] : QUOTE_ASSETS.map((a) => `${q}${a}`);
  try {
    const url = `${PRICE_URL}?symbols=${encodeURIComponent(JSON.stringify(candidates))}`;
    const rows = await fetchJson<PriceRow[]>(url, 6000);
    const valid = new Set(rows.map((r) => r.symbol));
    return candidates
      .filter((sym) => valid.has(sym))
      .map((sym) => ({
        instrument: makeInstrument('crypto', sym, sym, { exchange: 'BINANCE', decimals: sym.endsWith('USDT') ? 2 : 6 }),
        source: 'Binance',
      }));
  } catch {
    // 数据源不可达时不给猜测结果，让 UI 显示「未找到」
    return [];
  }
}
