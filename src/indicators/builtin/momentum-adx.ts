import type { IndicatorDef } from '../core/types';
import { wilder } from '../core/math';
import { PALETTE } from '@/engine/palette';

const num = (v: unknown) => Number(v);

/** ADX / DMI */
export const ADX: IndicatorDef = {
  id: 'adx',
  name: 'ADX 趋势强度',
  category: '趋势',
  overlay: false,
  lookback: 200,
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
    // ADX = Wilder 平滑 DX。**只能对 DX 的稠密尾段平滑**：DX 前 p-1 项未就绪，
    // 若用 0 填充再平滑，种子会被摊薄到真值的 1/sm（14 周期时首值约为真值的 1/14），
    // 且偏差随递推长期残留。同仓 Pine taCore.adxSeries 正是取稠密尾段（dx.slice(start)），
    // 第四轮审查按同一口径统一。段内残留的 undefined 来自「双侧 DI 均为 0」的真实 bar
    // （Pine 同位置记 0），此处同样按 0 计入。
    const adx: Array<number | undefined> = new Array(dx.length).fill(undefined);
    const start = dx.findIndex((v) => v !== undefined);
    if (start >= 0) {
      const smooth = wilder(
        dx.slice(start).map((v) => v ?? 0),
        sm,
      );
      for (let i = 0; i < smooth.length; i++) adx[start + i] = smooth[i];
    }
    return { adx, plusDI, minusDI };
  },
};

/** Aroon */
export const Aroon: IndicatorDef = {
  id: 'aroon',
  name: 'Aroon 阿隆',
  category: '趋势',
  overlay: false,
  lookback: 200,
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

export const momentumAdxIndicators = [ADX, Aroon, PSAR, PivotPoints];
