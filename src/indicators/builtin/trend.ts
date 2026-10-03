import type { IndicatorDef } from '../core/types';
import { sma, ema, wma, closes, combine, mapValues } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** 简单移动平均 */
export const SMA: IndicatorDef = {
  id: 'sma',
  name: 'MA 移动平均',
  category: '趋势',
  overlay: true,
  lookback: 200,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.orange },
  ],
  plots: [{ key: 'sma', label: 'MA', style: { kind: 'line', color: PALETTE.orange, lineWidth: 2 } }],
  compute: (bars, params) => ({ sma: sma(closes(bars), num(params.length)) }),
};

/** 指数移动平均 */
export const EMA: IndicatorDef = {
  id: 'ema',
  name: 'EMA 指数移动平均',
  category: '趋势',
  overlay: true,
  lookback: 200,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.blue },
  ],
  plots: [{ key: 'ema', label: 'EMA', style: { kind: 'line', color: PALETTE.blue, lineWidth: 2 } }],
  compute: (bars, params) => ({ ema: ema(closes(bars), num(params.length)) }),
};

/** 加权移动平均 */
export const WMA: IndicatorDef = {
  id: 'wma',
  name: 'WMA 加权移动平均',
  category: '趋势',
  overlay: true,
  lookback: 200,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.pink },
  ],
  plots: [{ key: 'wma', label: 'WMA', style: { kind: 'line', color: PALETTE.pink, lineWidth: 2 } }],
  compute: (bars, params) => ({ wma: wma(closes(bars), num(params.length)) }),
};

/** 双指数移动平均 DEMA = 2*EMA - EMA(EMA) */
export const DEMA: IndicatorDef = {
  id: 'dema',
  name: 'DEMA 双指数均线',
  category: '趋势',
  overlay: true,
  lookback: 400,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.magenta },
  ],
  plots: [{ key: 'dema', label: 'DEMA', style: { kind: 'line', color: PALETTE.magenta, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const e1 = ema(closes(bars), p).map((v) => v ?? 0);
    const e2 = ema(e1, p);
    const e1v = ema(closes(bars), p);
    return { dema: combine(mapValues(e1v, (v) => 2 * v), e2, (x, y) => x - y) };
  },
};

/** 三指数移动平均 TEMA = 3E1 - 3E2 + E3 */
export const TEMA: IndicatorDef = {
  id: 'tema',
  name: 'TEMA 三指数均线',
  category: '趋势',
  overlay: true,
  lookback: 600,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.cyan },
  ],
  plots: [{ key: 'tema', label: 'TEMA', style: { kind: 'line', color: PALETTE.cyan, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const c = closes(bars);
    const e1 = ema(c, p);
    const e1f = e1.map((v) => v ?? 0);
    const e2 = ema(e1f, p);
    const e2f = e2.map((v) => v ?? 0);
    const e3 = ema(e2f, p);
    return {
      tema: e1.map((v, i) => {
        const a = v;
        const b = e2[i];
        const d = e3[i];
        return a === undefined || b === undefined || d === undefined ? undefined : 3 * a - 3 * b + d;
      }),
    };
  },
};

/** 船型移动平均 HMA */
export const HMA: IndicatorDef = {
  id: 'hma',
  name: 'HMA 船型移动平均',
  category: '趋势',
  overlay: true,
  lookback: 300,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 16, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.lightGreen },
  ],
  plots: [{ key: 'hma', label: 'HMA', style: { kind: 'line', color: PALETTE.lightGreen, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = Math.max(1, Math.round(num(params.length)));
    const half = Math.max(1, Math.floor(p / 2));
    const c = closes(bars);
    const w1 = wma(c, half);
    const w2 = wma(c, p);
    const diff = combine(mapValues(w1, (v) => 2 * v), w2, (x, y) => x - y).map((v) => v ?? 0);
    return { hma: wma(diff, Math.max(1, Math.round(Math.sqrt(p)))) };
  },
};

/** 成交量加权移动平均 VWMA */
export const VWMA: IndicatorDef = {
  id: 'vwma',
  name: 'VWMA 量权移动平均',
  category: '趋势',
  overlay: true,
  lookback: 200,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.amber },
  ],
  plots: [{ key: 'vwma', label: 'VWMA', style: { kind: 'line', color: PALETTE.amber, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.length);
    const out: Array<number | undefined> = [];
    for (let i = 0; i < bars.length; i++) {
      if (i < p - 1) {
        out.push(undefined);
        continue;
      }
      let pv = 0;
      let v = 0;
      for (let k = i - p + 1; k <= i; k++) {
        pv += bars[k].close * bars[k].volume;
        v += bars[k].volume;
      }
      out.push(v > 0 ? pv / v : undefined);
    }
    return { vwma: out };
  },
};

/** Ichimoku 云（overlay） */
export const Ichimoku: IndicatorDef = {
  id: 'ichimoku',
  name: 'Ichimoku 云',
  category: '趋势',
  overlay: true,
  lookback: 120,
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

/** Supertrend（overlay，ATR 通道） */
export const Supertrend: IndicatorDef = {
  id: 'supertrend',
  name: 'Supertrend 超级趋势',
  category: '趋势',
  overlay: true,
  lookback: 100,
  params: [
    { key: 'period', label: 'ATR 周期', type: 'number', default: 10, min: 1, max: 100 },
    { key: 'multiplier', label: '倍数', type: 'number', default: 3, min: 0.5, max: 10, step: 0.5 },
  ],
  plots: [{ key: 'supertrend', label: 'ST', style: { kind: 'line', color: PALETTE.green, lineWidth: 2 } }],
  compute: (bars, params) => {
    const p = num(params.period);
    const m = num(params.multiplier);
    const out: Array<number | undefined> = [];
    const trs: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const prevClose = i > 0 ? bars[i - 1].close : b.open;
      trs.push(Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
    }
    let atr = 0;
    let upper = 0;
    let lower = 0;
    let st = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (i < p) {
        out.push(undefined);
        continue;
      }
      if (i === p) {
        atr = trs.slice(0, p).reduce((s, v) => s + v, 0) / p;
      } else {
        atr = (atr * (p - 1) + trs[i]) / p;
      }
      const mid = (b.high + b.low) / 2;
      const basicUpper = mid + m * atr;
      const basicLower = mid - m * atr;
      const prevClose = bars[i - 1].close;
      upper = basicUpper < upper || prevClose > upper ? basicUpper : upper;
      lower = basicLower > lower || prevClose < lower ? basicLower : lower;
      if (i === p) {
        st = b.close > upper ? lower : upper;
      } else {
        const prevSt = out[i - 1] ?? st;
        if (prevSt === upper && b.close > upper) st = lower;
        else if (prevSt === upper && b.close < upper) st = upper;
        else if (prevSt === lower && b.close < lower) st = upper;
        else if (prevSt === lower && b.close > lower) st = lower;
      }
      out.push(st);
    }
    return { supertrend: out };
  },
};

export const trendIndicators = [SMA, EMA, WMA, DEMA, TEMA, HMA, VWMA, Ichimoku, Supertrend];
