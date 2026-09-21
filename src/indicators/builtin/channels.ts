import type { IndicatorDef } from '../core/types';
import { sma, ema, closes, combine, mapValues, stdev, wilder } from '../core/math';

const num = (v: unknown) => Number(v);

/** Bollinger Bands（overlay，中轨+上下轨+填充带） */
export const BollingerBands: IndicatorDef = {
  id: 'bb',
  name: 'BOLL 布林带',
  category: '通道',
  overlay: true,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 300 },
    { key: 'mult', label: '倍数', type: 'number', default: 2, min: 0.5, max: 5, step: 0.5 },
  ],
  plots: [
    { key: 'upper', label: '上轨', style: { kind: 'line', color: '#2962ff88', lineWidth: 1 } },
    { key: 'basis', label: '中轨', style: { kind: 'line', color: '#2962ff', lineWidth: 1.5 } },
    { key: 'lower', label: '下轨', style: { kind: 'line', color: '#2962ff88', lineWidth: 1 } },
    { key: 'band', label: '带', style: { kind: 'band', color: '#2962ff22', bandWith: 'lower' } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const m = num(params.mult);
    const c = closes(bars);
    const basis = sma(c, p);
    const sd = stdev(c, p);
    return {
      basis,
      upper: combine(basis, mapValues(sd, (v) => v * m), (a, b) => a + b),
      lower: combine(basis, mapValues(sd, (v) => v * m), (a, b) => a - b),
      band: basis, // band 占位，填充范围由 upper/lower 决定（渲染时取 bandWith 两端）
    };
  },
};

/** Keltner Channels */
export const KeltnerChannels: IndicatorDef = {
  id: 'keltner',
  name: 'Keltner 肯特纳通道',
  category: '通道',
  overlay: true,
  lookback: 100,
  params: [
    { key: 'length', label: 'EMA 周期', type: 'number', default: 20, min: 1, max: 200 },
    { key: 'atrLength', label: 'ATR 周期', type: 'number', default: 10, min: 1, max: 100 },
    { key: 'mult', label: '倍数', type: 'number', default: 2, min: 0.5, max: 5, step: 0.5 },
  ],
  plots: [
    { key: 'upper', label: '上轨', style: { kind: 'line', color: '#ff980088', lineWidth: 1 } },
    { key: 'basis', label: '中轨', style: { kind: 'line', color: '#ff9800', lineWidth: 1.5 } },
    { key: 'lower', label: '下轨', style: { kind: 'line', color: '#ff980088', lineWidth: 1 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const ap = num(params.atrLength);
    const m = num(params.mult);
    const c = closes(bars);
    const basis = ema(c, p);
    const trs: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const prevClose = i > 0 ? bars[i - 1].close : b.open;
      trs.push(Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
    }
    const atr = wilder(trs, ap);
    return {
      basis,
      upper: combine(basis, mapValues(atr, (v) => v * m), (a, b) => a + b),
      lower: combine(basis, mapValues(atr, (v) => v * m), (a, b) => a - b),
    };
  },
};

/** Donchian Channels */
export const DonchianChannels: IndicatorDef = {
  id: 'donchian',
  name: 'Donchian 唐奇安通道',
  category: '通道',
  overlay: true,
  lookback: 100,
  params: [{ key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 300 }],
  plots: [
    { key: 'upper', label: '上轨', style: { kind: 'line', color: '#26a69a88', lineWidth: 1 } },
    { key: 'basis', label: '中轨', style: { kind: 'line', color: '#26a69a', lineWidth: 1.5 } },
    { key: 'lower', label: '下轨', style: { kind: 'line', color: '#26a69a88', lineWidth: 1 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const upper: Array<number | undefined> = [];
    const lower: Array<number | undefined> = [];
    const basis: Array<number | undefined> = [];
    for (let i = 0; i < bars.length; i++) {
      if (i < p - 1) {
        upper.push(undefined); lower.push(undefined); basis.push(undefined);
        continue;
      }
      let hh = -Infinity;
      let ll = Infinity;
      for (let k = i - p + 1; k <= i; k++) {
        if (highs[k] > hh) hh = highs[k];
        if (lows[k] < ll) ll = lows[k];
      }
      upper.push(hh);
      lower.push(ll);
      basis.push((hh + ll) / 2);
    }
    return { upper, basis, lower };
  },
};

/** Envelopes 包络线 */
export const Envelopes: IndicatorDef = {
  id: 'envelopes',
  name: 'Envelopes 包络线',
  category: '通道',
  overlay: true,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 300 },
    { key: 'percent', label: '偏离%', type: 'number', default: 5, min: 0.1, max: 30, step: 0.1 },
  ],
  plots: [
    { key: 'upper', label: '上轨', style: { kind: 'line', color: '#e91e6388', lineWidth: 1 } },
    { key: 'basis', label: '中轨', style: { kind: 'line', color: '#e91e63', lineWidth: 1.5 } },
    { key: 'lower', label: '下轨', style: { kind: 'line', color: '#e91e6388', lineWidth: 1 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const pct = num(params.percent) / 100;
    const basis = sma(closes(bars), p);
    return {
      basis,
      upper: mapValues(basis, (v) => v * (1 + pct)),
      lower: mapValues(basis, (v) => v * (1 - pct)),
    };
  },
};

export const channelIndicators = [BollingerBands, KeltnerChannels, DonchianChannels, Envelopes];
