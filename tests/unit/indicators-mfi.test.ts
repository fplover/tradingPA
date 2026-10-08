import { describe, expect, it } from 'vitest';
import { getIndicatorDef } from '@/indicators/registry';
import { IndicatorInstance } from '@/indicators/core/instance';
import { compilePine } from '@/indicators/pine/compile';
import { BARS } from './helpers/pine-fixture';
import type { Bar } from '@/types/market';

/**
 * MFI 口径统一用例（第四轮审查「同一 MFI 两条链路口径不同」收口）。
 * TV 定义：MFI = 100 − 100/(1 + 正资金流/负资金流)。
 * 边界口径：neg=0 且 pos>0 → 100；pos=0 且 neg>0 → 0；双方均为 0 → 中性 50。
 * 内置链（indicators/builtin/oscillators-range.ts）与 Pine 链（pine/taCore.ts mfiSeries）必须一致。
 */

/** [open, high, low, close, volume]；ohlc 取平 → 典型价 tp = close，资金流方向完全可控 */
function flatBars(rows: Array<[close: number, volume: number]>): Bar[] {
  return rows.map(([c, v], i) => ({ time: (i + 1) * 60_000, open: c, high: c, low: c, close: c, volume: v }));
}

function builtinMfi(bars: Bar[], length: number): Array<number | undefined> {
  const def = getIndicatorDef('mfi');
  if (!def) throw new Error('指标不存在: mfi');
  return new IndicatorInstance(def, { params: { length } }).computeWindow(bars, 0, bars.length - 1).outputs.mfi;
}

function pineMfi(bars: Bar[], length: number): Array<number | undefined> {
  const r = compilePine(`plot(ta.mfi(${length}))`, 'test');
  expect(r.errors).toEqual([]);
  return r.def!.compute(bars, {}).p0;
}

describe('MFI 内置链（oscillators-range.ts）', () => {
  it('常规值：100 − 100/(1 + pos/neg)，窗口未满为 undefined', () => {
    // close 10,12,11,13；vol 1,2,3,4；length=3
    // i=3 窗口 k=1..3：pos = 12·2 + 13·4 = 76，neg = 11·3 = 33
    const v = builtinMfi(
      flatBars([
        [10, 1],
        [12, 2],
        [11, 3],
        [13, 4],
      ]),
      3,
    );
    expect(v[0]).toBeUndefined();
    expect(v[1]).toBeUndefined();
    expect(v[2]).toBeUndefined();
    // 100 − 100/(1 + 76/33) = 100 − 3300/109
    expect(v[3]).toBeCloseTo(100 - 3300 / 109, 10);
  });

  it('pos=0（窗口内全跌）→ 0', () => {
    // close 13,12,11,10；i=3 窗口全跌：pos=0，neg = 12·2 + 11·3 + 10·4 = 97
    const v = builtinMfi(
      flatBars([
        [13, 1],
        [12, 2],
        [11, 3],
        [10, 4],
      ]),
      3,
    );
    expect(v[3]).toBe(0);
  });

  it('neg=0（窗口内全涨）→ 100', () => {
    // close 10,11,12,13；i=3 窗口全涨：pos = 11·2 + 12·3 + 13·4 = 110，neg=0
    const v = builtinMfi(
      flatBars([
        [10, 1],
        [11, 2],
        [12, 3],
        [13, 4],
      ]),
      3,
    );
    expect(v[3]).toBe(100);
  });

  it('双方都为 0（窗口内典型价无变化）→ 中性 50', () => {
    const v = builtinMfi(
      flatBars([
        [10, 1],
        [10, 2],
        [10, 3],
        [10, 4],
      ]),
      3,
    );
    expect(v[3]).toBe(50);
  });
});

describe('MFI 双链路口径一致（内置 vs Pine ta.mfi）', () => {
  it('固定夹具逐根一致，且常规值与手算参考值相符', () => {
    const builtin = builtinMfi(BARS, 3);
    const pine = pineMfi(BARS, 3);
    for (let i = 0; i < BARS.length; i++) {
      if (i < 3) {
        expect(builtin[i]).toBeUndefined();
        expect(pine[i]).toBeUndefined();
        continue;
      }
      expect(builtin[i]).toBeCloseTo(pine[i]!, 10);
    }
    // 夹具 tp = close；i=3：pos = 11·200 + 12·300 = 5800，neg = 11·400 = 4400
    expect(builtin[3]).toBeCloseTo(100 - (4400 * 100) / 10200, 10);
    // i=4：pos = 12·300 = 3600，neg = 11·400 + 10·500 = 9400
    expect(builtin[4]).toBeCloseTo(100 - (9400 * 100) / 13000, 10);
  });

  it('Pine 链边界与内置链一致：全跌 → 0，全平 → 50', () => {
    const down = flatBars([
      [13, 1],
      [12, 2],
      [11, 3],
      [10, 4],
    ]);
    expect(pineMfi(down, 3)[3]).toBe(0);
    const flat = flatBars([
      [10, 1],
      [10, 2],
      [10, 3],
      [10, 4],
    ]);
    expect(pineMfi(flat, 3)[3]).toBe(50);
  });
});
