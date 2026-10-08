import type { IndicatorDef } from '../core/types';
import { sma, ema, wma, closes, combine } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** KST 确知指标（多周期 ROC 加权和 + 信号线） */
export const KST: IndicatorDef = {
  id: 'kst',
  name: 'KST 确知指标',
  category: '震荡',
  overlay: false,
  lookback: 500,
  params: [
    { key: 'roc1', label: 'ROC1', type: 'number', default: 10, min: 1, max: 100 },
    { key: 'roc2', label: 'ROC2', type: 'number', default: 15, min: 1, max: 100 },
    { key: 'roc3', label: 'ROC3', type: 'number', default: 20, min: 1, max: 100 },
    { key: 'roc4', label: 'ROC4', type: 'number', default: 30, min: 1, max: 100 },
    { key: 'signal', label: '信号', type: 'number', default: 9, min: 1, max: 100 },
  ],
  plots: [
    { key: 'kst', label: 'KST', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
    { key: 'signal', label: '信号', style: { kind: 'line', color: PALETTE.orange, lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const c = closes(bars);
    const rocOf = (p: number) =>
      c.map((v, i) => (i < p || c[i - p] === 0 ? undefined : ((v - c[i - p]) / c[i - p]) * 100));
    const smooth = (roc: Array<number | undefined>, period: number) =>
      sma(
        roc.map((v) => v ?? 0),
        period,
      ).map((v, i) => (roc[i] === undefined ? undefined : v));
    const t1 = smooth(rocOf(num(params.roc1)), 10);
    const t2 = smooth(rocOf(num(params.roc2)), 10);
    const t3 = smooth(rocOf(num(params.roc3)), 10);
    const t4 = smooth(rocOf(num(params.roc4)), 15);
    const kst = t1.map((v, i) => {
      const a = t2[i];
      const b = t3[i];
      const d = t4[i];
      if (v === undefined || a === undefined || b === undefined || d === undefined) return undefined;
      return v + 2 * a + 3 * b + 4 * d;
    });
    return {
      kst,
      signal: sma(
        kst.map((v) => v ?? 0),
        num(params.signal),
      ).map((v, i) => (kst[i] === undefined ? undefined : v)),
    };
  },
};

/** Coppock Curve 考普卡曲线（WMA(ROC(14)+ROC(11), 10)） */
export const Coppock: IndicatorDef = {
  id: 'coppock',
  name: 'Coppock 考普卡',
  category: '震荡',
  overlay: false,
  lookback: 300,
  params: [
    { key: 'fast', label: '短 ROC', type: 'number', default: 11, min: 1, max: 100 },
    { key: 'slow', label: '长 ROC', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'length', label: 'WMA 平滑', type: 'number', default: 10, min: 1, max: 100 },
  ],
  plots: [{ key: 'coppock', label: 'Coppock', style: { kind: 'line', color: PALETTE.pink, lineWidth: 2 } }],
  compute: (bars, params) => {
    const c = closes(bars);
    const rocOf = (p: number) =>
      c.map((v, i) => (i < p || c[i - p] === 0 ? undefined : ((v - c[i - p]) / c[i - p]) * 100));
    const sum = combine(rocOf(num(params.slow)), rocOf(num(params.fast)), (a, b) => a + b);
    const filled = sum.map((v) => v ?? 0);
    return { coppock: wma(filled, num(params.length)).map((v, i) => (sum[i] === undefined ? undefined : v)) };
  },
};

/** PPO 价格振荡百分比 */
export const PPO: IndicatorDef = {
  id: 'ppo',
  name: 'PPO 价格振荡%',
  category: '震荡',
  overlay: false,
  lookback: 400,
  params: [
    { key: 'fast', label: '快线', type: 'number', default: 12, min: 1, max: 100 },
    { key: 'slow', label: '慢线', type: 'number', default: 26, min: 1, max: 200 },
    { key: 'signal', label: '信号', type: 'number', default: 9, min: 1, max: 100 },
  ],
  plots: [
    { key: 'ppo', label: 'PPO', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
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
    const ef = ema(c, f);
    const es = ema(c, s);
    const ppo = combine(ef, es, (a, b) => (b === 0 ? 0 : (100 * (a - b)) / b));
    const signal = sma(
      ppo.map((v) => v ?? 0),
      sig,
    ).map((v, i) => (ppo[i] === undefined ? undefined : v));
    return { ppo, signal, hist: combine(ppo, signal, (a, b) => a - b) };
  },
};

export const momentumOscRocIndicators = [KST, Coppock, PPO];
