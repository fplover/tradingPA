import { describe, it, expect } from 'vitest';
import type { Bar } from '@/types/market';
import { getTimeframe } from '@/types/market';
import { aggregateBars } from '@/data/aggregate';
import { alignBarTime, applyQuote } from '@/data/liveBar';
import { calendarTzOffsetMinutes, localTzOffsetMinutes } from '@/data/tz';
import { CloseCountdown, formatCountdown, nextCalendarClose } from '@/engine/countdown';
import type { Quote } from '@/data/sources/types';

/** 时区分裂修复定向测试（tz 分裂 bug：aggregate UTC 归桶 vs liveBar 本地归桶）。
 *  全部用例用绝对时间（Date.UTC）构造，不依赖运行机器的本地时区。 */

const TZ8 = 480; // UTC+8，A股/港股/国内期货的交易所本地口径
/** UTC+8 交易所的本地周一 00:00（2024-01-01 是周一） */
const LOCAL_MON = Date.UTC(2023, 11, 31, 16);
/** UTC+8 本地日 K：一周七根，周一…周日 00:00 本地 */
function localWeekBars(): Bar[] {
  return Array.from({ length: 7 }, (_, i) => ({
    time: LOCAL_MON + i * 86_400_000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 1,
  }));
}

function quoteAt(time: number, price: number, volume = 10): Quote {
  return {
    id: 'cn-sh:600519',
    price,
    prevClose: 100,
    open: 100,
    volume,
    time,
    change: 0,
    changePct: 0,
    high: price,
    low: price,
    amount: 0,
  };
}

describe('日历桶时区：aggregateBars', () => {
  it('默认（tz=0）保持 UTC 归桶——crypto 口径不回退', () => {
    // 同一批 UTC+8 本地日 K：UTC 口径下周一（本地）那根落在上周日 UTC → 泄入上一周
    const w = aggregateBars(localWeekBars(), getTimeframe('1W'));
    expect(w.length).toBe(2);
    expect(w[0].time).toBe(Date.UTC(2023, 11, 25)); // 上一个 UTC 周一
    expect(w[0].volume).toBe(1); // 只有本地周一那一根泄漏进来
    expect(w[1].time).toBe(Date.UTC(2024, 0, 1)); // 正确的 UTC 周一
    expect(w[1].volume).toBe(6);
  });

  it('tz=+480：一周七根本地日 K 归入同一周桶，桶起点=本地周一 00:00（修复泄漏）', () => {
    const w = aggregateBars(localWeekBars(), getTimeframe('1W'), TZ8);
    expect(w.length).toBe(1);
    expect(w[0].time).toBe(LOCAL_MON);
    expect(w[0].open).toBe(100); // 周一 open
    expect(w[0].close).toBe(106.5); // 周日 close
    expect(w[0].high).toBe(107); // 周日 high
    expect(w[0].low).toBe(99); // 周一 low
    expect(w[0].volume).toBe(7);
  });

  it('tz=+480：月桶按本地自然月，跨月不并桶', () => {
    const bars: Bar[] = [
      { time: Date.UTC(2024, 0, 31, 16), open: 1, high: 1, low: 1, close: 1, volume: 1 }, // 2/1 本地
      { time: Date.UTC(2024, 1, 6, 16), open: 2, high: 2, low: 2, close: 2, volume: 1 }, // 2/7 本地
      { time: Date.UTC(2024, 1, 29, 16), open: 3, high: 3, low: 3, close: 3, volume: 1 }, // 3/1 本地
    ];
    const m = aggregateBars(bars, getTimeframe('1M'), TZ8);
    expect(m.length).toBe(2);
    expect(m[0].time).toBe(Date.UTC(2024, 0, 31, 16)); // 2/1 00:00 本地
    expect(m[0].volume).toBe(2);
    expect(m[1].time).toBe(Date.UTC(2024, 1, 29, 16)); // 3/1 00:00 本地
  });

  it('负时区（-300，美东）：桶起点随偏移平移', () => {
    // 2024-01-03 12:00 UTC = 美东 07:00（周三）→ 美东周一 = 2024-01-01 00:00-05:00
    const bars: Bar[] = [
      { time: Date.UTC(2024, 0, 3, 12), open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: Date.UTC(2024, 0, 4, 12), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];
    const w = aggregateBars(bars, getTimeframe('1W'), -300);
    expect(w.length).toBe(1);
    expect(w[0].time).toBe(Date.UTC(2024, 0, 1, 5));
  });

  it('亚秒时间戳在任意时区下桶起点毫秒归零', () => {
    const bars: Bar[] = [
      { time: LOCAL_MON + 12_345, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: LOCAL_MON + 86_400_000 - 1, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];
    const w = aggregateBars(bars, getTimeframe('1W'), TZ8);
    expect(w.length).toBe(1);
    expect(w[0].time % 1000).toBe(0);
    expect(w[0].time).toBe(LOCAL_MON);
  });

  it('秒级/小时档不受时区参数影响（纪元对齐）', () => {
    const bars: Bar[] = Array.from({ length: 120 }, (_, i) => ({
      time: Date.UTC(2024, 0, 1, 0, i),
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }));
    for (const tz of [0, TZ8, -300]) {
      const out = aggregateBars(bars, getTimeframe('2m'), tz);
      expect(out.length).toBe(60);
      expect(out[0].time).toBe(Date.UTC(2024, 0, 1, 0, 0));
    }
  });
});

describe('日历桶时区：alignBarTime', () => {
  it('默认（tz=0）周/月按 UTC、1D 按 UTC 午夜（crypto 口径）', () => {
    const t = Date.UTC(2024, 0, 3, 12); // 周三
    expect(alignBarTime(t, getTimeframe('1W'))).toBe(Date.UTC(2024, 0, 1));
    expect(alignBarTime(t, getTimeframe('1M'))).toBe(Date.UTC(2024, 0, 1));
    expect(alignBarTime(t, getTimeframe('1D'))).toBe(Date.UTC(2024, 0, 3));
  });

  it('tz=+480：周/月/日按本地日历', () => {
    const t = Date.UTC(2024, 0, 3, 12); // 周三 20:00 本地
    expect(alignBarTime(t, getTimeframe('1W'), TZ8)).toBe(LOCAL_MON);
    expect(alignBarTime(t, getTimeframe('1M'), TZ8)).toBe(Date.UTC(2023, 11, 31, 16)); // 1/1 本地
    expect(alignBarTime(t, getTimeframe('1D'), TZ8)).toBe(Date.UTC(2024, 0, 2, 16)); // 1/3 本地
  });
});

describe('日历桶时区：applyQuote 末柱合成', () => {
  it('CN 1W（tz=+480）：周三报价更新当前周 K 线（修复前被静默丢弃/错插新柱）', () => {
    const bars: Bar[] = [{ time: LOCAL_MON, open: 100, high: 101, low: 99, close: 100, volume: 5 }];
    const out = applyQuote(bars, quoteAt(Date.UTC(2024, 0, 3, 12), 105), getTimeframe('1W'), TZ8);
    expect(out.length).toBe(1);
    expect(out[0].close).toBe(105);
    expect(out[0].high).toBe(105);
  });

  it('CN 1W 旧口径（tz=0）复现 bug：报价对齐到 UTC 周一 → 错插第二根周 K', () => {
    const bars: Bar[] = [{ time: LOCAL_MON, open: 100, high: 101, low: 99, close: 100, volume: 5 }];
    const out = applyQuote(bars, quoteAt(Date.UTC(2024, 0, 3, 12), 105), getTimeframe('1W'));
    expect(out.length).toBe(2); // 错误地追加了一根
  });

  it('crypto 1D（tz=0）：日内报价更新当日 K 线（修复前本地午夜口径下被丢弃）', () => {
    const bars: Bar[] = [{ time: Date.UTC(2024, 0, 3), open: 100, high: 101, low: 99, close: 100, volume: 5 }];
    const out = applyQuote(bars, quoteAt(Date.UTC(2024, 0, 3, 12), 105), getTimeframe('1D'));
    expect(out.length).toBe(1);
    expect(out[0].close).toBe(105);
  });

  it('报价与末柱一致时返回原引用（无意义重渲染防线不回退）', () => {
    const bars: Bar[] = [{ time: LOCAL_MON, open: 100, high: 101, low: 99, close: 100, volume: 5 }];
    // 周 K 口径下 volume 取报价值，故报价 volume 也须一致才谈得上「完全一致」
    const out = applyQuote(bars, quoteAt(Date.UTC(2024, 0, 3, 12), 100, 5), getTimeframe('1W'), TZ8);
    expect(out).toBe(bars);
  });
});

describe('日历桶时区：nextCalendarClose / CloseCountdown', () => {
  it('默认 UTC 口径不变（crypto 倒计时不回退）', () => {
    const t = Date.UTC(2024, 0, 3, 12);
    expect(nextCalendarClose('week', t)).toBe(Date.UTC(2024, 0, 8));
    expect(nextCalendarClose('month', t)).toBe(Date.UTC(2024, 1, 1));
  });

  it('tz=+480：收盘时刻=下个本地周一 / 下月 1 日本地', () => {
    const t = Date.UTC(2024, 0, 3, 12);
    expect(nextCalendarClose('week', t, TZ8)).toBe(Date.UTC(2024, 0, 7, 16));
    expect(nextCalendarClose('month', t, TZ8)).toBe(Date.UTC(2024, 0, 31, 16));
  });

  it('CloseCountdown.setCalendarTzOffset 切换后倒计时按本地收盘时刻重算', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1W'));
    cd.setLastBar(LOCAL_MON);
    // 取两个窗口的交集内时刻：本地周二 04:00（UTC 口径下同属「进行中」的上一周）
    const now = Date.UTC(2023, 11, 31, 20);
    cd.setCalendarTzOffset(TZ8);
    expect(cd.textAt(now)).toBe(formatCountdown(Date.UTC(2024, 0, 7, 16) - now)); // 本地周一 00:00 起 167h
    cd.setCalendarTzOffset(0);
    expect(cd.textAt(now)).toBe(formatCountdown(Date.UTC(2024, 0, 1) - now)); // UTC 周一 00:00 止，剩 4h
    cd.reset();
    expect(cd.textAt(now)).toBeNull();
  });
});

describe('calendarTzOffsetMinutes / localTzOffsetMinutes', () => {
  it('crypto → 0（UTC），其余 → 本地偏移', () => {
    expect(calendarTzOffsetMinutes('crypto')).toBe(0);
    expect(calendarTzOffsetMinutes('cn-sh')).toBe(localTzOffsetMinutes());
    expect(calendarTzOffsetMinutes('us-nasdaq')).toBe(localTzOffsetMinutes());
  });

  it('localTzOffsetMinutes 与 Date#getTimezoneOffset 取负一致', () => {
    expect(localTzOffsetMinutes()).toBe(-new Date().getTimezoneOffset());
  });
});
