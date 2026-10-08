import type { IndicatorDef } from '../core/types';
import { highest, lowest } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);
const clamp = (v: number) => (v > 0.999 ? 0.999 : v < -0.999 ? -0.999 : v);
const atanh = (v: number) => 0.5 * Math.log((1 + v) / (1 - v));

/** Fisher Transform 费雪变换（Fisher + Trigger，Ehlers 公式） */
export const Fisher: IndicatorDef = {
  id: 'fisher',
  name: 'Fisher 费雪变换',
  category: '震荡',
  overlay: false,
  lookback: 100,
  params: [{ key: 'length', label: '周期', type: 'number', default: 9, min: 1, max: 100 }],
  plots: [
    { key: 'fisher', label: 'Fisher', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
    { key: 'trigger', label: 'Trigger', style: { kind: 'line', color: PALETTE.red, lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const src = bars.map((b) => (b.high + b.low) / 2);
    const hh = highest(src, p);
    const ll = lowest(src, p);
    const fisher: Array<number | undefined> = [];
    const trigger: Array<number | undefined> = [];
    let value = 0;
    let prevFisher = 0;
    for (let i = 0; i < bars.length; i++) {
      const h = hh[i];
      const l = ll[i];
      if (h === undefined || l === undefined) {
        fisher.push(undefined);
        trigger.push(undefined);
        continue;
      }
      const ratio = h === l ? 0.5 : (src[i] - l) / (h - l);
      value = 0.66 * (ratio - 0.5) + 0.67 * value;
      // Ehlers Fisher：f = atanh(x) + 0.5·f[1]（atanh(x) = 0.5·ln((1+x)/(1−x))）。
      // 第四轮审查发现此前漏了 `+ 0.5·prevFisher` 递归项——数值与同仓 Pine
      // `ta.fisher`（pine/taCore.ts:202 `0.5*log(…) + 0.5*prevF`）不一致。
      const f = atanh(clamp(value)) + 0.5 * prevFisher;
      fisher.push(f);
      // Trigger = 上一根 Fisher（TradingView 内置 Fisher Transform 的 Trigger 定义）。
      // 修正前 trigger 用的是「0.5·atanh + 0.5·prev」——那是半个 Fisher，与 fisher 语义重叠。
      trigger.push(i > 0 ? fisher[i - 1] : undefined);
      prevFisher = f;
    }
    return { fisher, trigger };
  },
};
