import type { IndicatorDef } from '../core/types';
import {
  sma,
  ema,
  stdev,
  wilder,
  closes,
  trueRange,
  rollingSum,
  logReturns,
  highest,
  lowest,
  combine,
  mapValues,
} from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** NATR 归一化 ATR（%ATR = 100 × ATR / close） */
export const NATR: IndicatorDef = {
  id: 'natr',
  name: 'NATR 归一化ATR',
  category: '波动',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.deepOrange },
  ],
  plots: [{ key: 'natr', label: 'NATR', style: { kind: 'line', color: PALETTE.deepOrange, lineWidth: 2 } }],
  compute: (bars, params) => {
    const atr = wilder(trueRange(bars), num(params.length));
    const c = closes(bars);
    return { natr: atr.map((a, i) => (a === undefined || c[i] === 0 ? undefined : (100 * a) / c[i])) };
  },
};

/** Standard Deviation 标准差（收盘价，总体口径，与 BOLL 一致） */
export const StdDev: IndicatorDef = {
  id: 'stdev',
  name: 'Stdev 标准差',
  category: '波动',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 2, max: 300 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.purple },
  ],
  plots: [{ key: 'sd', label: 'Stdev', style: { kind: 'line', color: PALETTE.purple, lineWidth: 2 } }],
  compute: (bars, params) => ({ sd: stdev(closes(bars), num(params.length)) }),
};

/** Bollinger Bands Width 布林带宽（(上轨−下轨)/中轨 × 100） */
export const BBWidth: IndicatorDef = {
  id: 'bb-width',
  name: 'BBWidth 布林带宽',
  category: '波动',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 2, max: 300 },
    { key: 'mult', label: '倍数', type: 'number', default: 2, min: 0.5, max: 5, step: 0.5 },
  ],
  plots: [{ key: 'bbw', label: 'BBW', style: { kind: 'line', color: PALETTE.cyan, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const m = num(params.mult);
    const c = closes(bars);
    const basis = sma(c, p);
    const sd = stdev(c, p);
    return {
      bbw: basis.map((b, i) => {
        const s = sd[i];
        return b === undefined || s === undefined || b === 0 ? undefined : (200 * m * s) / b;
      }),
    };
  },
};

/** Bollinger Bands %B（收盘价在带内的相对位置 × 100） */
export const PercentB: IndicatorDef = {
  id: 'percent-b',
  name: 'BOLL %B',
  category: '波动',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 2, max: 300 },
    { key: 'mult', label: '倍数', type: 'number', default: 2, min: 0.5, max: 5, step: 0.5 },
  ],
  plots: [{ key: 'pb', label: '%B', style: { kind: 'line', color: PALETTE.indigo, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const m = num(params.mult);
    const c = closes(bars);
    const basis = sma(c, p);
    const sd = stdev(c, p);
    const upper = combine(
      basis,
      mapValues(sd, (v) => m * v),
      (a, b) => a + b,
    );
    const lower = combine(
      basis,
      mapValues(sd, (v) => m * v),
      (a, b) => a - b,
    );
    return {
      pb: c.map((v, i) => {
        const u = upper[i];
        const l = lower[i];
        return u === undefined || l === undefined || u === l ? undefined : ((v - l) / (u - l)) * 100;
      }),
    };
  },
};

/** Choppiness Index 盘整指数（100 × log10(ΣTR/(Hmax−Lmin)) / log10(p)） */
export const Choppiness: IndicatorDef = {
  id: 'choppiness',
  name: 'Chop 盘整指数',
  category: '波动',
  overlay: false,
  lookback: 50,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 2, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.magenta },
  ],
  plots: [{ key: 'chop', label: 'CHOP', style: { kind: 'line', color: PALETTE.magenta, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const sumTr = rollingSum(trueRange(bars), p);
    const hh = highest(
      bars.map((b) => b.high),
      p,
    );
    const ll = lowest(
      bars.map((b) => b.low),
      p,
    );
    return {
      chop: sumTr.map((s, i) => {
        const h = hh[i];
        const l = ll[i];
        if (s === undefined || h === undefined || l === undefined || h - l <= 0) return undefined;
        return (100 * Math.log10(s / (h - l))) / Math.log10(p);
      }),
    };
  },
};

/** Mass Index 质量指标（Σ EMA9(H−L)/EMA9(EMA9(H−L))） */
export const MassIndex: IndicatorDef = {
  id: 'mass-index',
  name: 'Mass 质量指标',
  category: '波动',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '求和周期', type: 'number', default: 25, min: 1, max: 100 },
    { key: 'emaLength', label: 'EMA 周期', type: 'number', default: 9, min: 1, max: 50 },
  ],
  plots: [{ key: 'mi', label: 'Mass', style: { kind: 'line', color: PALETTE.orange, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const ep = num(params.emaLength);
    const range = bars.map((b) => b.high - b.low);
    const single = ema(range, ep).map((v) => v ?? 0);
    const double = ema(single, ep).map((v) => v ?? 0);
    const ratio = single.map((v, i) => (double[i] === 0 ? 0 : v / double[i]));
    return { mi: rollingSum(ratio, p) };
  },
};

/** Historical Volatility 历史波动率（对数收益率 Stdev × 100 × √年化因子） */
export const HistVol: IndicatorDef = {
  id: 'hist-vol',
  name: 'HV 历史波动率',
  category: '波动',
  overlay: false,
  lookback: 50,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 10, min: 2, max: 200 },
    { key: 'annual', label: '年化因子', type: 'number', default: 1, min: 1, max: 100000 },
  ],
  plots: [{ key: 'hv', label: 'HV', style: { kind: 'line', color: PALETTE.red, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const ann = Math.sqrt(num(params.annual));
    const lr = logReturns(closes(bars));
    const sd = stdev(
      lr.map((v) => v ?? 0),
      p,
    );
    return { hv: sd.map((s, i) => (s === undefined || i < p || lr[i] === undefined ? undefined : 100 * s * ann)) };
  },
};

export const volatilityIndicators = [NATR, StdDev, BBWidth, PercentB, Choppiness, MassIndex, HistVol];
