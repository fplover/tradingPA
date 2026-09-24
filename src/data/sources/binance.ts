import type { Bar } from '@/types/market';
import { fetchKlines, toBinanceInterval } from '@/data/feed/binance';
import { fetchJson } from './http';
import { NoHistoryError, type BarsRequest, type MarketSource } from './types';

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
