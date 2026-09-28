import type { MarketId } from '@/types/instrument';

/** 交易时段表（TV 图例 market status 圆点用）。
 *  时间口径：**浏览器本地时间**（与 TV 帮助中心「Exchange 时区」不同的简化口径，
 *  复刻范围以本地时间判定开/闭市，精确到交易所时区属后续增强）。
 *  单位：当日分钟数（0-1439），支持午休分段。 */

type Sessions = Array<[number, number]>;

const A_SHARE: Sessions = [
  [570, 690], // 09:30-11:30
  [780, 900], // 13:00-15:00
];
const HK: Sessions = [
  [570, 720], // 09:30-12:00
  [780, 960], // 13:00-16:00
];
const US: Sessions = [[570, 960]]; // 09:30-16:00
const CN_FUT_DAY: Sessions = [
  [540, 690], // 09:00-11:30
  [810, 900], // 13:30-15:00（日盘；夜盘因品种而异，未列入）
];

const MARKET_SESSIONS: Record<MarketId, Sessions | 'crypto' | 'weekday24h'> = {
  'cn-sh': A_SHARE,
  'cn-sz': A_SHARE,
  'cn-bj': A_SHARE,
  hk: HK,
  'us-nasdaq': US,
  'us-nyse': US,
  'us-amex': US,
  'cn-index': A_SHARE,
  'cn-fut': CN_FUT_DAY,
  'global-fut': 'weekday24h', // 外盘期货近乎全天，周末休市
  crypto: 'crypto', // 7×24
};

/** 当前是否开市。时段按浏览器本地时间；周末 A股/港股/美股/国内期货闭市。 */
export function isMarketOpen(market: MarketId, now: Date = new Date()): boolean {
  const sessions = MARKET_SESSIONS[market];
  if (sessions === 'crypto') return true;
  const day = now.getDay();
  if (sessions === 'weekday24h') return day !== 0 && day !== 6;
  if (day === 0 || day === 6) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return sessions.some(([open, close]) => mins >= open && mins < close);
}
