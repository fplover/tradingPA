import type { Bar, TimeframeId } from '@/types/market';
import { getTimeframe } from '@/types/market';
import { customIntervalMinutes } from '@/features/market/customInterval';
import type { Instrument } from '@/types/instrument';
import { aggregateBars } from '@/data/aggregate';
import { localTzOffsetMinutes } from '@/data/tz';
import { fetchVarJsonp } from './http';
import { NoHistoryError, type BarsRequest, type MarketSource } from './types';

/**
 * 新浪财经：国内期货 / 外盘期货 / 美股 的历史 K 线。
 * 三组接口同为 jsonp.php / jsonp_v2.php 形态——回调「变量名」嵌在 URL 路径里，
 * 经 script 标签执行赋值，不受 CORS 与 Referer 限制，开发与生产（GitHub Pages）均可直连，
 * 无需 dev server 代理（2026-10-08 实测：相关端点不带 Referer 也返回数据）。
 *
 * 数据量：分钟线固定回 1023 根（1m≈2 个交易日，60m≈2 个月）；日线回上市以来全部。
 * 外盘期货成交量字段常年为 0（新浪不提供），成交量副图对外盘为空属数据源边界。
 */

const INNER_JSONP = 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/{cb}/InnerFuturesNewService';
const GLOBAL_DAILY_JSONP =
  'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/{cb}/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=';
const GLOBAL_MIN_JSONP = 'https://gu.sina.cn/ft/api/jsonp.php/{cb}/GlobalService.getMinK?symbol=';
const US_JSONP = 'https://stock.finance.sina.com.cn/usstock/api/jsonp_v2.php/{cb}/US_MinKService';

/** 内盘期货：东财主连「rbm」→ 新浪「RB0」；合约代码恒以数字结尾，M 结尾即主连 */
function innerSinaSymbol(inst: Instrument): string {
  const code = inst.code.toUpperCase();
  return code.endsWith('M') ? `${code.slice(0, -1)}0` : code;
}

/** 外盘期货期货月份代码 → 月序号（F=1 … Z=12，跳过不用字母） */
const MONTH_LETTER: Record<string, string> = {
  F: '01', G: '02', H: '03', J: '04', K: '05', M: '06',
  N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12',
};

/**
 * 东财外盘代码 → 新浪外盘代码。
 * 主连 GC00Y → GC；字母月合约 HG27F → HG2701（实测两形态均可用）；
 * 新浪原生数字月合约（CL2612）原样透传。识别不了的代码返回 null（调用方报无数据）。
 */
export function globalSinaSymbol(code: string): string | null {
  const c = code.toUpperCase();
  const main = /^([A-Z]+)00Y$/.exec(c);
  if (main) return main[1];
  const contract = /^([A-Z]+)(\d{2})([FGHJKMNQUVXZ])$/.exec(c);
  if (contract) return `${contract[1]}${contract[2]}${MONTH_LETTER[contract[3]]}`;
  if (/^[A-Z]+\d{3,4}$/.test(c)) return c;
  return null;
}

/** 各市场的 K 线 URL（{cb} 为回调变量名占位，由 fetchVarJsonp 替换）。导出供单测。 */
export function innerUrl(kind: 'daily' | 'minute', symbol: string, type: number): string {
  return kind === 'daily'
    ? `${INNER_JSONP}.getDailyKLine?symbol=${symbol}`
    : `${INNER_JSONP}.getFewMinLine?symbol=${symbol}&type=${type}`;
}

export function usUrl(kind: 'daily' | 'minute', symbol: string, type: number): string {
  return kind === 'daily'
    ? `${US_JSONP}.getDailyK?symbol=${symbol}`
    : `${US_JSONP}.getMinK?symbol=${symbol}&type=${type}`;
}

export function globalDailyUrl(symbol: string): string {
  return `${GLOBAL_DAILY_JSONP}${symbol}`;
}

export function globalMinuteUrl(symbol: string, type: number): string {
  return `${GLOBAL_MIN_JSONP}${symbol}&type=${type}`;
}

interface SinaBar {
  d: string;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

type ActivePlan = { kind: 'minute'; type: number } | { kind: 'daily' };
type Plan = ActivePlan | { kind: 'none' };

/** 自定义周期 → 可整除的最大基础分钟周期（分钟线仅支持 1/5/15/30/60）；
 *  >30 分钟且 [30,15,5] 无一整除时放弃：1m 基期的拉取比过大，收益不抵成本 */
function customMinutePlan(minutes: number): Plan {
  for (const n of [30, 15, 5]) {
    if (minutes % n === 0) return { kind: 'minute', type: n };
  }
  return minutes <= 30 ? { kind: 'minute', type: 1 } : { kind: 'none' };
}

/** 分钟线只支持 1/5/15/30/60；其余周期取更细的基础数据本地聚合（bars() 内 aggregateBars）。
 *  导出供单测：自定义周期归一化是沉默逻辑错误高发区，必须钉住。 */
export function planFor(tf: TimeframeId): Plan {
  const customMinutes = customIntervalMinutes(tf);
  if (customMinutes !== null) return customMinutePlan(customMinutes);
  switch (tf) {
    case '1m':
      return { kind: 'minute', type: 1 };
    case '2m':
      return { kind: 'minute', type: 1 };
    case '3m':
      return { kind: 'minute', type: 1 };
    case '5m':
      return { kind: 'minute', type: 5 };
    case '15m':
      return { kind: 'minute', type: 15 };
    case '30m':
      return { kind: 'minute', type: 30 };
    case '45m':
      return { kind: 'minute', type: 15 };
    case '1H':
    case '2H':
    case '3H':
    case '4H':
    case '6H':
    case '8H':
    case '12H':
      return { kind: 'minute', type: 60 };
    case '1D':
    case '3D':
    case '1W':
    case '1M':
      return { kind: 'daily' };
    default:
      return { kind: 'none' };
  }
}

/** 日 K "2009-03-27"；分钟 K "2026-09-03 14:35:00"。
 *  按交易所本地墙上时间解析（期货=北京时间，美股=美东时间），与坐标轴的本地时间格式化一致。 */
function parseTime(s: string): number {
  const date = s.slice(0, 10).split('-').map(Number);
  if (s.length <= 10) return new Date(date[0], date[1] - 1, date[2]).getTime();
  const t = s.slice(11).split(':').map(Number);
  return new Date(date[0], date[1] - 1, date[2], t[0] || 0, t[1] || 0, t[2] || 0).getTime();
}

/**
 * 归一化三类响应负载（var JSONP 的赋值结果）为统一行格式。
 * 内盘/美股分钟与外盘分钟用 {d,o,h,l,c,v}；外盘日线用 {date,open,high,low,close,volume}——两形态按字段名兼容。
 * 服务端错误（null / {__ERROR:…}）与脏行一律过滤为空数组，调用方以空判定无数据。
 */
export function unwrapBars(data: unknown): SinaBar[] {
  if (!Array.isArray(data)) return [];
  const out: SinaBar[] = [];
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const d = r.d ?? r.date;
    const o = r.o ?? r.open;
    const h = r.h ?? r.high;
    const l = r.l ?? r.low;
    const c = r.c ?? r.close;
    const v = r.v ?? r.volume;
    if (typeof d !== 'string' || typeof o !== 'string' || typeof h !== 'string') continue;
    if (typeof l !== 'string' || typeof c !== 'string') continue;
    out.push({ d, o, h, l, c, v: typeof v === 'string' ? v : '0' });
  }
  return out;
}

/** 品种 + 周期 → 请求 URL。市场不归本源或代码映射失败返回 null。 */
function serviceFor(inst: Instrument, plan: ActivePlan): string | null {
  if (inst.market === 'cn-fut') {
    return innerUrl(plan.kind, innerSinaSymbol(inst), plan.kind === 'minute' ? plan.type : 0);
  }
  if (inst.market === 'global-fut') {
    const sym = globalSinaSymbol(inst.code);
    if (!sym) return null;
    return plan.kind === 'daily' ? globalDailyUrl(sym) : globalMinuteUrl(sym, plan.type);
  }
  if (inst.market.startsWith('us-')) {
    return usUrl(plan.kind, inst.code.toUpperCase(), plan.kind === 'minute' ? plan.type : 0);
  }
  return null;
}

export const sinaSource: MarketSource = {
  name: '新浪财经',
  markets: ['cn-fut', 'global-fut', 'us-nasdaq', 'us-nyse', 'us-amex'],

  async bars({ instrument, timeframe }: BarsRequest): Promise<Bar[]> {
    const plan = planFor(timeframe);
    if (plan.kind === 'none') throw new NoHistoryError(instrument, timeframe);
    const url = serviceFor(instrument, plan);
    if (!url) throw new NoHistoryError(instrument, timeframe);

    const payload = await fetchVarJsonp<unknown>(url, 15_000);
    const rows = unwrapBars(payload);
    if (rows.length === 0) throw new NoHistoryError(instrument, timeframe);

    const bars: Bar[] = rows.map((r) => ({
      time: parseTime(r.d),
      open: Number(r.o),
      high: Number(r.h),
      low: Number(r.l),
      close: Number(r.c),
      volume: Number(r.v) || 0,
    }));

    const tf = getTimeframe(timeframe);
    const baseSeconds = plan.kind === 'daily' ? 86_400 : plan.type * 60;
    // 分钟线固定 1023 根、日线给全历史，均无需向左翻页
    if (tf.calendar === undefined && tf.seconds <= baseSeconds) return bars;
    return aggregateBars(bars, tf, localTzOffsetMinutes());
  },

  async barsBefore(): Promise<Bar[]> {
    return [];
  },
};
