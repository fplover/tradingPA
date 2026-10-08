import type { Bar } from '@/types/market';

/** 序列：与 bars 等长对齐，未就绪处为 undefined。布尔序列用 1/0 表示。 */
export type S = Array<number | undefined>;

const undef = (n: number): S => new Array<number | undefined>(n).fill(undefined);

function bin(a: S, b: S, f: (x: number, y: number) => number | undefined): S {
  const out = undef(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x !== undefined && y !== undefined) out[i] = f(x, y);
  }
  return out;
}

function lift(a: S, f: (x: number) => number): S {
  return a.map((v) => (v === undefined ? undefined : f(v)));
}

/** 布尔语境取真假：undefined（na）与 NaN 均为假（与 interpreter 的 if 条件同口径） */
function isNa(x: number | undefined): boolean {
  return x === undefined || Number.isNaN(x);
}

/** not：TV Pine 语义 not na = true（NaN 与 na 同口径） */
function notVal(x: number | undefined): number {
  return isNa(x) || x === 0 ? 1 : 0;
}

/**
 * and：TV Pine 语义——false and na = false（短路于假，洞不被预传播吞掉）；
 * true and na = na（条件语境为假）。NaN 与 na 同口径。
 */
function andVal(x: number | undefined, y: number | undefined): number | undefined {
  if (!isNa(x) && x === 0) return 0;
  if (!isNa(y) && y === 0) return 0;
  if (isNa(x) || isNa(y)) return undefined;
  return 1;
}

/** or：TV Pine 语义——true or na = true（短路于真）；false or na = na。NaN 与 na 同口径 */
function orVal(x: number | undefined, y: number | undefined): number | undefined {
  if (!isNa(x) && x !== 0) return 1;
  if (!isNa(y) && y !== 0) return 1;
  if (isNa(x) || isNa(y)) return undefined;
  return 0;
}

/** 布尔运算逐点求值：不预传播 undefined，na 的归宿由 and/or 自行决定 */
function binBool(a: S, b: S, f: (x: number | undefined, y: number | undefined) => number | undefined): S {
  const out = undef(a.length);
  for (let i = 0; i < a.length; i++) out[i] = f(a[i], b[i]);
  return out;
}

/** 将操作数统一为序列（标量广播） */
export function toSeries(v: S | number, n: number): S {
  if (typeof v === 'number') return new Array<number | undefined>(n).fill(v);
  return v;
}

export const ops = {
  add: (a: S, b: S) => bin(a, b, (x, y) => x + y),
  sub: (a: S, b: S) => bin(a, b, (x, y) => x - y),
  mul: (a: S, b: S) => bin(a, b, (x, y) => x * y),
  div: (a: S, b: S) => bin(a, b, (x, y) => (y === 0 ? undefined : x / y)),
  gt: (a: S, b: S) => bin(a, b, (x, y) => (x > y ? 1 : 0)),
  lt: (a: S, b: S) => bin(a, b, (x, y) => (x < y ? 1 : 0)),
  gte: (a: S, b: S) => bin(a, b, (x, y) => (x >= y ? 1 : 0)),
  lte: (a: S, b: S) => bin(a, b, (x, y) => (x <= y ? 1 : 0)),
  eq: (a: S, b: S) => bin(a, b, (x, y) => (x === y ? 1 : 0)),
  and: (a: S, b: S) => binBool(a, b, andVal),
  or: (a: S, b: S) => binBool(a, b, orVal),
  neg: (a: S) => lift(a, (x) => -x),
  not: (a: S) => a.map(notVal),
};

function rolling(a: S, n: number, f: (win: number[]) => number): S {
  const out = undef(a.length);
  const win: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === undefined) {
      win.push(NaN);
    } else {
      win.push(v);
    }
    if (win.length > n) win.shift();
    if (win.length === n && win.every((x) => !Number.isNaN(x))) out[i] = f(win);
  }
  return out;
}

export const ta = {
  sma: (a: S, n: number) => rolling(a, n, (w) => w.reduce((s, x) => s + x, 0) / n),
  ema: (a: S, n: number) => {
    const out = undef(a.length);
    const k = 2 / (n + 1);
    let prev: number | undefined;
    let seedSum = 0;
    let seedCount = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (v === undefined) continue;
      if (prev === undefined) {
        seedSum += v;
        seedCount += 1;
        if (seedCount === n) {
          prev = seedSum / n;
          out[i] = prev;
        }
        continue;
      }
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  },
  rsi: (a: S, n: number) => {
    const out = undef(a.length);
    let avgG = 0;
    let avgL = 0;
    let init = 0;
    let gSum = 0;
    let lSum = 0;
    for (let i = 1; i < a.length; i++) {
      const cur = a[i];
      const prev = a[i - 1];
      if (cur === undefined || prev === undefined) continue;
      const ch = cur - prev;
      const g = Math.max(ch, 0);
      const l = Math.max(-ch, 0);
      if (init < n) {
        gSum += g;
        lSum += l;
        init += 1;
        if (init === n) {
          avgG = gSum / n;
          avgL = lSum / n;
          out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
        }
        continue;
      }
      avgG = (avgG * (n - 1) + g) / n;
      avgL = (avgL * (n - 1) + l) / n;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
  },
  stdev: (a: S, n: number) =>
    rolling(a, n, (w) => {
      const m = w.reduce((s, x) => s + x, 0) / n;
      return Math.sqrt(w.reduce((s, x) => s + (x - m) * (x - m), 0) / n);
    }),
  highest: (a: S, n: number) => rolling(a, n, (w) => Math.max(...w)),
  lowest: (a: S, n: number) => rolling(a, n, (w) => Math.min(...w)),
  change: (a: S, n = 1) => {
    const out = undef(a.length);
    for (let i = n; i < a.length; i++) {
      const cur = a[i];
      const prev = a[i - n];
      if (cur !== undefined && prev !== undefined) out[i] = cur - prev;
    }
    return out;
  },
  crossover: (a: S, b: S) => {
    const out = undef(a.length);
    for (let i = 1; i < a.length; i++) {
      const a0 = a[i - 1];
      const a1 = a[i];
      const b0 = b[i - 1];
      const b1 = b[i];
      if (a0 !== undefined && a1 !== undefined && b0 !== undefined && b1 !== undefined) {
        out[i] = a0 <= b0 && a1 > b1 ? 1 : 0;
      }
    }
    return out;
  },
  crossunder: (a: S, b: S) => {
    const out = undef(a.length);
    for (let i = 1; i < a.length; i++) {
      const a0 = a[i - 1];
      const a1 = a[i];
      const b0 = b[i - 1];
      const b1 = b[i];
      if (a0 !== undefined && a1 !== undefined && b0 !== undefined && b1 !== undefined) {
        out[i] = a0 >= b0 && a1 < b1 ? 1 : 0;
      }
    }
    return out;
  },
  nz: (a: S, repl = 0) => a.map((v) => (v === undefined ? repl : v)),
};

export const math = {
  abs: (a: S) => lift(a, Math.abs),
  max: (a: S, b: S) => bin(a, b, Math.max),
  min: (a: S, b: S) => bin(a, b, Math.min),
  round: (a: S) => lift(a, Math.round),
  floor: (a: S) => lift(a, Math.floor),
  ceil: (a: S) => lift(a, Math.ceil),
  sqrt: (a: S) => lift(a, Math.sqrt),
  log: (a: S) => lift(a, Math.log),
  log10: (a: S) => lift(a, Math.log10),
  sign: (a: S) => lift(a, Math.sign),
};

/** 由 K 线生成的内置源序列 */
export function sourceSeries(bars: readonly Bar[], name: string): S | null {
  switch (name) {
    case 'open':
      return bars.map((b) => b.open);
    case 'high':
      return bars.map((b) => b.high);
    case 'low':
      return bars.map((b) => b.low);
    case 'close':
      return bars.map((b) => b.close);
    case 'volume':
      return bars.map((b) => b.volume);
    case 'hl2':
      return bars.map((b) => (b.high + b.low) / 2);
    case 'hlc3':
      return bars.map((b) => (b.high + b.low + b.close) / 3);
    case 'ohlc4':
      return bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
    default:
      return null;
  }
}

export const COLORS: Record<string, string> = {
  'color.aqua': '#00bcd4',
  'color.black': '#000000',
  'color.blue': '#2196f3',
  'color.fuchsia': '#e91e63',
  'color.gray': '#9e9e9e',
  'color.green': '#4caf50',
  'color.lime': '#cddc39',
  'color.maroon': '#795548',
  'color.navy': '#3f51b5',
  'color.olive': '#808000',
  'color.orange': '#ff9800',
  'color.purple': '#9c27b0',
  'color.red': '#f44336',
  'color.silver': '#c0c0c0',
  'color.teal': '#009688',
  'color.white': '#ffffff',
  'color.yellow': '#ffeb3b',
};
