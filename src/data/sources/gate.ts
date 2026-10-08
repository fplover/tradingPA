import type { Bar, TimeframeId } from '@/types/market';
import { getTimeframe } from '@/types/market';
import { customIntervalMinutes } from '@/features/market/customInterval';
import { makeInstrument } from '@/types/instrument';
import type { Instrument } from '@/types/instrument';
import { aggregateBars } from '@/data/aggregate';
import { localTzOffsetMinutes } from '@/data/tz';
import { fetchJson } from './http';
import { NoHistoryError, type BarsRequest, type MarketSource, type Quote, type SearchHit } from './types';

/**
 * Gate.io：加密货币第二交易所（本网络实测可达且带 CORS *，Binance 主站被墙时的补充与回退）。
 * - K 线 /spot/candlesticks：行格式 [时间秒, 计价量, 收, 高, 低, 开, 基础量, closed]——收在开前，易错点已钉单测。
 * - 报价 /spot/tickers 一次返回全市场，20s 缓存；合约目录 /spot/currency_pairs 供搜索回退。
 * - 交易对形式 BTC_USDT ↔ Binance 的 BTCUSDT 互转：本源与 Binance 共享 crypto:CODE 的品种 id，
 *   同一交易对在 Binance 不可达时由本源无缝供数。
 * 已知边界：无 1s 周期（Binance 独有）；实时推送仍走 Binance WS 通路，本源仅历史 K 线/报价/搜索。
 */

const GATE_API = 'https://api.gateio.ws/api/v4';

/** Gate 原生周期（秒）→ interval 字符串（7d = 周，无 1s/3m/2m/45m 等非原生档） */
const GATE_NATIVE: Array<[number, string]> = [
  [60, '1m'],
  [300, '5m'],
  [900, '15m'],
  [1800, '30m'],
  [3600, '1h'],
  [7200, '2h'],
  [14400, '4h'],
  [21600, '6h'],
  [28800, '8h'],
  [43200, '12h'],
  [86_400, '1d'],
  [604_800, '7d'],
];

type Plan = { kind: 'bars'; interval: string; baseSeconds: number; aggregate: boolean } | { kind: 'none' };

/** 自定义周期 → 可整除的最大分钟基期（1m 不参与循环，仅作 ≤30 分钟的兜底）；无整除放弃 */
function customPlan(minutes: number): Plan {
  const minuteNatives = GATE_NATIVE.filter(([sec]) => sec > 60 && sec < 3600).reverse(); // 大基期优先
  for (const [sec, iv] of minuteNatives) {
    if (minutes % (sec / 60) === 0) {
      return { kind: 'bars', interval: iv, baseSeconds: sec, aggregate: minutes > sec / 60 };
    }
  }
  return minutes <= 30 ? { kind: 'bars', interval: '1m', baseSeconds: 60, aggregate: minutes > 1 } : { kind: 'none' };
}

/** 周期 → Gate 取数计划：原生直取；非原生/自定义取最大可整除基期后本地聚合。
 *  导出供单测：周期归一化与 [ts,计价量,收,高,低,开] 行序是本源两大易错点。 */
export function planFor(tf: TimeframeId): Plan {
  const customMinutes = customIntervalMinutes(tf);
  if (customMinutes !== null) return customPlan(customMinutes);
  const seconds = getTimeframe(tf).seconds;
  if (seconds <= 0) {
    // 日历周期（1M 月）无原生档，按日聚合
    return { kind: 'bars', interval: '1d', baseSeconds: 86_400, aggregate: true };
  }
  const native = GATE_NATIVE.find(([sec]) => sec === seconds);
  if (native) return { kind: 'bars', interval: native[1], baseSeconds: seconds, aggregate: false };
  let best: [number, string] | null = null;
  for (const entry of GATE_NATIVE) {
    if (seconds % entry[0] === 0 && (best === null || entry[0] > best[0])) best = entry;
  }
  if (!best) return { kind: 'none' };
  return { kind: 'bars', interval: best[1], baseSeconds: best[0], aggregate: true };
}

/** 常见计价资产（长后缀优先，避免 BTC_USDT 被切成 BTC_US + DT） */
const QUOTE_SUFFIXES = ['FDUSD', 'USDT', 'USDC', 'TUSD', 'BTC', 'ETH', 'USD'];

/** Binance 形态 BTCUSDT → Gate 形态 BTC_USDT。识别不了计价资产返回 null。导出供单测。 */
export function toGatePair(symbol: string): string | null {
  const s = symbol.toUpperCase();
  for (const q of QUOTE_SUFFIXES) {
    if (s.endsWith(q) && s.length > q.length) return `${s.slice(0, -q.length)}_${q}`;
  }
  return null;
}

/** Gate 蜡烛行 → Bar。行序钉死：收在开前（与 Binance/腾讯相反）。导出供单测。 */
export function parseCandle(row: unknown[]): Bar | null {
  if (row.length < 7) return null;
  const [ts, , close, high, low, open, baseVol] = row as string[];
  const time = Number(ts) * 1000;
  if (!Number.isFinite(time)) return null;
  return {
    time,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(baseVol) || 0,
  };
}

/** 历史 K 线 URL（{limit} 上限 1000；barsBefore 用 from/to 秒级区间，向前回推 limit 个基期） */
export function candlesUrl(pair: string, interval: string, limit: number, toSec?: number): string {
  const params = new URLSearchParams({ currency_pair: pair, interval, limit: String(limit) });
  if (toSec !== undefined) {
    params.set('to', String(toSec));
    params.set('from', String(toSec - limit * intervalSeconds(interval)));
  }
  return `${GATE_API}/spot/candlesticks?${params}`;
}

function intervalSeconds(interval: string): number {
  const n = Number(interval.slice(0, -1));
  const unit = interval.slice(-1);
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  return n * 86_400; // d / 7d（7d 数字部分是 7，7*86400 恰好正确）
}

interface GateTicker {
  currency_pair: string;
  last: string;
  change_percentage: string;
  high_24h: string;
  low_24h: string;
  base_volume: string;
  quote_volume: string;
}

/** 全市场报价缓存：一次请求覆盖所有交易对，报价与搜索共用 */
let tickerCache: { at: number; rows: GateTicker[] } | null = null;
const TICKER_TTL = 20_000;

async function loadTickers(): Promise<GateTicker[]> {
  if (tickerCache && Date.now() - tickerCache.at < TICKER_TTL) return tickerCache.rows;
  const rows = await fetchJson<GateTicker[]>(`${GATE_API}/spot/tickers`, 10_000);
  tickerCache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return tickerCache.rows;
}

/** Gate 报价行 → Quote。change_percentage 推回涨跌额与前收。导出供单测。 */
export function tickerToQuote(id: string, row: GateTicker): Quote | null {
  const price = Number(row.last);
  if (!Number.isFinite(price) || price <= 0) return null;
  const changePct = Number(row.change_percentage) || 0;
  const prevClose = price / (1 + changePct / 100);
  return {
    id,
    price,
    change: price - prevClose,
    changePct,
    prevClose,
    open: prevClose,
    high: Number(row.high_24h) || 0,
    low: Number(row.low_24h) || 0,
    volume: Number(row.base_volume) || 0,
    amount: Number(row.quote_volume) || 0,
    time: Date.now(),
  };
}

interface CurrencyPair {
  id: string;
  base: string;
  quote: string;
}

/** 交易对目录缓存（搜索回退用） */
let pairCache: { at: number; rows: CurrencyPair[] } | null = null;
const PAIR_TTL = 60_000;

/** Gate 全量现货交易对 → Instrument（code 归一为 Binance 形态 BTCUSDT）。导出供搜索回退。 */
export async function gateUniverse(): Promise<Instrument[]> {
  if (pairCache && Date.now() - pairCache.at < PAIR_TTL) return pairFromCache();
  const rows = await fetchJson<CurrencyPair[]>(`${GATE_API}/spot/currency_pairs`, 10_000);
  pairCache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return pairFromCache();
}

function pairFromCache(): Instrument[] {
  return (pairCache?.rows ?? []).map((p) => {
    const code = p.id.replace('_', '');
    return makeInstrument('crypto', code, `${p.base}/${p.quote}`, {
      exchange: 'GATE',
      decimals: p.quote === 'USDT' || p.quote === 'USD' ? 2 : 6,
    });
  });
}

/** Gate 本地搜索：交易对目录按 base/整对过滤。Binance 校验通道失败时的加密搜索回退。 */
export async function gateSearch(query: string): Promise<SearchHit[]> {
  const q = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (q.length < 2) return [];
  const all = await gateUniverse();
  const out: SearchHit[] = [];
  for (const inst of all) {
    const pair = toGatePair(inst.code);
    if (inst.code.includes(q) || (pair !== null && pair.replace('_', '').includes(q))) {
      out.push({ instrument: inst, source: 'Gate' });
    }
    if (out.length >= 60) break;
  }
  return out;
}

export const gateSource: MarketSource = {
  name: 'Gate',
  markets: ['crypto'],

  async quotes(instruments) {
    const wanted = instruments.filter((i) => i.market === 'crypto');
    if (wanted.length === 0) return [];
    const rows = await loadTickers();
    const byPair = new Map(rows.map((r) => [r.currency_pair, r]));
    const out: Quote[] = [];
    for (const inst of wanted) {
      const pair = toGatePair(inst.code);
      const row = pair ? byPair.get(pair) : undefined;
      if (!row) continue;
      const q = tickerToQuote(inst.id, row);
      if (q) out.push(q);
    }
    return out;
  },

  async bars({ instrument, timeframe, limit }: BarsRequest): Promise<Bar[]> {
    if (instrument.market !== 'crypto') throw new NoHistoryError(instrument, timeframe);
    const pair = toGatePair(instrument.code);
    if (!pair) throw new NoHistoryError(instrument, timeframe);
    const plan = planFor(timeframe);
    if (plan.kind === 'none') throw new NoHistoryError(instrument, timeframe);

    const tf = getTimeframe(timeframe);
    const ratio = plan.aggregate && tf.seconds > 0 ? Math.ceil(tf.seconds / plan.baseSeconds) : 1;
    const count = Math.min(1000, Math.max(limit, limit * ratio));

    const rows = await fetchJson<unknown[][]>(candlesUrl(pair, plan.interval, count), 10_000);
    const bars = (Array.isArray(rows) ? rows : []).map(parseCandle).filter((b): b is Bar => b !== null);
    if (bars.length === 0) throw new NoHistoryError(instrument, timeframe);

    if (!plan.aggregate) return bars.slice(-limit);
    return aggregateBars(bars, tf, localTzOffsetMinutes()).slice(-limit);
  },

  async barsBefore({ instrument, timeframe, limit, before }): Promise<Bar[]> {
    const pair = toGatePair(instrument.code);
    if (!pair) return [];
    const plan = planFor(timeframe);
    if (plan.kind === 'none') return [];
    const url = candlesUrl(pair, plan.interval, Math.min(1000, limit), Math.floor(before / 1000));
    const rows = await fetchJson<unknown[][]>(url, 10_000).catch(() => []);
    const bars = (Array.isArray(rows) ? rows : []).map(parseCandle).filter((b): b is Bar => b !== null);
    return bars.filter((b) => b.time < before);
  },
};
