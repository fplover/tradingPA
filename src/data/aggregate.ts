import type { Bar } from '@/types/market';
import type { Timeframe } from '@/types/market';

const MS = 1000;

/** 桶起点：秒级用纪元对齐；周对齐到周一；月按自然月 */
function bucketStart(time: number, tf: Timeframe): number {
  if (tf.calendar === 'week') {
    const d = new Date(time);
    const day = (d.getUTCDay() + 6) % 7; // 周一 = 0
    // 毫秒尾数一并归零：否则带亚秒时间戳的输入会产出未对齐的桶起点
    return (
      time -
      day * 86_400_000 -
      (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * MS -
      d.getUTCMilliseconds()
    );
  }
  if (tf.calendar === 'month') {
    const d = new Date(time);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  const sec = Math.floor(time / MS / tf.seconds) * tf.seconds;
  return sec * MS;
}

/**
 * 将细周期基础 K 线聚合为粗周期。
 * 输入必须按时间升序；通常以 1m 为基础数据向上聚合。
 */
export function aggregateBars(base: Bar[], tf: Timeframe): Bar[] {
  if (base.length === 0) return [];
  const out: Bar[] = [];
  let bucketTime = -1;
  let cur: Bar | null = null;
  for (const bar of base) {
    const b = bucketStart(bar.time, tf);
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
