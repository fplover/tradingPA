import { describe, expect, it } from 'vitest';
import { sma, ema, wma, stdev, highest, lowest, wilder } from '@/indicators/core/math';

describe('math 工具', () => {
  it('sma 计算正确且前 period-1 项为 undefined', () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([undefined, undefined, 2, 3, 4]);
  });

  it('ema 以 SMA 种子启动', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(2); // 种子 = (1+2+3)/3
    expect(out[3]).toBeCloseTo(3, 10); // 4*0.5 + 2*0.5
  });

  it('wma 权重递增', () => {
    const out = wma([1, 2, 3], 3);
    // (1*1 + 2*2 + 3*3) / 6 = 14/6
    expect(out[2]).toBeCloseTo(14 / 6, 10);
  });

  it('stdev 为总体标准差', () => {
    const out = stdev([1, 2, 3], 3);
    expect(out[2]).toBeCloseTo(Math.sqrt(2 / 3), 10);
  });

  it('highest/lowest 滑动窗口', () => {
    expect(highest([1, 5, 3, 2], 2)).toEqual([undefined, 5, 5, 3]);
    expect(lowest([4, 1, 3, 2], 2)).toEqual([undefined, 1, 1, 2]);
  });

  it('wilder 平滑', () => {
    const out = wilder([1, 2, 3, 4], 2);
    expect(out[1]).toBe(1.5); // (1+2)/2
    expect(out[2]).toBeCloseTo((1.5 * 1 + 3) / 2, 10);
  });
});
