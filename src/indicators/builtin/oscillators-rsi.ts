import type { IndicatorDef } from '../core/types';
import { sma, closes, highest, lowest, wilder } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** RSI（Wilder） */
export const RSI: IndicatorDef = {
  id: 'rsi',
  name: 'RSI 相对强弱',
  category: '震荡',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.purple },
  ],
  plots: [{ key: 'rsi', label: 'RSI', style: { kind: 'line', color: PALETTE.purple, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const c = closes(bars);
    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = 0; i < c.length; i++) {
      const diff = i > 0 ? c[i] - c[i - 1] : 0;
      gains.push(Math.max(0, diff));
      losses.push(Math.max(0, -diff));
    }
    const ag = wilder(gains, p);
    const al = wilder(losses, p);
    return {
      rsi: ag.map((g, i) => {
        const l = al[i];
        if (g === undefined || l === undefined) return undefined;
        if (l === 0) return 100;
        const rs = g / l;
        return 100 - 100 / (1 + rs);
      }),
    };
  },
};

/** Stochastic %K/%D */
export const Stoch: IndicatorDef = {
  id: 'stoch',
  name: 'Stoch 随机指标',
  category: '震荡',
  overlay: false,
  lookback: 200,
  params: [
    { key: 'k', label: '%K 周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'd', label: '%D 平滑', type: 'number', default: 3, min: 1, max: 50 },
    { key: 'smooth', label: '%K 平滑', type: 'number', default: 3, min: 1, max: 50 },
  ],
  plots: [
    { key: 'k', label: '%K', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
    { key: 'd', label: '%D', style: { kind: 'line', color: PALETTE.orange, lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const p = num(params.k);
    const d = num(params.d);
    const s = num(params.smooth);
    const c = closes(bars);
    const hh = highest(
      bars.map((b) => b.high),
      p,
    );
    const ll = lowest(
      bars.map((b) => b.low),
      p,
    );
    const rawK = c.map((v, i) => {
      const h = hh[i];
      const l = ll[i];
      if (h === undefined || l === undefined || h === l) return undefined;
      return ((v - l) / (h - l)) * 100;
    });
    const k = sma(
      rawK.map((v) => v ?? 0),
      s,
    );
    const kClean = rawK.map((v, i) => (v === undefined ? undefined : k[i]));
    return {
      k: kClean,
      d: sma(
        kClean.map((v) => v ?? 0),
        d,
      ).map((v, i) => (kClean[i] === undefined ? undefined : v)),
    };
  },
};

/** Stoch RSI */
export const StochRSI: IndicatorDef = {
  id: 'stoch-rsi',
  name: 'Stoch RSI',
  category: '震荡',
  overlay: false,
  lookback: 300,
  params: [
    { key: 'rsiLength', label: 'RSI 周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'stochLength', label: 'Stoch 周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'k', label: '%K', type: 'number', default: 3, min: 1, max: 50 },
    { key: 'd', label: '%D', type: 'number', default: 3, min: 1, max: 50 },
  ],
  plots: [
    { key: 'k', label: '%K', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
    { key: 'd', label: '%D', style: { kind: 'line', color: PALETTE.orange, lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const rp = num(params.rsiLength);
    const sp = num(params.stochLength);
    const kp = num(params.k);
    const dp = num(params.d);
    const rsi = RSI.compute(bars, { length: rp }).rsi.map((v) => v ?? 0);
    const hh = highest(rsi, sp);
    const ll = lowest(rsi, sp);
    const raw = rsi.map((v, i) => {
      const h = hh[i];
      const l = ll[i];
      if (h === undefined || l === undefined || h === l) return undefined;
      return ((v - l) / (h - l)) * 100;
    });
    const k = sma(
      raw.map((v) => v ?? 0),
      kp,
    );
    const kClean = raw.map((v, i) => (v === undefined ? undefined : k[i]));
    return {
      k: kClean,
      d: sma(
        kClean.map((v) => v ?? 0),
        dp,
      ).map((v, i) => (kClean[i] === undefined ? undefined : v)),
    };
  },
};

export const oscillatorsRsiIndicators = [RSI, Stoch, StochRSI];
