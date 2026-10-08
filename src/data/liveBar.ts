import type { Bar, Timeframe } from '@/types/market';
import type { Quote } from './sources/types';
import { dayBucketStart, isMultiDayTimeframe } from '@/data/aggregate';

/**
 * 用实时报价维护最后一根 K 线。
 * 多数免费源的历史 K 线不含当日未收盘的那根（新浪期货日 K 就滞后一天），
 * 报价轮询补齐后图表右端才是「活的」。
 */

/** 报价时间对齐到所属 K 线的开盘时间。
 *  多日档（1D/3D/自定义 N 日）与周/月按 tzOffsetMinutes 时区的日历对齐（与各源返回的
 *  bar 时间戳语义一致：crypto=UTC，CN 源=交易所本地墙上时间），秒级/小时档按绝对时间
 *  取整（与时区无关）。
 *  多日档复用 aggregate.dayBucketStart：聚合桶起点与报价对齐值必须同源，否则末柱时间戳
 *  永不相等、报价被静默丢弃或错插新柱（tz 分裂修复，见 data/tz.ts）。 */
export function alignBarTime(time: number, tf: Timeframe, tzOffsetMinutes = 0): number {
  const t = time + tzOffsetMinutes * 60_000;
  const d = new Date(t);
  if (tf.calendar === 'week') {
    const dow = (d.getUTCDay() + 6) % 7; // 周一 = 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) - tzOffsetMinutes * 60_000;
  }
  if (tf.calendar === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - tzOffsetMinutes * 60_000;
  if (isMultiDayTimeframe(tf)) return dayBucketStart(time, tf, tzOffsetMinutes);
  const ms = Math.max(tf.seconds, 1) * 1000;
  return Math.floor(time / ms) * ms;
}

/** 忽略 0（源未提供该字段），取正数最小值 */
function minPos(...vals: number[]): number {
  let out = Infinity;
  for (const v of vals) if (v > 0 && v < out) out = v;
  return Number.isFinite(out) ? out : 0;
}

function maxPos(...vals: number[]): number {
  let out = 0;
  for (const v of vals) if (v > out) out = v;
  return out;
}

/** 返回新数组；报价与末柱完全一致时返回原引用，避免无意义的重渲染。
 *  tzOffsetMinutes 透传 alignBarTime（日/周/月对齐口径，见 data/tz.ts）。 */
export function applyQuote(bars: Bar[], quote: Quote, tf: Timeframe, tzOffsetMinutes = 0): Bar[] {
  if (bars.length === 0 || !(quote.price > 0)) return bars;
  const last = bars[bars.length - 1];
  const t = alignBarTime(quote.time, tf, tzOffsetMinutes);
  // 报价里的 open/high/low/volume 是「当日」口径，只有日线及以上能直接套用；
  // 分钟柱若套用会把整日振幅画成一根巨柱。
  const dailyOrCoarser = tf.calendar !== undefined || tf.seconds >= 86_400;

  if (t === last.time) {
    const high = dailyOrCoarser ? maxPos(last.high, quote.high, quote.price) : Math.max(last.high, quote.price);
    const low = dailyOrCoarser
      ? minPos(last.low > 0 ? last.low : Infinity, quote.low, quote.price)
      : minPos(last.low > 0 ? last.low : Infinity, quote.price);
    const volume = dailyOrCoarser && quote.volume > 0 ? quote.volume : last.volume;
    if (last.close === quote.price && high === last.high && low === last.low && volume === last.volume) {
      return bars;
    }
    return [...bars.slice(0, -1), { ...last, high, low, close: quote.price, volume }];
  }

  if (t > last.time) {
    const open = dailyOrCoarser && quote.open > 0 ? quote.open : last.close;
    const high = dailyOrCoarser ? maxPos(open, quote.high, quote.price) : Math.max(open, quote.price);
    const low = dailyOrCoarser
      ? minPos(open > 0 ? open : Infinity, quote.low, quote.price)
      : minPos(open > 0 ? open : Infinity, quote.price);
    return [
      ...bars,
      {
        time: t,
        open,
        high,
        low,
        close: quote.price,
        volume: dailyOrCoarser ? quote.volume : 0,
      },
    ];
  }

  return bars;
}
