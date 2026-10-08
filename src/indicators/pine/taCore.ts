import type { Bar } from '@/types/market';
import { wilder as coreWilder } from '../core/math';

/**
 * 依赖 K 线 OHLCV 的 ta.* 纯函数实现（tr/atr/adx/cci/mfi/wpr/psar/supertrend/fisher）。
 * 输出与输入等长对齐；窗口/种子未就绪处为 undefined。
 * TR/ATR/ADX 的 Wilder 平滑复用 core/math.wilder（与内置指标引擎同源）。
 */

export type S = Array<number | undefined>;

const undef = (n: number): S => new Array<number | undefined>(n).fill(undefined);

/** 真实波幅：max(h-l, |h-pc|, |l-pc|)；首根无前收 → h-l */
export function trueRange(bars: readonly Bar[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    out.push(
      i === 0
        ? b.high - b.low
        : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
    );
  }
  return out;
}

/** ATR = Wilder 平滑的 TR（同源 core.wilder） */
export function atrSeries(bars: readonly Bar[], n: number): S {
  return coreWilder(trueRange(bars), n);
}

/** ADX：+DM/-DM/TR 经 Wilder 平滑 → DI± → DX → Wilder 平滑 */
export function adxSeries(bars: readonly Bar[], diLen: number, adxLen: number): S {
  const n = bars.length;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const tr = coreWilder(trueRange(bars), diLen);
  const pdi = coreWilder(plusDM, diLen);
  const mdi = coreWilder(minusDM, diLen);
  const dx: Array<number | undefined> = undef(n);
  for (let i = 0; i < n; i++) {
    const p = pdi[i];
    const m = mdi[i];
    const t = tr[i];
    if (p === undefined || m === undefined || t === undefined || t === 0) continue;
    const diP = (100 * p) / t;
    const diM = (100 * m) / t;
    const sum = diP + diM;
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(diP - diM)) / sum;
  }
  // ADX = Wilder 平滑（DX 从 diLen-1 起稠密 → 取稠密尾段复用 core.wilder）
  const out = undef(n);
  const start = dx.findIndex((v) => v !== undefined);
  if (start >= 0) {
    const smooth = coreWilder(dx.slice(start) as number[], adxLen);
    for (let i = 0; i < smooth.length; i++) out[start + i] = smooth[i];
  }
  return out;
}

/** CCI：(TP - SMA(TP,n)) / (0.015 × 窗口平均绝对偏差) */
export function cciSeries(bars: readonly Bar[], n: number): S {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const out = undef(bars.length);
  for (let i = n - 1; i < bars.length; i++) {
    let mean = 0;
    for (let k = i - n + 1; k <= i; k++) mean += tp[k];
    mean /= n;
    let md = 0;
    for (let k = i - n + 1; k <= i; k++) md += Math.abs(tp[k] - mean);
    md /= n;
    out[i] = md === 0 ? 0 : (tp[i] - mean) / (0.015 * md);
  }
  return out;
}

/** MFI：窗口内涨/跌资金流比（neg=0 → 100，pos=0 → 0，双方为 0 → 中性 50；与内置 oscillators-range.ts 的 MFI 同口径） */
export function mfiSeries(bars: readonly Bar[], n: number): S {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const flow = bars.map((b, i) => tp[i] * b.volume);
  const out = undef(bars.length);
  for (let i = n; i < bars.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let k = i - n + 1; k <= i; k++) {
      if (tp[k] > tp[k - 1]) pos += flow[k];
      else if (tp[k] < tp[k - 1]) neg += flow[k];
    }
    if (neg === 0) out[i] = pos === 0 ? 50 : 100;
    else out[i] = 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/** Williams %R：-100 × (HH - C) / (HH - LL)（HH=LL 退化为 0） */
export function wprSeries(bars: readonly Bar[], n: number): S {
  const out = undef(bars.length);
  for (let i = n - 1; i < bars.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let k = i - n + 1; k <= i; k++) {
      if (bars[k].high > hh) hh = bars[k].high;
      if (bars[k].low < ll) ll = bars[k].low;
    }
    out[i] = hh === ll ? 0 : (-100 * (hh - bars[i].close)) / (hh - ll);
  }
  return out;
}

/** Parabolic SAR（经典递推；首根 undefined，方向由前两根收盘决定） */
export function psarSeries(bars: readonly Bar[], start: number, inc: number, max: number): S {
  const n = bars.length;
  const out = undef(n);
  if (n < 2) return out;
  let up = bars[1].close >= bars[0].close;
  let af = start;
  let ep = up ? Math.max(bars[0].high, bars[1].high) : Math.min(bars[0].low, bars[1].low);
  let sar = up ? Math.min(bars[0].low, bars[1].low) : Math.max(bars[0].high, bars[1].high);
  for (let i = 1; i < n; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, bars[i - 1].low);
      if (bars[i].low < sar) {
        up = false;
        sar = ep;
        ep = bars[i].low;
        af = start;
      } else if (bars[i].high > ep) {
        ep = bars[i].high;
        af = Math.min(af + inc, max);
      }
    } else {
      sar = Math.max(sar, bars[i - 1].high);
      if (bars[i].high > sar) {
        up = true;
        sar = ep;
        ep = bars[i].high;
        af = start;
      } else if (bars[i].low < ep) {
        ep = bars[i].low;
        af = Math.min(af + inc, max);
      }
    }
    out[i] = sar;
  }
  return out;
}

/** SuperTrend：[supertrend, direction]；direction -1=多头（ST 在价下）、1=空头 */
export function supertrendSeries(bars: readonly Bar[], factor: number, atrLen: number): [S, S] {
  const n = bars.length;
  const st = undef(n);
  const dir = undef(n);
  const atr = atrSeries(bars, atrLen);
  let prevUp: number | undefined;
  let prevDn: number | undefined;
  let prevDir: number | undefined;
  for (let i = 0; i < n; i++) {
    const a = atr[i];
    if (a === undefined) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const up = hl2 + factor * a;
    const dn = hl2 - factor * a;
    const c = bars[i].close;
    const prevClose = i > 0 ? bars[i - 1].close : c;
    const finUp = prevUp === undefined || up < prevUp || prevClose > prevUp ? up : prevUp;
    const finDn = prevDn === undefined || dn > prevDn || prevClose < prevDn ? dn : prevDn;
    const d = prevDir === undefined ? (c >= hl2 ? -1 : 1) : prevDir === 1 ? (c > finUp ? -1 : 1) : c < finDn ? 1 : -1;
    st[i] = d === -1 ? finDn : finUp;
    dir[i] = d;
    prevUp = finUp;
    prevDn = finDn;
    prevDir = d;
  }
  return [st, dir];
}

/** Fisher Transform：x = 0.66·norm + 0.67·prevX（截断 ±0.999），f = 0.5·ln((1+x)/(1-x)) + 0.5·prevF */
export function fisherSeries(src: S, n: number): S {
  const out = undef(src.length);
  let prevX: number | undefined;
  let prevF: number | undefined;
  const win: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v === undefined) continue;
    win.push(v);
    if (win.length > n) win.shift();
    if (win.length < n) continue;
    const hl = Math.max(...win);
    const ll = Math.min(...win);
    if (hl === ll) continue;
    const norm = (v - ll) / (hl - ll) - 0.5;
    const x = Math.max(-0.999, Math.min(0.999, 0.66 * norm + 0.67 * (prevX ?? 0)));
    const f = 0.5 * Math.log((1 + x) / (1 - x)) + 0.5 * (prevF ?? 0);
    prevX = x;
    prevF = f;
    out[i] = f;
  }
  return out;
}
