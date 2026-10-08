import type { Bar } from '@/types/market';
import type { IndicatorDef } from '../core/types';
import { wilder } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

function atrValues(bars: readonly Bar[], period: number): Array<number | undefined> {
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const prevClose = i > 0 ? bars[i - 1].close : b.open;
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
  }
  return wilder(trs, period);
}

/** ATR（副图） */
export const ATR: IndicatorDef = {
  id: 'atr',
  name: 'ATR 真实波幅',
  category: '波动',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.deepOrange },
  ],
  plots: [{ key: 'atr', label: 'ATR', style: { kind: 'line', color: PALETTE.deepOrange, lineWidth: 2 } }],
  compute: (bars, params) => ({ atr: atrValues(bars, num(params.length)) }),
};
