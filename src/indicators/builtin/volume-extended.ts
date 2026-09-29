import type { Bar } from '@/types/market';
import type { IndicatorDef } from '../core/types';
import { sma, ema, closes, combine } from '../core/math';

const num = (v: unknown) => Number(v);

/** A/D 累积/派发线内部计算（CLV × Vol 累计） */
function adlValues(bars: readonly Bar[]): number[] {
  const out: number[] = [];
  let adl = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const clv = b.high === b.low ? 0 : ((b.close - b.low) - (b.high - b.close)) / (b.high - b.low);
    adl += clv * b.volume;
    out.push(adl);
  }
  return out;
}

/** A/D 累积/派发线 */
export const ADL: IndicatorDef = {
  id: 'adl',
  name: 'A/D 累积派发',
  category: '成交量',
  overlay: false,
  lookback: 1,
  params: [{ key: 'color', label: '颜色', type: 'color', default: '#26a69a' }],
  plots: [{ key: 'adl', label: 'A/D', style: { kind: 'line', color: '#26a69a', lineWidth: 2 } }],
  compute: (bars) => ({ adl: adlValues(bars) }),
};

/** Chaikin Oscillator 蔡金震荡（EMA(ADL,3) − EMA(ADL,10)） */
export const ChaikinOsc: IndicatorDef = {
  id: 'chaikin-osc',
  name: 'Chaikin 蔡金震荡',
  category: '成交量',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'fast', label: '快线', type: 'number', default: 3, min: 1, max: 50 },
    { key: 'slow', label: '慢线', type: 'number', default: 10, min: 1, max: 100 },
  ],
  plots: [{ key: 'osc', label: 'Chaikin', style: { kind: 'line', color: '#ff9800', lineWidth: 2 } }],
  compute: (bars, params) => {
    const adl = adlValues(bars);
    return { osc: combine(ema(adl, num(params.fast)), ema(adl, num(params.slow)), (a, b) => a - b) };
  },
};

/** Elder Ray 艾达透视（Bull Power = high − EMA13；Bear Power = low − EMA13） */
export const ElderRay: IndicatorDef = {
  id: 'elder-ray',
  name: 'Elder Ray 艾达透视',
  category: '成交量',
  overlay: false,
  lookback: 50,
  params: [{ key: 'length', label: 'EMA 周期', type: 'number', default: 13, min: 1, max: 100 }],
  plots: [
    { key: 'bull', label: '牛力', style: { kind: 'histogram', color: '#26a69a', upColor: '#26a69a', downColor: '#ef5350' } },
    { key: 'bear', label: '熊力', style: { kind: 'histogram', color: '#ef5350', upColor: '#26a69a', downColor: '#ef5350' } },
  ],
  compute: (bars, params) => {
    const emaC = ema(closes(bars), num(params.length));
    return {
      bull: combine(bars.map((b) => b.high), emaC, (h, e) => h - e),
      bear: combine(bars.map((b) => b.low), emaC, (l, e) => l - e),
    };
  },
};

/** Klinger Oscillator 克林格成交量震荡（VF = Vol × Trend × CM，EMA34−EMA55） */
export const Klinger: IndicatorDef = {
  id: 'klinger',
  name: 'Klinger 克林格',
  category: '成交量',
  overlay: false,
  lookback: 150,
  params: [
    { key: 'fast', label: '快线', type: 'number', default: 34, min: 1, max: 100 },
    { key: 'slow', label: '慢线', type: 'number', default: 55, min: 1, max: 200 },
    { key: 'signal', label: '信号', type: 'number', default: 13, min: 1, max: 100 },
  ],
  plots: [
    { key: 'kvo', label: 'KVO', style: { kind: 'line', color: '#2962ff', lineWidth: 2 } },
    { key: 'signal', label: '信号', style: { kind: 'line', color: '#ff9800', lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const vf: number[] = [];
    let cm = 0;
    let prevTrend = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const dm = b.high - b.low;
      const trend = i === 0 ? -1 : b.high + b.low > bars[i - 1].high + bars[i - 1].low ? 1 : -1;
      cm = i === 0 || trend !== prevTrend ? dm : cm + dm;
      prevTrend = trend;
      vf.push(b.volume * trend * cm);
    }
    const kvo = combine(ema(vf, num(params.fast)), ema(vf, num(params.slow)), (a, b) => a - b);
    const signal = ema(kvo.map((v) => v ?? 0), num(params.signal)).map((v, i) => (kvo[i] === undefined ? undefined : v));
    return { kvo, signal };
  },
};

/** Volume Oscillator 量震荡（100 × (SMA(V,fast) − SMA(V,slow)) / SMA(V,slow)） */
export const VolumeOsc: IndicatorDef = {
  id: 'volume-osc',
  name: 'Vol Osc 量震荡',
  category: '成交量',
  overlay: false,
  lookback: 50,
  params: [
    { key: 'fast', label: '短周期', type: 'number', default: 5, min: 1, max: 100 },
    { key: 'slow', label: '长周期', type: 'number', default: 20, min: 1, max: 200 },
  ],
  plots: [{ key: 'vo', label: 'VO', style: { kind: 'line', color: '#7e57c2', lineWidth: 2 } }],
  compute: (bars, params) => {
    const vol = bars.map((b) => b.volume);
    const fast = sma(vol, num(params.fast));
    const slow = sma(vol, num(params.slow));
    return {
      vo: slow.map((s, i) => {
        const f = fast[i];
        return s === undefined || f === undefined || s === 0 ? undefined : (100 * (f - s)) / s;
      }),
    };
  },
};

/** Net Volume 净量（收盘涨为正、跌为负） */
export const NetVolume: IndicatorDef = {
  id: 'net-volume',
  name: 'Net Vol 净量',
  category: '成交量',
  overlay: false,
  lookback: 1,
  params: [],
  plots: [
    {
      key: 'nv',
      label: 'Net Vol',
      style: { kind: 'histogram', color: '#26a69a', upColor: '#26a69a', downColor: '#ef5350' },
    },
  ],
  compute: (bars) => ({
    nv: bars.map((b, i) => (i === 0 || b.close === bars[i - 1].close ? b.volume : b.close > bars[i - 1].close ? b.volume : -b.volume)),
  }),
};

/** Correlation Coefficient 相关系数（close 与 volume 的 Pearson r） */
export const CorrCoeff: IndicatorDef = {
  id: 'corr-coeff',
  name: 'Corr 相关系数',
  category: '成交量',
  overlay: false,
  lookback: 50,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 2, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: '#787b86' },
  ],
  plots: [{ key: 'corr', label: 'Corr', style: { kind: 'line', color: '#787b86', lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const x = closes(bars);
    const y = bars.map((b) => b.volume);
    return {
      corr: x.map((_, i) => {
        if (i < p - 1) return undefined;
        let sx = 0;
        let sy = 0;
        let sxy = 0;
        let sxx = 0;
        let syy = 0;
        for (let k = i - p + 1; k <= i; k++) {
          sx += x[k];
          sy += y[k];
          sxy += x[k] * y[k];
          sxx += x[k] * x[k];
          syy += y[k] * y[k];
        }
        const numr = p * sxy - sx * sy;
        const dx = p * sxx - sx * sx;
        const dy = p * syy - sy * sy;
        if (dx === 0 || dy === 0) return 0;
        return numr / Math.sqrt(dx * dy);
      }),
    };
  },
};

export const volumeExtendedIndicators = [ADL, ChaikinOsc, ElderRay, Klinger, VolumeOsc, NetVolume, CorrCoeff];
