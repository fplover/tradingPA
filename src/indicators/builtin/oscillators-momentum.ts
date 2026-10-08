import type { IndicatorDef } from '../core/types';
import { sma, combine, mapValues } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** Awesome Oscillator + Accelerator */
export const AwesomeOscillator: IndicatorDef = {
  id: 'ao',
  name: 'AO 动量震荡',
  category: '震荡',
  overlay: false,
  lookback: 60,
  params: [],
  plots: [
    {
      key: 'ao',
      label: 'AO',
      style: { kind: 'histogram', color: PALETTE.green, upColor: PALETTE.green, downColor: PALETTE.red },
    },
    {
      key: 'ac',
      label: 'AC',
      style: { kind: 'histogram', color: PALETTE.red, upColor: PALETTE.green, downColor: PALETTE.red },
    },
  ],
  compute: (bars) => {
    const median = bars.map((b) => (b.high + b.low) / 2);
    const ao = combine(sma(median, 5), sma(median, 34), (a, b) => a - b);
    const aoFilled = ao.map((v) => v ?? 0);
    const ac = combine(
      mapValues(sma(aoFilled, 5), (v) => v),
      ao,
      (a, b) => b - a,
    );
    return { ao, ac };
  },
};

/** Ultimate Oscillator */
export const UltimateOscillator: IndicatorDef = {
  id: 'uo',
  name: 'UO 终极波动',
  category: '震荡',
  overlay: false,
  lookback: 350,
  params: [
    { key: 'fast', label: '短周期', type: 'number', default: 7, min: 1, max: 50 },
    { key: 'mid', label: '中周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'slow', label: '长周期', type: 'number', default: 28, min: 1, max: 200 },
  ],
  plots: [{ key: 'uo', label: 'UO', style: { kind: 'line', color: PALETTE.indigo, lineWidth: 2 } }],
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
        // 预热取三周期最大值：只按 slow 判定时 fast > slow 的参数组合会让 avg() 取负索引 → 全 NaN
        if (i < Math.max(f, m, s) - 1) return undefined;
        return ((4 * avg(f, i) + 2 * avg(m, i) + avg(s, i)) / 7) * 100;
      }),
    };
  },
};

export const oscillatorsMomentumIndicators = [AwesomeOscillator, UltimateOscillator];
