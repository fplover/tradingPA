import type { IndicatorDef } from '../core/types';
import { ema, closes, combine } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** MACD */
export const MACD: IndicatorDef = {
  id: 'macd',
  name: 'MACD',
  category: '震荡',
  overlay: false,
  lookback: 400,
  params: [
    { key: 'fast', label: '快线', type: 'number', default: 12, min: 1, max: 100 },
    { key: 'slow', label: '慢线', type: 'number', default: 26, min: 1, max: 200 },
    { key: 'signal', label: '信号', type: 'number', default: 9, min: 1, max: 100 },
  ],
  plots: [
    { key: 'macd', label: 'MACD', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
    { key: 'signal', label: '信号', style: { kind: 'line', color: PALETTE.orange, lineWidth: 1.5 } },
    {
      key: 'hist',
      label: '柱',
      style: { kind: 'histogram', color: PALETTE.green, upColor: PALETTE.green, downColor: PALETTE.red },
    },
  ],
  compute: (bars, params) => {
    const f = num(params.fast);
    const s = num(params.slow);
    const sig = num(params.signal);
    const c = closes(bars);
    const macd = combine(ema(c, f), ema(c, s), (a, b) => a - b);
    const macdFilled = macd.map((v) => v ?? 0);
    // 信号线 = EMA(MACD) —— TradingView 内置 MACD 与标准定义均为 EMA，
    // 且同仓 Pine `ta.macd`（pine/taFunctions.ts）也是 `dea = EMA(dif, signal)`。
    // 此前误用 SMA：同一平台两套数值。金标准用例见 tests/unit/indicators.test.ts 的
    // 「MACD 信号线用 EMA 而非 SMA」——原用例用单调 ramp，SMA/EMA 都会收敛到同一值，
    // 结构上钉不住这一点，故另加非收敛数据的对照断言。
    const signal = ema(macdFilled, sig);
    const hist = combine(macd, signal, (a, b) => a - b);
    return { macd, signal: macd.map((v, i) => (v === undefined ? undefined : signal[i])), hist };
  },
};
