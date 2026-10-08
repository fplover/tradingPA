import type { IndicatorDef } from '../core/types';
import { combine } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** Ichimoku 云（overlay） */
export const Ichimoku: IndicatorDef = {
  id: 'ichimoku',
  name: 'Ichimoku 云',
  category: '趋势',
  overlay: true,
  lookback: 700,
  params: [
    { key: 'tenkan', label: '转换线', type: 'number', default: 9, min: 1, max: 100 },
    { key: 'kijun', label: '基准线', type: 'number', default: 26, min: 1, max: 200 },
    { key: 'senkou', label: '先行带B', type: 'number', default: 52, min: 1, max: 400 },
  ],
  plots: [
    { key: 'tenkan', label: '转换线', style: { kind: 'line', color: PALETTE.pink, lineWidth: 1.5 } },
    { key: 'kijun', label: '基准线', style: { kind: 'line', color: PALETTE.midGreen, lineWidth: 1.5 } },
    { key: 'senkouA', label: '先行带A', style: { kind: 'line', color: PALETTE.green55, lineWidth: 1 } },
    { key: 'senkouB', label: '先行带B', style: { kind: 'line', color: PALETTE.red55, lineWidth: 1 } },
  ],
  compute: (bars, params) => {
    const t = num(params.tenkan);
    const k = num(params.kijun);
    const s = num(params.senkou);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const mid = (period: number): Array<number | undefined> =>
      bars.map((_, i) => {
        if (i < period - 1) return undefined;
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = i - period + 1; j <= i; j++) {
          if (highs[j] > hh) hh = highs[j];
          if (lows[j] < ll) ll = lows[j];
        }
        return (hh + ll) / 2;
      });
    const tenkan = mid(t);
    const kijun = mid(k);
    const senkouB = mid(s);
    const senkouA = combine(tenkan, kijun, (a, b) => (a + b) / 2);
    return { tenkan, kijun, senkouA, senkouB };
  },
};
