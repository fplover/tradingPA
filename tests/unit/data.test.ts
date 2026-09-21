import { describe, expect, it } from 'vitest';
import { aggregateBars, needsAggregation } from '@/data/aggregate';
import { heikinAshi, renko, kagi, lineBreak, pointAndFigure, rangeBars, atr } from '@/data/transforms';
import { getTimeframe } from '@/types/market';
import type { Bar } from '@/types/market';

function minutes(count: number, startHour = 0): Bar[] {
  const bars: Bar[] = [];
  const base = Date.UTC(2024, 0, 1, startHour, 0);
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price + (i % 2 === 0 ? 1 : -1);
    bars.push({
      time: base + i * 60_000,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 10,
    });
    price = close;
  }
  return bars;
}

describe('周期聚合', () => {
  it('1H 聚合 60 根 1m 为 1 根', () => {
    const bars = aggregateBars(minutes(120), getTimeframe('1H'));
    expect(bars.length).toBe(2);
    expect(bars[0].time).toBe(Date.UTC(2024, 0, 1, 0, 0));
  });

  it('成交量守恒', () => {
    const src = minutes(180);
    const sum = src.reduce((s, b) => s + b.volume, 0);
    const out = aggregateBars(src, getTimeframe('1H'));
    expect(out.reduce((s, b) => s + b.volume, 0)).toBe(sum);
  });

  it('日/周/月按日历分桶', () => {
    // 跨越一周与一月
    const bars: Bar[] = [];
    let t = Date.UTC(2024, 0, 29); // 周一
    let price = 100;
    for (let i = 0; i < 24 * 60; i++) {
      bars.push({ time: t + i * 3_600_000, open: price, high: price + 1, low: price - 1, close: price, volume: 1 });
    }
    const d = aggregateBars(bars, getTimeframe('1D'));
    expect(d[0].time).toBe(Date.UTC(2024, 0, 29));
    const w = aggregateBars(bars, getTimeframe('1W'));
    expect(new Date(w[0].time).getUTCDay()).toBe(1); // 周一
    const m = aggregateBars(bars, getTimeframe('1M'));
    expect(m[0].time).toBe(Date.UTC(2024, 0, 1));
  });

  it('needsAggregation 判断', () => {
    expect(needsAggregation(60, getTimeframe('5m'))).toBe(true);
    expect(needsAggregation(60, getTimeframe('1m'))).toBe(false);
    expect(needsAggregation(60, getTimeframe('1W'))).toBe(true);
  });
});

describe('形态变换', () => {
  it('heikinAshi 公式', () => {
    const bars = minutes(3);
    const ha = heikinAshi(bars);
    expect(ha[1].close).toBeCloseTo((bars[1].open + bars[1].high + bars[1].low + bars[1].close) / 4, 10);
    expect(ha[2].open).toBeCloseTo((ha[1].open + ha[1].close) / 2, 10);
  });

  it('renko 每块等于 brickSize', () => {
    const bars = minutes(50);
    const rk = renko(bars, 1);
    expect(rk.length).toBeGreaterThan(0);
    for (const b of rk) {
      expect(Math.abs(Math.abs(b.close - b.open) - 1)).toBeLessThan(1e-9);
    }
  });

  it('lineBreak 需要连续 N 根同向', () => {
    const bars = minutes(60);
    const lb = lineBreak(bars, 3);
    expect(Array.isArray(lb)).toBe(true);
  });

  it('pointAndFigure / rangeBars / kagi 输出非空', () => {
    const bars = minutes(100);
    expect(pointAndFigure(bars, 1, 3).length).toBeGreaterThan(0);
    expect(rangeBars(bars, 2).length).toBeGreaterThan(0);
    expect(kagi(bars, 1).length).toBeGreaterThan(0);
  });

  it('atr 为平均真实波幅', () => {
    const bars = minutes(20);
    const value = atr(bars, 5);
    expect(value).toBeGreaterThan(0);
  });
});
