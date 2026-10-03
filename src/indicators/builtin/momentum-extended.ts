import type { IndicatorDef } from '../core/types';
import { sma, closes, rollingSum } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** ROC 变动率（%） */
export const ROC: IndicatorDef = {
  id: 'roc',
  name: 'ROC 变动率',
  category: '震荡',
  overlay: false,
  lookback: 30,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 9, min: 1, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.green },
  ],
  plots: [{ key: 'roc', label: 'ROC', style: { kind: 'line', color: PALETTE.green, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const c = closes(bars);
    return { roc: c.map((v, i) => (i < p || c[i - p] === 0 ? undefined : ((v - c[i - p]) / c[i - p]) * 100)) };
  },
};

/** Momentum 动量 */
export const Momentum: IndicatorDef = {
  id: 'mom',
  name: 'MOM 动量',
  category: '震荡',
  overlay: false,
  lookback: 30,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 10, min: 1, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.blue },
  ],
  plots: [{ key: 'mom', label: 'MOM', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const c = closes(bars);
    return { mom: c.map((v, i) => (i < p ? undefined : v - c[i - p])) };
  },
};

/** CMO 钱德动量摆动 */
export const CMO: IndicatorDef = {
  id: 'cmo',
  name: 'CMO 钱德动量',
  category: '震荡',
  overlay: false,
  lookback: 50,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.purple },
  ],
  plots: [{ key: 'cmo', label: 'CMO', style: { kind: 'line', color: PALETTE.purple, lineWidth: 2 } }],
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
    const up = rollingSum(gains, p);
    const down = rollingSum(losses, p);
    return {
      cmo: up.map((u, i) => {
        const d = down[i];
        if (u === undefined || d === undefined || i < p) return undefined; // 首个 diff 无效
        return u + d === 0 ? 0 : (100 * (u - d)) / (u + d);
      }),
    };
  },
};

/** DPO 去趋势价格振荡（close − SMA(close, p/2+1) 左移 p/2+1） */
export const DPO: IndicatorDef = {
  id: 'dpo',
  name: 'DPO 去趋势振荡',
  category: '震荡',
  overlay: false,
  lookback: 60,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 2, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.cyan },
  ],
  plots: [{ key: 'dpo', label: 'DPO', style: { kind: 'line', color: PALETTE.cyan, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const sc = Math.floor(p / 2) + 1;
    const c = closes(bars);
    const sm = sma(c, sc);
    return {
      dpo: c.map((v, i) => {
        const m = i - sc >= 0 ? sm[i - sc] : undefined;
        return m === undefined ? undefined : v - m;
      }),
    };
  },
};

/** BOP 均衡成交量（(close−open)/(high−low) 的 SMA 平滑） */
export const BOP: IndicatorDef = {
  id: 'bop',
  name: 'BOP 均衡成交量',
  category: '震荡',
  overlay: false,
  lookback: 30,
  params: [
    { key: 'length', label: '平滑周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.deepOrange },
  ],
  plots: [{ key: 'bop', label: 'BOP', style: { kind: 'line', color: PALETTE.deepOrange, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const raw = bars.map((b) => (b.high === b.low ? 0 : (b.close - b.open) / (b.high - b.low)));
    return { bop: sma(raw, p) };
  },
};

export const momentumBasicIndicators = [ROC, Momentum, CMO, DPO, BOP];
