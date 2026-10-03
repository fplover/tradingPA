import type { Bar } from '@/types/market';

/**
 * 「左侧翻页前插」判定（第四轮审查修复后抽出为纯函数，便于单测）。
 *
 * 背景：数据层懒加载更早历史时，新数组是「更早一段 + 原序列」，此时应走
 * `prependBars` 以保持视口不跳回右边缘；其余情况必须整序列替换 `setData`。
 *
 * 修复前只判「旧首柱时间出现在新数组 index>0 处」。这条判据不成立的原因：
 * 所有序列共用对齐的时间栅格（1m 等），换品种时新序列的首柱时间**必然**也落在
 * 旧序列覆盖的区间内，于是命中前插分支，把两个标的的序列拼在一起；
 * 而 `BarSeries.prepend` 不去重，混入的时间戳一旦与已有 bar 撞车，
 * `fractionalIndexAt` 的 `iv = 0` 会算出 Infinity/NaN 坐标。
 *
 * 因此需要三个条件同时成立：
 *   ① 同标的同周期（seriesKey 相等）；
 *   ② 旧首柱时间出现在新数组 index > 0 处；
 *   ③ 自 `at` 起的后缀与旧序列**逐根时间一致**，且新数组确实更长
 *      （确属「前面接了一段」而非替换/裁剪）。
 */
export function isPurePrepend(
  prev: readonly Bar[],
  next: readonly Bar[],
  prevSeriesKey: string,
  nextSeriesKey: string,
): boolean {
  if (prev.length === 0 || prevSeriesKey !== nextSeriesKey) return false;
  const at = next.findIndex((b) => b.time === prev[0].time);
  if (at <= 0) return false;
  if (next.length < at + prev.length) return false;
  return prev.every((b, i) => next[at + i].time === b.time);
}

/** seriesKey：标识「同一标的同一周期」。Chart 的 props 为 symbol + interval。 */
export function seriesKey(symbol?: string, interval?: string): string {
  return `${symbol ?? ''}|${interval ?? ''}`;
}
