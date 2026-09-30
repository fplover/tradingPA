import type { Bar } from '@/types/market';
import type { Timeframe } from '@/types/market';

const MS = 1000;

/** 桶起点：秒级用纪元对齐；周/月按 tzOffsetMinutes 时区的自然周/月归桶
 *  （默认 0 = UTC，crypto 口径；CN 源传本地偏移——其 bar 时间戳是交易所本地
 *  墙上时间，见 data/tz.ts 与各源解析注释）。
 *  毫秒尾数一并归零：Date.UTC 构造即对齐，带亚秒时间戳的输入不会产出未对齐桶起点。 */
function bucketStart(time: number, tf: Timeframe, tzOffsetMinutes: number): number {
  if (tf.calendar === 'week' || tf.calendar === 'month') {
    const t = time + tzOffsetMinutes * 60_000;
    const d = new Date(t);
    const start =
      tf.calendar === 'week'
        ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // 周一 = 0
        : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return start - tzOffsetMinutes * 60_000;
  }
  const sec = Math.floor(time / MS / tf.seconds) * tf.seconds;
  return sec * MS;
}

/**
 * 将细周期基础 K 线聚合为粗周期。
 * 输入必须按时间升序；通常以 1m 为基础数据向上聚合。
 * tzOffsetMinutes 仅影响周/月日历桶（秒级/小时/日档为纪元对齐，与时区无关）。
 */
export function aggregateBars(base: Bar[], tf: Timeframe, tzOffsetMinutes = 0): Bar[] {
  if (base.length === 0) return [];
  const out: Bar[] = [];
  let bucketTime = -1;
  let cur: Bar | null = null;
  for (const bar of base) {
    const b = bucketStart(bar.time, tf, tzOffsetMinutes);
    if (b !== bucketTime || !cur) {
      if (cur) out.push(cur);
      bucketTime = b;
      cur = { time: b, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
    } else {
      cur.high = Math.max(cur.high, bar.high);
      cur.low = Math.min(cur.low, bar.low);
      cur.close = bar.close;
      cur.volume += bar.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 判断目标周期是否比基础周期更粗（是否需要聚合） */
export function needsAggregation(baseSeconds: number, tf: Timeframe): boolean {
  return tf.seconds > baseSeconds || tf.calendar !== undefined;
}
