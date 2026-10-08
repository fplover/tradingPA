import type { IndicatorDef } from '../core/types';
import { sma, ema, wma, closes, combine, mapValues } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** 简单移动平均 */
export const SMA: IndicatorDef = {
  id: 'sma',
  name: 'MA 移动平均',
  category: '趋势',
  overlay: true,
  lookback: 500,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.orange },
  ],
  plots: [{ key: 'sma', label: 'MA', style: { kind: 'line', color: PALETTE.orange, lineWidth: 2 } }],
  compute: (bars, params) => ({ sma: sma(closes(bars), num(params.length)) }),
};

/** 指数移动平均 */
export const EMA: IndicatorDef = {
  id: 'ema',
  name: 'EMA 指数移动平均',
  category: '趋势',
  overlay: true,
  lookback: 500,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.blue },
  ],
  plots: [{ key: 'ema', label: 'EMA', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } }],
  compute: (bars, params) => ({ ema: ema(closes(bars), num(params.length)) }),
};

/** 加权移动平均 */
export const WMA: IndicatorDef = {
  id: 'wma',
  name: 'WMA 加权移动平均',
  category: '趋势',
  overlay: true,
  lookback: 500,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.pink },
  ],
  plots: [{ key: 'wma', label: 'WMA', style: { kind: 'line', color: PALETTE.pink, lineWidth: 2 } }],
  compute: (bars, params) => ({ wma: wma(closes(bars), num(params.length)) }),
};

/** 双指数移动平均 DEMA = 2*EMA - EMA(EMA) */
export const DEMA: IndicatorDef = {
  id: 'dema',
  name: 'DEMA 双指数均线',
  category: '趋势',
  overlay: true,
  lookback: 500,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.magenta },
  ],
  plots: [{ key: 'dema', label: 'DEMA', style: { kind: 'line', color: PALETTE.magenta, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const e1 = ema(closes(bars), p).map((v) => v ?? 0);
    const e2 = ema(e1, p);
    const e1v = ema(closes(bars), p);
    return {
      dema: combine(
        mapValues(e1v, (v) => 2 * v),
        e2,
        (x, y) => x - y,
      ),
    };
  },
};

/** 三指数移动平均 TEMA = 3E1 - 3E2 + E3 */
export const TEMA: IndicatorDef = {
  id: 'tema',
  name: 'TEMA 三指数均线',
  category: '趋势',
  overlay: true,
  lookback: 600,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.cyan },
  ],
  plots: [{ key: 'tema', label: 'TEMA', style: { kind: 'line', color: PALETTE.cyan, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const c = closes(bars);
    const e1 = ema(c, p);
    const e1f = e1.map((v) => v ?? 0);
    const e2 = ema(e1f, p);
    const e2f = e2.map((v) => v ?? 0);
    const e3 = ema(e2f, p);
    return {
      tema: e1.map((v, i) => {
        const a = v;
        const b = e2[i];
        const d = e3[i];
        return a === undefined || b === undefined || d === undefined ? undefined : 3 * a - 3 * b + d;
      }),
    };
  },
};

/** 船型移动平均 HMA */
export const HMA: IndicatorDef = {
  id: 'hma',
  name: 'HMA 船型移动平均',
  category: '趋势',
  overlay: true,
  lookback: 500,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 16, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.lightGreen },
  ],
  plots: [{ key: 'hma', label: 'HMA', style: { kind: 'line', color: PALETTE.lightGreen, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = Math.max(1, Math.round(num(params.length)));
    const half = Math.max(1, Math.floor(p / 2));
    const c = closes(bars);
    const w1 = wma(c, half);
    const w2 = wma(c, p);
    const diff = combine(
      mapValues(w1, (v) => 2 * v),
      w2,
      (x, y) => x - y,
    ).map((v) => v ?? 0);
    return { hma: wma(diff, Math.max(1, Math.round(Math.sqrt(p)))) };
  },
};

/** 成交量加权移动平均 VWMA */
export const VWMA: IndicatorDef = {
  id: 'vwma',
  name: 'VWMA 量权移动平均',
  category: '趋势',
  overlay: true,
  lookback: 500,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.amber },
  ],
  plots: [{ key: 'vwma', label: 'VWMA', style: { kind: 'line', color: PALETTE.amber, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const out: Array<number | undefined> = [];
    for (let i = 0; i < bars.length; i++) {
      if (i < p - 1) {
        out.push(undefined);
        continue;
      }
      let pv = 0;
      let v = 0;
      for (let k = i - p + 1; k <= i; k++) {
        pv += bars[k].close * bars[k].volume;
        v += bars[k].volume;
      }
      out.push(v > 0 ? pv / v : undefined);
    }
    return { vwma: out };
  },
};

export const trendMaIndicators = [SMA, EMA, WMA, DEMA, TEMA, HMA, VWMA];
