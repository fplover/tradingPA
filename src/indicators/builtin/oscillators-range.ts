import type { IndicatorDef } from '../core/types';
import { sma, typical, closes, highest, lowest } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** CCI 顺势指标 */
export const CCI: IndicatorDef = {
  id: 'cci',
  name: 'CCI 顺势指标',
  category: '震荡',
  overlay: false,
  lookback: 200,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.cyan },
  ],
  plots: [{ key: 'cci', label: 'CCI', style: { kind: 'line', color: PALETTE.cyan, lineWidth: 2 } }],
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
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.deepOrange },
  ],
  plots: [{ key: 'wr', label: '%R', style: { kind: 'line', color: PALETTE.deepOrange, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const c = closes(bars);
    const hh = highest(
      bars.map((b) => b.high),
      p,
    );
    const ll = lowest(
      bars.map((b) => b.low),
      p,
    );
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
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.brown },
  ],
  plots: [{ key: 'mfi', label: 'MFI', style: { kind: 'line', color: PALETTE.brown, lineWidth: 2 } }],
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
      // TV 定义：MFI = 100 − 100/(1 + pos/neg)。neg=0 且 pos>0 → 100（公式极限）；
      // pos=0 且 neg>0 → 0；双方均为 0（窗口内典型价无变化）→ 中性 50。
      // 与 pine/taCore.ts 的 mfiSeries 同口径（第四轮审查「两条链路口径不一」收口）。
      if (neg === 0) out.push(pos === 0 ? 50 : 100);
      else out.push(100 - 100 / (1 + pos / neg));
    }
    return { mfi: out };
  },
};

export const oscillatorsRangeIndicators = [CCI, WilliamsR, MFI];
