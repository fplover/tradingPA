import type { Bar } from '@/types/market';
import type { Timeframe } from '@/types/market';

const MS = 1000;
const MS_PER_DAY = 86_400_000;

/** 是否多日周期（1D / 3D / 自定义 N 日）：seconds 为日的整数倍且无日历类型。
 *  秒级/小时档（含 45m、3H 等不整除一天的周期）不在此列——它们保持纪元对齐。 */
export function isMultiDayTimeframe(tf: Timeframe): boolean {
  return tf.calendar === undefined && tf.seconds > 0 && tf.seconds % 86_400 === 0;
}

/** 多日周期桶起点：先按 tzOffsetMinutes 时区取当地日历日，再按天数向下取整到 N 日边界。
 *  返回真纪元毫秒（UTC+8 下即本地 00:00，与源返回的日 K 时间戳逐位相等）。
 *  tz=0 时退化为纪元对齐，与秒级/小时档口径一致——crypto / mock 路径零行为变化。
 *  导出供 liveBar.alignBarTime 复用：两处必须同源，否则聚合出的桶时间戳与报价对齐值
 *  永不相等（末柱被静默丢弃或错插新柱；周/月历史上就因口径分裂踩过，见 data/tz.ts）。 */
export function dayBucketStart(time: number, tf: Timeframe, tzOffsetMinutes: number): number {
  const days = Math.max(1, Math.round((tf.seconds * MS) / MS_PER_DAY));
  const localDay = Math.floor((time + tzOffsetMinutes * 60_000) / MS_PER_DAY);
  return Math.floor(localDay / days) * days * MS_PER_DAY - tzOffsetMinutes * 60_000;
}

/** 桶起点：秒级/小时档（不整除一天的周期）用纪元对齐；多日档（1D/3D/自定义 N 日）
 *  与周/月按 tzOffsetMinutes 时区的自然日/周/月归桶（默认 0 = UTC，crypto 口径；
 *  CN 源传本地偏移——其 bar 时间戳是交易所本地墙上时间，见 data/tz.ts 与各源解析注释）。
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
  if (isMultiDayTimeframe(tf)) return dayBucketStart(time, tf, tzOffsetMinutes);
  const sec = Math.floor(time / MS / tf.seconds) * tf.seconds;
  return sec * MS;
}

/**
 * 将细周期基础 K 线聚合为粗周期。
 * 输入必须按时间升序；通常以 1m 为基础数据向上聚合。
 * tzOffsetMinutes 影响多日档（1D/3D/自定义 N 日）与周/月日历桶：秒级/小时档
 * （不整除一天的周期）为纪元对齐，与时区无关。
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
