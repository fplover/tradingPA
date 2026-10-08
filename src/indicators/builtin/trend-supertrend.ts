import type { IndicatorDef } from '../core/types';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** Supertrend（overlay，ATR 通道） */
export const Supertrend: IndicatorDef = {
  id: 'supertrend',
  name: 'Supertrend 超级趋势',
  category: '趋势',
  overlay: true,
  lookback: 110,
  params: [
    { key: 'period', label: 'ATR 周期', type: 'number', default: 10, min: 1, max: 100 },
    { key: 'multiplier', label: '倍数', type: 'number', default: 3, min: 0.5, max: 10, step: 0.5 },
  ],
  plots: [{ key: 'supertrend', label: 'ST', style: { kind: 'line', color: PALETTE.green, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.period);
    const m = num(params.multiplier);
    const out: Array<number | undefined> = [];
    const trs: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const prevClose = i > 0 ? bars[i - 1].close : b.open;
      trs.push(Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
    }
    let atr = 0;
    let upper = 0;
    let lower = 0;
    let st = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (i < p) {
        out.push(undefined);
        continue;
      }
      if (i === p) {
        atr = trs.slice(0, p).reduce((s, v) => s + v, 0) / p;
      } else {
        atr = (atr * (p - 1) + trs[i]) / p;
      }
      const mid = (b.high + b.low) / 2;
      const basicUpper = mid + m * atr;
      const basicLower = mid - m * atr;
      const prevClose = bars[i - 1].close;
      upper = basicUpper < upper || prevClose > upper ? basicUpper : upper;
      lower = basicLower > lower || prevClose < lower ? basicLower : lower;
      if (i === p) {
        st = b.close > upper ? lower : upper;
      } else {
        const prevSt = out[i - 1] ?? st;
        if (prevSt === upper && b.close > upper) st = lower;
        else if (prevSt === upper && b.close < upper) st = upper;
        else if (prevSt === lower && b.close < lower) st = upper;
        else if (prevSt === lower && b.close > lower) st = lower;
      }
      out.push(st);
    }
    return { supertrend: out };
  },
};
