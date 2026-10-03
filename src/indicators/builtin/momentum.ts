import type { Bar } from '@/types/market';
import type { IndicatorDef } from '../core/types';
import { sma, ema, closes, combine, wilder } from '../core/math';
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

/** MACD */
export const MACD: IndicatorDef = {
  id: 'macd',
  name: 'MACD',
  category: '震荡',
  overlay: false,
  lookback: 100,
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
    const signal = sma(macdFilled, sig);
    const hist = combine(macd, signal, (a, b) => a - b);
    return { macd, signal: macd.map((v, i) => (v === undefined ? undefined : signal[i])), hist };
  },
};

/** ADX / DMI */
export const ADX: IndicatorDef = {
  id: 'adx',
  name: 'ADX 趋势强度',
  category: '趋势',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 14, min: 1, max: 100 },
    { key: 'smoothing', label: '平滑', type: 'number', default: 14, min: 1, max: 100 },
  ],
  plots: [
    { key: 'adx', label: 'ADX', style: { kind: 'line', color: PALETTE.purple, lineWidth: 2 } },
    { key: 'plusDI', label: '+DI', style: { kind: 'line', color: PALETTE.green, lineWidth: 1.5 } },
    { key: 'minusDI', label: '-DI', style: { kind: 'line', color: PALETTE.red, lineWidth: 1.5 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const sm = num(params.smoothing);
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const tr: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const prev = i > 0 ? bars[i - 1] : b;
      const upMove = b.high - prev.high;
      const downMove = prev.low - b.low;
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      const prevClose = i > 0 ? bars[i - 1].close : b.open;
      tr.push(Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
    }
    const trS = wilder(tr, p);
    const plusS = wilder(plusDM, p);
    const minusS = wilder(minusDM, p);
    const plusDI = plusS.map((v, i) => {
      const t = trS[i];
      return v === undefined || t === undefined || t === 0 ? undefined : (v / t) * 100;
    });
    const minusDI = minusS.map((v, i) => {
      const t = trS[i];
      return v === undefined || t === undefined || t === 0 ? undefined : (v / t) * 100;
    });
    const dx = plusDI.map((v, i) => {
      const m = minusDI[i];
      if (v === undefined || m === undefined || v + m === 0) return undefined;
      return (Math.abs(v - m) / (v + m)) * 100;
    });
    const adx = wilder(
      dx.map((v) => v ?? 0),
      sm,
    ).map((v, i) => (dx[i] === undefined ? undefined : v));
    return { adx, plusDI, minusDI };
  },
};

/** Aroon */
export const Aroon: IndicatorDef = {
  id: 'aroon',
  name: 'Aroon 阿隆',
  category: '趋势',
  overlay: false,
  lookback: 50,
  params: [{ key: 'length', label: '周期', type: 'number', default: 25, min: 1, max: 200 }],
  plots: [
    { key: 'up', label: 'Aroon Up', style: { kind: 'line', color: PALETTE.green, lineWidth: 2 } },
    { key: 'down', label: 'Aroon Down', style: { kind: 'line', color: PALETTE.red, lineWidth: 2 } },
  ],
  compute: (bars, params) => {
    const p = num(params.length);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    return {
      up: bars.map((_, i) => {
        if (i < p - 1) return undefined;
        let hiIdx = 0;
        let hh = -Infinity;
        for (let k = i - p + 1; k <= i; k++) {
          if (highs[k] >= hh) {
            hh = highs[k];
            hiIdx = k;
          }
        }
        return ((p - (i - hiIdx)) / p) * 100;
      }),
      down: bars.map((_, i) => {
        if (i < p - 1) return undefined;
        let loIdx = 0;
        let ll = Infinity;
        for (let k = i - p + 1; k <= i; k++) {
          if (lows[k] <= ll) {
            ll = lows[k];
            loIdx = k;
          }
        }
        return ((p - (i - loIdx)) / p) * 100;
      }),
    };
  },
};

/** Parabolic SAR（overlay） */
export const PSAR: IndicatorDef = {
  id: 'psar',
  name: 'PSAR 抛物线转向',
  category: '趋势',
  overlay: true,
  lookback: 50,
  params: [
    { key: 'step', label: '步长', type: 'number', default: 0.02, min: 0.001, max: 0.2, step: 0.001 },
    { key: 'max', label: '上限', type: 'number', default: 0.2, min: 0.05, max: 1, step: 0.01 },
  ],
  plots: [{ key: 'psar', label: 'PSAR', style: { kind: 'line', color: PALETTE.orange, lineWidth: 2 } }],
  compute: (bars, params) => {
    const step = num(params.step);
    const max = num(params.max);
    const out: Array<number | undefined> = [];
    let sar = bars[0]?.low ?? 0;
    let ep = bars[0]?.high ?? 0;
    let af = step;
    let rising = true;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (i === 0) {
        out.push(sar);
        continue;
      }
      sar = sar + af * (ep - sar);
      if (rising) {
        if (b.low < sar) {
          rising = false;
          sar = ep;
          ep = b.low;
          af = step;
        } else if (b.high > ep) {
          ep = b.high;
          af = Math.min(max, af + step);
        }
      } else {
        if (b.high > sar) {
          rising = true;
          sar = ep;
          ep = b.high;
          af = step;
        } else if (b.low < ep) {
          ep = b.low;
          af = Math.min(max, af + step);
        }
      }
      out.push(sar);
    }
    return { psar: out };
  },
};

/** Pivot Points 经典枢轴（overlay，基于前一根 bar） */
export const PivotPoints: IndicatorDef = {
  id: 'pivot-points',
  name: 'Pivot Points 枢轴点',
  category: '趋势',
  overlay: true,
  lookback: 2,
  params: [{ key: 'color', label: '颜色', type: 'color', default: PALETTE.gray }],
  plots: [
    { key: 'pivot', label: '枢轴', style: { kind: 'level', color: PALETTE.orange, lineWidth: 1.5 } },
    { key: 'r1', label: 'R1', style: { kind: 'level', color: PALETTE.red, lineWidth: 1 } },
    { key: 's1', label: 'S1', style: { kind: 'level', color: PALETTE.green, lineWidth: 1 } },
    { key: 'r2', label: 'R2', style: { kind: 'level', color: PALETTE.red80, lineWidth: 1 } },
    { key: 's2', label: 'S2', style: { kind: 'level', color: PALETTE.green80, lineWidth: 1 } },
  ],
  compute: (bars) => {
    const p: Array<number | undefined> = [];
    const r1: Array<number | undefined> = [];
    const s1: Array<number | undefined> = [];
    const r2: Array<number | undefined> = [];
    const s2: Array<number | undefined> = [];
    for (let i = 0; i < bars.length; i++) {
      if (i === 0) {
        p.push(undefined);
        r1.push(undefined);
        s1.push(undefined);
        r2.push(undefined);
        s2.push(undefined);
        continue;
      }
      const prev = bars[i - 1];
      const pivot = (prev.high + prev.low + prev.close) / 3;
      p.push(pivot);
      r1.push(2 * pivot - prev.low);
      s1.push(2 * pivot - prev.high);
      r2.push(pivot + (prev.high - prev.low));
      s2.push(pivot - (prev.high - prev.low));
    }
    return { pivot: p, r1, s1, r2, s2 };
  },
};

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

export const macdAdxIndicators = [MACD, ADX, Aroon, PSAR, PivotPoints, ATR];
