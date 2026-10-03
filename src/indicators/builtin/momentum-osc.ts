import type { IndicatorDef } from '../core/types';
import { sma, ema, wma, closes, combine, highest, lowest, wilder } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);
const clamp = (v: number) => (v > 0.999 ? 0.999 : v < -0.999 ? -0.999 : v);
const atanh = (v: number) => 0.5 * Math.log((1 + v) / (1 - v));

/** TRIX 三重指数平滑变动率 */
export const TRIX: IndicatorDef = {
  id: 'trix',
  name: 'TRIX 三重平滑',
  category: '震荡',
  overlay: false,
  lookback: 300,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 15, min: 1, max: 200 },
    { key: 'signal', label: '信号', type: 'number', default: 9, min: 1, max: 100 },
  ],
  plots: [
    { key: 'trix', label: 'TRIX', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } },
    { key: 'signal', label: '信号', style: { kind: 'line', color: PALETTE.orange, lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const sig = num(params.signal);
    const c = closes(bars);
    const e3 = ema(
      ema(
        ema(c, p).map((v) => v ?? 0),
        p,
      ).map((v) => v ?? 0),
      p,
    );
    const trix = e3.map((v, i) => {
      const prev = i > 0 ? e3[i - 1] : undefined;
      return v === undefined || prev === undefined || prev === 0 ? undefined : ((v - prev) / prev) * 100;
    });
    return {
      trix,
      signal: sma(
        trix.map((v) => v ?? 0),
        sig,
      ).map((v, i) => (trix[i] === undefined ? undefined : v)),
    };
  },
};

/** TSI 真实强度指数（双重 RMA 平滑动量） */
export const TSI: IndicatorDef = {
  id: 'tsi',
  name: 'TSI 真实强度',
  category: '震荡',
  overlay: false,
  lookback: 300,
  params: [
    { key: 'long', label: '长周期', type: 'number', default: 25, min: 1, max: 200 },
    { key: 'short', label: '短周期', type: 'number', default: 13, min: 1, max: 100 },
  ],
  plots: [{ key: 'tsi', label: 'TSI', style: { kind: 'line', color: PALETTE.indigo, lineWidth: 2 } }],
  compute: (bars, params) => {
    const lp = num(params.long);
    const sp = num(params.short);
    const c = closes(bars);
    const mtm = c.map((v, i) => (i > 0 ? v - c[i - 1] : 0));
    const absMtm = mtm.map(Math.abs);
    const num2 = wilder(
      wilder(mtm, lp).map((v) => v ?? 0),
      sp,
    );
    const den2 = wilder(
      wilder(absMtm, lp).map((v) => v ?? 0),
      sp,
    );
    return {
      tsi: num2.map((v, i) => {
        const d = den2[i];
        return v === undefined || d === undefined || d === 0 ? 0 : (100 * v) / d;
      }),
    };
  },
};

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

export const momentumOscIndicators = [TRIX, TSI, Fisher, KST, Coppock, PPO];
