import type { IndicatorDef } from '../core/types';
import { sma, closes, typical, combine, mapValues, highest, lowest, wilder } from '../core/math';

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
    { key: 'color', label: '颜色', type: 'color', default: '#7e57c2' },
  ],
  plots: [{ key: 'rsi', label: 'RSI', style: { kind: 'line', color: '#7e57c2', lineWidth: 2 } }],
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
  lookback: 50,
  params: [
    { key: 'k', label: '%K 周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'd', label: '%D 平滑', type: 'number', default: 3, min: 1, max: 50 },
    { key: 'smooth', label: '%K 平滑', type: 'number', default: 3, min: 1, max: 50 },
  ],
  plots: [
    { key: 'k', label: '%K', style: { kind: 'line', color: '#2962ff', lineWidth: 2 } },
    { key: 'd', label: '%D', style: { kind: 'line', color: '#ff9800', lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const p = num(params.k);
    const d = num(params.d);
    const s = num(params.smooth);
    const c = closes(bars);
    const hh = highest(bars.map((b) => b.high), p);
    const ll = lowest(bars.map((b) => b.low), p);
    const rawK = c.map((v, i) => {
      const h = hh[i];
      const l = ll[i];
      if (h === undefined || l === undefined || h === l) return undefined;
      return ((v - l) / (h - l)) * 100;
    });
    const k = sma(rawK.map((v) => v ?? 0), s);
    const kClean = rawK.map((v, i) => (v === undefined ? undefined : k[i]));
    return { k: kClean, d: sma(kClean.map((v) => v ?? 0), d).map((v, i) => (kClean[i] === undefined ? undefined : v)) };
  },
};

/** Stoch RSI */
export const StochRSI: IndicatorDef = {
  id: 'stoch-rsi',
  name: 'Stoch RSI',
  category: '震荡',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'rsiLength', label: 'RSI 周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'stochLength', label: 'Stoch 周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'k', label: '%K', type: 'number', default: 3, min: 1, max: 50 },
    { key: 'd', label: '%D', type: 'number', default: 3, min: 1, max: 50 },
  ],
  plots: [
    { key: 'k', label: '%K', style: { kind: 'line', color: '#2962ff', lineWidth: 2 } },
    { key: 'd', label: '%D', style: { kind: 'line', color: '#ff9800', lineWidth: 1.5 } },
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
    const k = sma(raw.map((v) => v ?? 0), kp);
    const kClean = raw.map((v, i) => (v === undefined ? undefined : k[i]));
    return { k: kClean, d: sma(kClean.map((v) => v ?? 0), dp).map((v, i) => (kClean[i] === undefined ? undefined : v)) };
  },
};

/** CCI 顺势指标 */
export const CCI: IndicatorDef = {
  id: 'cci',
  name: 'CCI 顺势指标',
  category: '震荡',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: '#00bcd4' },
  ],
  plots: [{ key: 'cci', label: 'CCI', style: { kind: 'line', color: '#00bcd4', lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const tp = typical(bars);
    const ma = sma(tp, p);
    const out = tp.map((v, i) => {
      const m = ma[i];
      if (m === undefined) return undefined;
      let md = 0;
      for (let k = i - p + 1; k <= i; k++) md += Math.abs(tp[k] - m);
      md /= p;
      return md === 0 ? 0 : (v - m) / (0.015 * md);
    });
    return { cci: out };
  },
};

/** Williams %R */
export const WilliamsR: IndicatorDef = {
  id: 'williams-r',
  name: 'Williams %R',
  category: '震荡',
  overlay: false,
  lookback: 50,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: '#ff5722' },
  ],
  plots: [{ key: 'wr', label: '%R', style: { kind: 'line', color: '#ff5722', lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const c = closes(bars);
    const hh = highest(bars.map((b) => b.high), p);
    const ll = lowest(bars.map((b) => b.low), p);
    return {
      wr: c.map((v, i) => {
        const h = hh[i];
        const l = ll[i];
        if (h === undefined || l === undefined || h === l) return undefined;
        return ((h - v) / (h - l)) * -100;
      }),
    };
  },
};

/** MFI 资金流量指标 */
export const MFI: IndicatorDef = {
  id: 'mfi',
  name: 'MFI 资金流量',
  category: '震荡',
  overlay: false,
  lookback: 50,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: '#795548' },
  ],
  plots: [{ key: 'mfi', label: 'MFI', style: { kind: 'line', color: '#795548', lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const tp = typical(bars);
    const out: Array<number | undefined> = [];
    for (let i = 0; i < bars.length; i++) {
      if (i < p) {
        out.push(undefined);
        continue;
      }
      let pos = 0;
      let neg = 0;
      for (let k = i - p + 1; k <= i; k++) {
        const flow = tp[k] * bars[k].volume;
        if (tp[k] > tp[k - 1]) pos += flow;
        else if (tp[k] < tp[k - 1]) neg += flow;
      }
      out.push(neg === 0 ? 100 : 100 - 100 / (1 + pos / neg));
    }
    return { mfi: out };
  },
};

/** Awesome Oscillator + Accelerator */
export const AwesomeOscillator: IndicatorDef = {
  id: 'ao',
  name: 'AO 动量震荡',
  category: '震荡',
  overlay: false,
  lookback: 60,
  params: [],
  plots: [
    { key: 'ao', label: 'AO', style: { kind: 'histogram', color: '#26a69a', upColor: '#26a69a', downColor: '#ef5350' } },
    { key: 'ac', label: 'AC', style: { kind: 'histogram', color: '#ef5350', upColor: '#26a69a', downColor: '#ef5350' } },
  ],
  compute: (bars) => {
    const median = bars.map((b) => (b.high + b.low) / 2);
    const ao = combine(sma(median, 5), sma(median, 34), (a, b) => a - b);
    const aoFilled = ao.map((v) => v ?? 0);
    const ac = combine(mapValues(sma(aoFilled, 5), (v) => v), ao, (a, b) => b - a);
    return { ao, ac };
  },
};

/** Ultimate Oscillator */
export const UltimateOscillator: IndicatorDef = {
  id: 'uo',
  name: 'UO 终极波动',
  category: '震荡',
  overlay: false,
  lookback: 60,
  params: [
    { key: 'fast', label: '短周期', type: 'number', default: 7, min: 1, max: 50 },
    { key: 'mid', label: '中周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'slow', label: '长周期', type: 'number', default: 28, min: 1, max: 200 },
  ],
  plots: [{ key: 'uo', label: 'UO', style: { kind: 'line', color: '#3f51b5', lineWidth: 2 } }],
  compute: (bars, params) => {
    const f = num(params.fast);
    const m = num(params.mid);
    const s = num(params.slow);
    const bp: number[] = [];
    const tr: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const prevClose = i > 0 ? bars[i - 1].close : b.open;
      const minLow = Math.min(b.low, prevClose);
      const maxHigh = Math.max(b.high, prevClose);
      bp.push(b.close - minLow);
      tr.push(maxHigh - minLow);
    }
    const avg = (period: number, i: number) => {
      let bSum = 0;
      let tSum = 0;
      for (let k = i - period + 1; k <= i; k++) {
        bSum += bp[k];
        tSum += tr[k];
      }
      return tSum === 0 ? 0 : bSum / tSum;
    };
    return {
      uo: bars.map((_, i) => {
        if (i < s - 1) return undefined;
        return (4 * avg(f, i) + 2 * avg(m, i) + avg(s, i)) / 7 * 100;
      }),
    };
  },
};

export const oscillatorIndicators = [RSI, Stoch, StochRSI, CCI, WilliamsR, MFI, AwesomeOscillator, UltimateOscillator];
