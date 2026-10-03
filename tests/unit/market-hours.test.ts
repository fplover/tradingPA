import { describe, expect, it } from 'vitest';
import { isMarketOpen } from '@/data/marketHours';
import type { MarketId } from '@/types/instrument';

/** 市场状态判定：时段按浏览器本地时间；A股/港股/美股/国内期货周末闭市 */

// 2024-03-05 是周二
const tue = (h: number, m = 0) => new Date(2024, 2, 5, h, m);
const sat = (h: number, m = 0) => new Date(2024, 2, 9, h, m);
const sun = (h: number, m = 0) => new Date(2024, 2, 10, h, m);

describe('isMarketOpen', () => {
  it('A股：交易时段内开市，午休/盘前/盘后闭市', () => {
    expect(isMarketOpen('cn-sh', tue(9, 30))).toBe(true);
    expect(isMarketOpen('cn-sh', tue(11, 29))).toBe(true);
    expect(isMarketOpen('cn-sh', tue(11, 30))).toBe(false); // 午休开始（右开区间）
    expect(isMarketOpen('cn-sh', tue(12, 30))).toBe(false); // 午休中
    expect(isMarketOpen('cn-sh', tue(13, 0))).toBe(true);
    expect(isMarketOpen('cn-sh', tue(14, 59))).toBe(true);
    expect(isMarketOpen('cn-sh', tue(15, 0))).toBe(false); // 收盘
    expect(isMarketOpen('cn-sh', tue(9, 29))).toBe(false); // 盘前
  });

  it('A股周末闭市', () => {
    expect(isMarketOpen('cn-sh', sat(10, 0))).toBe(false);
    expect(isMarketOpen('cn-sh', sun(10, 0))).toBe(false);
  });

  it('港股：含 12:00-13:00 午休与 16:00 收盘', () => {
    expect(isMarketOpen('hk', tue(9, 30))).toBe(true);
    expect(isMarketOpen('hk', tue(12, 0))).toBe(false);
    expect(isMarketOpen('hk', tue(13, 0))).toBe(true);
    expect(isMarketOpen('hk', tue(15, 59))).toBe(true);
    expect(isMarketOpen('hk', tue(16, 0))).toBe(false);
  });

  it('美股：单段 09:30-16:00（本地时间口径）', () => {
    expect(isMarketOpen('us-nasdaq', tue(9, 30))).toBe(true);
    expect(isMarketOpen('us-nasdaq', tue(15, 59))).toBe(true);
    expect(isMarketOpen('us-nasdaq', tue(16, 0))).toBe(false);
    expect(isMarketOpen('us-nasdaq', sat(10, 0))).toBe(false);
  });

  it('国内期货：日盘 09:00-11:30 / 13:30-15:00', () => {
    expect(isMarketOpen('cn-fut', tue(9, 0))).toBe(true);
    expect(isMarketOpen('cn-fut', tue(11, 30))).toBe(false);
    expect(isMarketOpen('cn-fut', tue(13, 30))).toBe(true);
    expect(isMarketOpen('cn-fut', tue(15, 0))).toBe(false);
  });

  it('加密货币 7×24 全天开市', () => {
    for (const d of [tue(3, 0), sat(3, 0), sun(23, 59)]) {
      expect(isMarketOpen('crypto', d)).toBe(true);
    }
  });

  it('外盘期货：工作日全天，周末闭市', () => {
    expect(isMarketOpen('global-fut', tue(2, 0))).toBe(true);
    expect(isMarketOpen('global-fut', sat(2, 0))).toBe(false);
    expect(isMarketOpen('global-fut', sun(2, 0))).toBe(false);
  });

  it('全部市场均有定义', () => {
    const markets: MarketId[] = [
      'cn-sh',
      'cn-sz',
      'cn-bj',
      'hk',
      'us-nasdaq',
      'us-nyse',
      'us-amex',
      'cn-index',
      'cn-fut',
      'global-fut',
      'crypto',
    ];
    for (const m of markets) {
      expect(typeof isMarketOpen(m, tue(10, 0))).toBe('boolean');
    }
  });
});
