import { expect } from 'vitest';
import { compilePine } from '@/indicators/pine/compile';
import type { Bar } from '@/types/market';
import type { ParamValue } from '@/indicators/core/types';

/**
 * Pine 编译器测试夹具与工具（golden 用例共用）。
 * 固定收盘序列 + 手算期望值，不依赖运行时随机。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

/** 固定收盘序列：10,11,12,11,10,9,10,12,14,13,15,16；奇 bar 阳线、偶 bar 阴线 */
export const CLOSES = [10, 11, 12, 11, 10, 9, 10, 12, 14, 13, 15, 16];

export const BARS: Bar[] = CLOSES.map((c, i) => ({
  time: T0 + i * IV,
  open: i % 2 === 0 ? c + 1 : c - 1, // 偶 bar 阴线（open>close），奇 bar 阳线
  high: c + 2,
  low: c - 2,
  close: c,
  volume: 100 * (i + 1),
}));

/** 严格单调序列（单边行情 golden 值用） */
export function trendBars(dir: 1 | -1, n = 12): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + dir * i;
    return { time: T0 + i * IV, open: c, high: c + 1, low: c - 1, close: c, volume: 100 };
  });
}

export function compileOk(src: string) {
  const r = compilePine(src, 'test');
  expect(r.errors).toEqual([]);
  expect(r.def).not.toBeNull();
  return r.def!;
}

/** 取 p0 序列 */
export function plotValues(
  src: string,
  bars: Bar[] = BARS,
  params?: Record<string, ParamValue>,
): Array<number | undefined> {
  const def = compileOk(src);
  const out = def.compute(bars, params ?? {});
  return out.p0;
}

/** 取指定输出键序列 */
export function outputValues(
  src: string,
  key: string,
  bars: Bar[] = BARS,
  params?: Record<string, ParamValue>,
): Array<number | undefined> {
  const def = compileOk(src);
  return def.compute(bars, params ?? {})[key];
}
