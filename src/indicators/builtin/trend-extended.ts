import type { IndicatorDef } from '../core/types';
import { wilder, closes, trueRange, rollingSum, linreg, combine } from '../core/math';
import { Aroon } from './momentum';

const num = (v: unknown) => Number(v);
const hl2 = (bars: readonly { high: number; low: number }[]) => bars.map((b) => (b.high + b.low) / 2);

/** Alligator 鳄鱼线（jaw/teeth/lips = SMMA(hl2, 13/8/5)；渲染层不支持未来位移，故不做 TV 前移偏移） */
export const Alligator: IndicatorDef = {
  id: 'alligator',
  name: 'Alligator 鳄鱼线',
  category: '趋势',
  overlay: true,
  lookback: 150,
  params: [
    { key: 'jawLength', label: '颚线周期', type: 'number', default: 13, min: 1, max: 200 },
    { key: 'teethLength', label: '齿线周期', type: 'number', default: 8, min: 1, max: 200 },
    { key: 'lipsLength', label: '唇线周期', type: 'number', default: 5, min: 1, max: 200 },
  ],
  plots: [
    { key: 'jaw', label: '颚线', style: { kind: 'line', color: '#2962ff', lineWidth: 2 } },
    { key: 'teeth', label: '齿线', style: { kind: 'line', color: '#ef5350', lineWidth: 1.5 } },
    { key: 'lips', label: '唇线', style: { kind: 'line', color: '#26a69a', lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const src = hl2(bars);
    return {
      jaw: wilder(src, num(params.jawLength)),
      teeth: wilder(src, num(params.teethLength)),
      lips: wilder(src, num(params.lipsLength)),
    };
  },
};

/** McGinley Dynamic（自适应均线，对价格缺口响应更快） */
export const McGinley: IndicatorDef = {
  id: 'mcginley',
  name: 'McGinley 动态均线',
  category: '趋势',
  overlay: true,
  lookback: 30,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: '#ff9800' },
  ],
  plots: [{ key: 'md', label: 'MD', style: { kind: 'line', color: '#ff9800', lineWidth: 2 } }],
  compute: (bars, params) => {
    const k = num(params.length);
    const c = closes(bars);
    const out: number[] = [];
    for (let i = 0; i < c.length; i++) {
      if (i === 0) {
        out.push(c[0]);
        continue;
      }
      const prev = out[i - 1];
      const ratio = prev > 0 ? Math.pow(c[i] / prev, 4) : 1;
      out.push(prev + (c[i] - prev) / (k * Math.max(ratio, 1e-10)));
    }
    return { md: out };
  },
};

/** Vortex 涡旋指标（VI+ / VI-） */
export const Vortex: IndicatorDef = {
  id: 'vortex',
  name: 'Vortex 涡旋',
  category: '趋势',
  overlay: false,
  lookback: 50,
  params: [{ key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 200 }],
  plots: [
    { key: 'vip', label: 'VI+', style: { kind: 'line', color: '#26a69a', lineWidth: 2 } },
    { key: 'vim', label: 'VI-', style: { kind: 'line', color: '#ef5350', lineWidth: 2 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const vmPlus: number[] = [];
    const vmMinus: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      if (i === 0) {
        vmPlus.push(0);
        vmMinus.push(0);
        continue;
      }
      vmPlus.push(Math.abs(bars[i].high - bars[i - 1].low));
      vmMinus.push(Math.abs(bars[i].low - bars[i - 1].high));
    }
    const tr = trueRange(bars);
    const sp = rollingSum(vmPlus, p);
    const sm = rollingSum(vmMinus, p);
    const st = rollingSum(tr, p);
    return {
      // 首根无前 bar 极差（vm[0]=0），i<p 的窗口含无效项 → 掩掉
      vip: sp.map((v, i) => (v === undefined || i < p || !st[i] ? undefined : v / (st[i] as number))),
      vim: sm.map((v, i) => (v === undefined || i < p || !st[i] ? undefined : v / (st[i] as number))),
    };
  },
};

/** Aroon Oscillator（AroonUp − AroonDown，复用既有 Aroon 计算） */
export const AroonOscillator: IndicatorDef = {
  id: 'aroon-osc',
  name: 'Aroon 震荡',
  category: '趋势',
  overlay: false,
  lookback: 50,
  params: [{ key: 'length', label: '周期', type: 'number', default: 25, min: 1, max: 200 }],
  plots: [{ key: 'osc', label: 'Aroon Osc', style: { kind: 'line', color: '#7e57c2', lineWidth: 2 } }],
  compute: (bars, params) => {
    const { up, down } = Aroon.compute(bars, params);
    return { osc: combine(up, down, (a, b) => a - b) };
  },
};

/** Linear Regression 线（滚动最小二乘拟合，叠加主图） */
export const LinearRegression: IndicatorDef = {
  id: 'linreg',
  name: 'Linear Regression 线性回归',
  category: '趋势',
  overlay: true,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 50, min: 2, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: '#9c27b0' },
  ],
  plots: [{ key: 'linreg', label: 'LinReg', style: { kind: 'line', color: '#9c27b0', lineWidth: 2 } }],
  compute: (bars, params) => ({ linreg: linreg(closes(bars), num(params.length)) }),
};

export const trendExtendedIndicators = [Alligator, McGinley, Vortex, AroonOscillator, LinearRegression];
