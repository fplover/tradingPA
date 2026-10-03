import type { Timeframe } from '@/types/market';

/**
 * K 线收盘倒计时（TV 对齐：价格轴右端、最新价徽章旁的 mm:ss 实时递减）。
 *
 * 对齐约定与 data/aggregate.ts 的 bucketStart 保持一致（时区口径见 data/tz.ts）：
 * - 秒级周期（seconds > 0）：纪元对齐 floor(lastBarTime / interval) * interval（与时区无关）；
 * - 周/月：按 tzOffsetMinutes 时区的自然周/月归桶（默认 0 = UTC，crypto 口径；
 *   CN 市场由 ChartController.setCalendarTzOffset 下发本地偏移）。
 * 本模块不自行起定时器：由渲染循环（rAF 合帧）按秒采样，见 CloseCountdown.needsRedraw。
 */

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** 当前 bar 的收盘时刻：纪元对齐 floor(lastBarTime/interval)*interval + interval。
 *  intervalMs ≤ 0 / 非有限值等非法入参返回 NaN（调用方按「停用」处理）。 */
export function nextCloseTime(intervalMs: number, lastBarTime: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(lastBarTime)) return Number.NaN;
  return Math.floor(lastBarTime / intervalMs) * intervalMs + intervalMs;
}

/** 周桶起点：按 tzOffsetMinutes 时区的本周一 00:00（与 aggregate.ts 周分桶同一公式） */
function weekBucketStart(time: number, tzOffsetMinutes: number): number {
  const d = new Date(time + tzOffsetMinutes * 60_000);
  const day = (d.getUTCDay() + 6) % 7; // 周一 = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) - tzOffsetMinutes * 60_000;
}

/** 日历周期（周/月）的收盘时刻：下周周一 / 下月 1 日，按 tzOffsetMinutes 时区的 00:00 */
export function nextCalendarClose(kind: 'week' | 'month', lastBarTime: number, tzOffsetMinutes = 0): number {
  if (!Number.isFinite(lastBarTime)) return Number.NaN;
  if (kind === 'week') return weekBucketStart(lastBarTime, tzOffsetMinutes) + MS_PER_WEEK;
  const d = new Date(lastBarTime + tzOffsetMinutes * 60_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - tzOffsetMinutes * 60_000; // 月份溢出自动进位到次年
}

/** 倒计时文本：mm:ss；≥1h 为 h:mm:ss（与 TV 一致）。
 *  秒数取 ceil——每个可见值恰好显示 1 秒，收盘前最后一帧是 0:01 而非停留 0:00。
 *  remainingMs ≤ 0 / 非有限值返回 '0:00'。 */
export function formatCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '0:00';
  const totalSec = Math.ceil(remainingMs / MS_PER_SECOND);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * 收盘倒计时状态：周期/末 bar 变化时重算收盘时刻，每帧由渲染循环采样。
 * 不持有任何定时器——唤醒完全借道既有 rAF 合帧（needsRedraw 秒级判断）。
 */
export class CloseCountdown {
  private tf: Timeframe | null = null;
  private lastBarTime = -1;
  private closeTime = Number.NaN;
  /** 日历桶时区偏移（分钟，东为正）：crypto=UTC，CN 市场=本地（见 data/tz.ts） */
  private tzOffsetMinutes = 0;
  /** 上一帧实际呈现的文本（null = 未显示），用于「内容变化才唤醒」比较 */
  private drawnText: string | null = null;
  private drawnSec = -1;

  /** 周期切换/图例初始化；tf 为 null 或非法（seconds ≤ 0 且无日历类型）时停用 */
  setTimeframe(tf: Timeframe | null): void {
    this.tf = tf;
    this.recompute();
  }

  /** 日历桶时区（分钟，东为正）：由市场决定（crypto=UTC / CN 源=本地），仅影响周/月收盘时刻 */
  setCalendarTzOffset(minutes: number): void {
    if (this.tzOffsetMinutes === minutes) return;
    this.tzOffsetMinutes = minutes;
    this.recompute();
  }

  /** 新 bar / 数据替换：time 为当前最后一根 bar 的开盘时间。
   *  ≤ 0 / 非有限值视为无数据（停用）；同值调用不重算（实时刷新同根 bar 的快速路径）。 */
  setLastBar(time: number): void {
    const t = Number.isFinite(time) && time > 0 ? time : -1;
    if (t === this.lastBarTime) return;
    this.lastBarTime = t;
    this.recompute();
  }

  /** 停用并清空（renderer 销毁路径调用） */
  reset(): void {
    this.tf = null;
    this.lastBarTime = -1;
    this.closeTime = Number.NaN;
    this.drawnText = null;
    this.drawnSec = -1;
  }

  /** 当前应显示的文本；不在「进行中的 bar」窗口（now < lastBarTime 或 now ≥ 收盘时刻）返回 null */
  textAt(now: number): string | null {
    if (!this.inWindow(now)) return null;
    return formatCountdown(this.closeTime - now);
  }

  /**
   * 渲染循环空闲帧查询：显示内容是否已变化、需要唤醒一帧。
   * 秒级精度——同一秒内不唤醒；窗口翻转（出现/消失）与周期重算立即唤醒。
   */
  needsRedraw(now: number): boolean {
    if (!this.inWindow(now)) return this.drawnText !== null;
    if (this.drawnText === null) return true;
    return Math.floor(now / MS_PER_SECOND) !== this.drawnSec;
  }

  /** 每帧采样：返回文本并标记为已呈现（供 draw 使用；null = 不显示） */
  sample(now: number): string | null {
    const text = this.textAt(now);
    this.drawnText = text;
    this.drawnSec = text === null ? -1 : Math.floor(now / MS_PER_SECOND);
    return text;
  }

  /** 仅当最后一根 bar 是「当前进行中的 bar」时显示：now ∈ [lastBarTime, closeTime) */
  private inWindow(now: number): boolean {
    return (
      this.tf !== null &&
      this.lastBarTime >= 0 &&
      Number.isFinite(this.closeTime) &&
      now >= this.lastBarTime &&
      now < this.closeTime
    );
  }

  private recompute(): void {
    const tf = this.tf;
    if (!tf || this.lastBarTime < 0) {
      this.closeTime = Number.NaN;
    } else if (tf.calendar === 'week') {
      this.closeTime = nextCalendarClose('week', this.lastBarTime, this.tzOffsetMinutes);
    } else if (tf.calendar === 'month') {
      this.closeTime = nextCalendarClose('month', this.lastBarTime, this.tzOffsetMinutes);
    } else if (tf.seconds > 0) {
      this.closeTime = nextCloseTime(tf.seconds * MS_PER_SECOND, this.lastBarTime);
    } else {
      this.closeTime = Number.NaN;
    }
    // 收盘时刻/停用状态变化后，已呈现文本作废（needsRedraw 据此立即唤醒一帧）
    this.drawnText = null;
    this.drawnSec = -1;
  }
}
