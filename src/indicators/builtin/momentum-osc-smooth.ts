import type { IndicatorDef } from '../core/types';
import { sma, ema, closes, wilder } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** TRIX 三重指数平滑变动率 */
export const TRIX: IndicatorDef = {
  id: 'trix',
  name: 'TRIX 三重平滑',
  category: '震荡',
  overlay: false,
  lookback: 300,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 15, min: 1, max: 200 },
    { key: 'signal', label: '信号', type: 'number', default: 9, min: 1, max: 100 },
  ],
  plots: [
    { key: 'trix', label: 'TRIX', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
    { key: 'signal', label: '信号', style: { kind: 'line', color: PALETTE.orange, lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const sig = num(params.signal);
    const c = closes(bars);
    const e3 = ema(
      ema(
        ema(c, p).map((v) => v ?? 0),
        p,
      ).map((v) => v ?? 0),
      p,
    );
    const trix = e3.map((v, i) => {
      const prev = i > 0 ? e3[i - 1] : undefined;
      return v === undefined || prev === undefined || prev === 0 ? undefined : ((v - prev) / prev) * 100;
    });
    return {
      trix,
      signal: sma(
        trix.map((v) => v ?? 0),
        sig,
      ).map((v, i) => (trix[i] === undefined ? undefined : v)),
    };
  },
};

/** TSI 真实强度指数（双重 RMA 平滑动量） */
export const TSI: IndicatorDef = {
  id: 'tsi',
  name: 'TSI 真实强度',
  category: '震荡',
  overlay: false,
  lookback: 300,
  params: [
    { key: 'long', label: '长周期', type: 'number', default: 25, min: 1, max: 200 },
    { key: 'short', label: '短周期', type: 'number', default: 13, min: 1, max: 100 },
  ],
  plots: [{ key: 'tsi', label: 'TSI', style: { kind: 'line', color: PALETTE.indigo, lineWidth: 2 } }],
  compute: (bars, params) => {
    const lp = num(params.long);
    const sp = num(params.short);
    const c = closes(bars);
    const mtm = c.map((v, i) => (i > 0 ? v - c[i - 1] : 0));
    const absMtm = mtm.map(Math.abs);
    const num2 = wilder(
      wilder(mtm, lp).map((v) => v ?? 0),
      sp,
    );
    const den2 = wilder(
      wilder(absMtm, lp).map((v) => v ?? 0),
      sp,
    );
    return {
      tsi: num2.map((v, i) => {
        const d = den2[i];
        return v === undefined || d === undefined || d === 0 ? 0 : (100 * v) / d;
      }),
    };
  },
};

export const momentumOscSmoothIndicators = [TRIX, TSI];
