import type { Bar, TimeframeId } from '@/types/market';
import { getTimeframe } from '@/types/market';
import type { Instrument, MarketId } from '@/types/instrument';
import { aggregateBars } from '@/data/aggregate';
import { fetchGbk, fetchJson, parseTencentPayload } from './http';
import { NoHistoryError, type BarsRequest, type MarketSource, type Quote } from './types';

/** 腾讯财经：A股/港股/美股/指数 的实时报价与历史 K 线。
 *  qt.gtimg.cn 与 ifzq.gtimg.cn 均返回 Access-Control-Allow-Origin: *，浏览器可直连。 */

const QUOTE_URL = 'https://qt.gtimg.cn/q=';
const DAILY_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';
const MINUTE_URL = 'https://ifzq.gtimg.cn/appstock/app/kline/mkline';

const SUPPORTED: MarketId[] = ['cn-sh', 'cn-sz', 'cn-bj', 'hk', 'us-nasdaq', 'us-nyse', 'us-amex', 'cn-index'];

/** 美股需要交易所后缀，否则 K 线接口取不到数据 */
const US_SUFFIX: Record<string, string> = { NASDAQ: '.OQ', NYSE: '.N', AMEX: '.A' };

/**
 * Instrument → 腾讯代码。
 * 报价接口用裸代码（usAAPL），K 线接口要带交易所后缀（usAAPL.OQ），两者不通用。
 */
function symbolOf(inst: Instrument, withSuffix: boolean): string | null {
  switch (inst.market) {
    case 'cn-sh':
    case 'cn-index':
      // 指数与沪市共用 sh 前缀；深市指数由 exchange 标记区分
      return (inst.exchange === 'SZSE' ? 'sz' : 'sh') + inst.code;
    case 'cn-sz':
      return 'sz' + inst.code;
    case 'cn-bj':
      return 'bj' + inst.code;
    case 'hk':
      return 'hk' + inst.code;
    case 'us-nasdaq':
    case 'us-nyse':
    case 'us-amex': {
      const code = inst.code.toUpperCase();
      return withSuffix ? `us${code}${US_SUFFIX[inst.exchange] ?? ''}` : `us${code}`;
    }
    default:
      return null;
  }
}

export function tencentSymbol(inst: Instrument): string | null {
  return symbolOf(inst, false);
}

type Plan =
  | { kind: 'minute'; n: number; aggregate: boolean }
  | { kind: 'daily'; p: 'day' | 'week' | 'month'; aggregate: boolean }
  | { kind: 'none' };

/** 周期 → 腾讯可取的最近基础周期；取不到同级时用更细的基础数据本地聚合 */
function planFor(tf: TimeframeId): Plan {
  switch (tf) {
    case '1m':
      return { kind: 'minute', n: 1, aggregate: false };
    case '3m':
      return { kind: 'minute', n: 1, aggregate: true };
    case '5m':
      return { kind: 'minute', n: 5, aggregate: false };
    case '15m':
      return { kind: 'minute', n: 15, aggregate: false };
    case '30m':
      return { kind: 'minute', n: 30, aggregate: false };
    case '1H':
      return { kind: 'minute', n: 60, aggregate: false };
    case '2H':
    case '4H':
    case '6H':
    case '8H':
    case '12H':
      return { kind: 'minute', n: 60, aggregate: true };
    case '1D':
      return { kind: 'daily', p: 'day', aggregate: false };
    case '3D':
      return { kind: 'daily', p: 'day', aggregate: true };
    case '1W':
      return { kind: 'daily', p: 'week', aggregate: false };
    case '1M':
      return { kind: 'daily', p: 'month', aggregate: false };
    default:
      return { kind: 'none' };
  }
}

/** 日线时间戳 "2026-09-21"；分钟线 "202609241120"。
 *  均按交易所本地墙上时间解析（A股/港股=北京时间），与坐标轴的本地时间格式化一致。 */
function parseBarTime(s: string): number {
  if (s.length === 10) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const h = Number(s.slice(8, 10));
  const mi = Number(s.slice(10, 12));
  return new Date(y, mo - 1, d, h, mi).getTime();
}

/** 报价时间有两种格式："20260924114444"（A股）与 "2026-09-23 16:08:05"（港股/美股） */
function parseQuoteTime(s: string): number {
  if (!s) return Date.now();
  const t = s.includes('-') ? new Date(s.replace(' ', 'T')).getTime() : parseBarTime(s);
  return Number.isFinite(t) ? t : Date.now();
}

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 腾讯报价字段（按 ~ 分割，0 起）：
 * 1 名称 · 2 代码 · 3 现价 · 4 昨收 · 5 今开 · 6 成交量 · 30 时间 · 31 涨跌额 · 32 涨跌幅 · 33 最高 · 34 最低
 * 37 成交额仅 A股/指数语义一致（万元），港股美股该位是别的字段，不取。
 */
function toQuote(id: string, f: string[], withAmount: boolean): Quote | null {
  const price = num(f[3]);
  if (price === 0) return null;
  return {
    id,
    price,
    prevClose: num(f[4]),
    open: num(f[5]),
    volume: num(f[6]),
    time: parseQuoteTime(f[30]),
    change: num(f[31]),
    changePct: num(f[32]),
    high: num(f[33]),
    low: num(f[34]),
    amount: withAmount ? num(f[37]) * 10_000 : 0,
  };
}

interface KlineResp {
  code: number;
  msg: string;
  data: Record<string, Record<string, unknown>>;
}

/** 日/周/月的数组键名随复权方式变化（qfqday / day），按后缀匹配 */
function pickSeries(node: Record<string, unknown>, period: string): unknown[][] {
  for (const key of [`qfq${period}`, period, `hfq${period}`]) {
    const v = node[key];
    if (Array.isArray(v) && v.length > 0) return v as unknown[][];
  }
  for (const [key, v] of Object.entries(node)) {
    if (Array.isArray(v) && v.length > 0 && key.endsWith(period)) return v as unknown[][];
  }
  return [];
}

/** 本地日期 → 接口日期参数 YYYY-MM-DD */
function toDateParam(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type ActivePlan = Exclude<ReturnType<typeof planFor>, { kind: 'none' }>;

/** 拉一段 K 线。endDate 给定时取该日（含）之前的 count 根，用于向左翻页。
 *  日线参数位：品种,周期,起,止,条数,复权；分钟线只支持 品种,周期,空,条数。 */
async function fetchSeries(sym: string, plan: ActivePlan, count: number, endDate?: string): Promise<Bar[]> {
  const url =
    plan.kind === 'minute'
      ? `${MINUTE_URL}?param=${encodeURIComponent(`${sym},m${plan.n},,${count}`)}`
      : `${DAILY_URL}?param=${encodeURIComponent(`${sym},${plan.p},,${endDate ?? ''},${count},qfq`)}`;

  const resp = await fetchJson<KlineResp>(url);
  const node = resp.data?.[sym];
  if (resp.code !== 0 || !node) return [];
  const rows = pickSeries(node, plan.kind === 'minute' ? `m${plan.n}` : plan.p);

  // 行格式：[时间, 开, 收, 高, 低, 量]（腾讯把收盘放在第 3 位）
  return rows.map((r) => ({
    time: parseBarTime(String(r[0])),
    open: num(String(r[1])),
    high: num(String(r[3])),
    low: num(String(r[4])),
    close: num(String(r[2])),
    volume: num(String(r[5])),
  }));
}

export const tencentSource: MarketSource = {
  name: '腾讯财经',
  markets: SUPPORTED,

  async quotes(instruments) {
    const pairs = instruments
      .map((i) => ({ id: i.id, sym: tencentSymbol(i), cn: i.market.startsWith('cn-') }))
      .filter((p): p is { id: string; sym: string; cn: boolean } => p.sym !== null);
    if (pairs.length === 0) return [];

    const out: Quote[] = [];
    // 单次 URL 过长会被截断，分批
    const BATCH = 50;
    for (let i = 0; i < pairs.length; i += BATCH) {
      const chunk = pairs.slice(i, i + BATCH);
      const text = await fetchGbk(QUOTE_URL + chunk.map((c) => c.sym).join(','));
      const payload = parseTencentPayload(text);
      for (const c of chunk) {
        const fields = payload.get(c.sym);
        if (!fields) continue;
        const q = toQuote(c.id, fields, c.cn);
        if (q) out.push(q);
      }
    }
    return out;
  },

  async bars({ instrument, timeframe, limit }: BarsRequest): Promise<Bar[]> {
    const sym = symbolOf(instrument, true);
    if (!sym) throw new NoHistoryError(instrument, timeframe);
    const plan = planFor(timeframe);
    if (plan.kind === 'none') throw new NoHistoryError(instrument, timeframe);

    // 需要聚合时多取基础数据，保证聚合后仍够 limit 根
    const tf = getTimeframe(timeframe);
    const baseSeconds = plan.kind === 'minute' ? plan.n * 60 : 86_400;
    const ratio = plan.aggregate && tf.seconds > 0 ? Math.ceil(tf.seconds / baseSeconds) : 1;
    const count = Math.min(800, Math.max(limit, limit * ratio));

    const bars = await fetchSeries(sym, plan, count);
    if (bars.length === 0) throw new NoHistoryError(instrument, timeframe);

    if (!plan.aggregate) return bars.slice(-limit);
    return aggregateBars(bars, tf).slice(-limit);
  },

  /** 向左翻页：日线族用日期区间取终点之前的 count 根。
   *  分钟线的区间参数实测不可靠，不支持翻页。 */
  async barsBefore({ instrument, timeframe, limit, before }): Promise<Bar[]> {
    const sym = symbolOf(instrument, true);
    if (!sym) return [];
    const plan = planFor(timeframe);
    if (plan.kind !== 'daily') return [];

    const tf = getTimeframe(timeframe);
    const ratio = plan.aggregate ? Math.max(1, Math.ceil(tf.seconds / 86_400)) : 1;
    const bars = await fetchSeries(sym, plan, Math.min(800, limit * ratio), toDateParam(before - 86_400_000));
    if (bars.length === 0) return [];
    return plan.aggregate ? aggregateBars(bars, tf) : bars;
  },
};
