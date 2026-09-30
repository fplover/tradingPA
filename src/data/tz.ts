/** 日历桶（周/月/日）归桶时区口径。
 *
 *  背景：bar 时间戳的语义由数据源决定——
 *  - crypto（Binance）：真 UTC 时间戳，周 K 线关闭于周一 00:00 UTC → 按 UTC 归桶；
 *  - 其余市场（腾讯/新浪/东财）：源返回交易所本地墙上时间，解析层按浏览器本地时间
 *    构造 Date（见 sources 解析注释）→ 按本地时区归桶才与时间戳语义一致。
 *  历史上 aggregate.ts 按 UTC 归桶而 liveBar.ts 按本地归桶，UTC+8 下本地周一的日 K
 *  会被归入上一周，且聚合周 K 的时间戳与报价对齐永不相等（末柱无法更新）。本模块
 *  统一口径：调用方按市场取偏移，传入纯函数层（aggregate/liveBar/countdown）。 */

/** 浏览器本地时区偏移（分钟，东为正；与 Date#getTimezoneOffset 取负） */
export function localTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/** 市场 → 日历桶时区偏移（分钟）。crypto 走 UTC（交易所口径），其余走本地。 */
export function calendarTzOffsetMinutes(market: 'crypto' | string): number {
  return market === 'crypto' ? 0 : localTzOffsetMinutes();
}
