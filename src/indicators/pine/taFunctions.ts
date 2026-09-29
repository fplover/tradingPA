import type { Bar } from '@/types/market';
import { ops, ta as baseTa, toSeries, type S } from './series';
import { wma as coreWma, wilder as coreWilder } from '../core/math';
import * as barsTa from './taCore';

/**
 * Pine 子集函数注册表与统一分发：ta.*（既有 10 个 + 新增 ~21 个）与 math.*。
 * 窗口/序列数学优先复用 series.ts 与 core/math（同源，不重复实现）；
 * 依赖 OHLCV 的实现在 taCore.ts。
 */

export interface TaCtx {
  bars: readonly Bar[];
}

interface FnDef {
  min: number;
  max: number;
  /** 返回元组（须配合 [a, b, ...] 解构赋值使用） */
  tuple: boolean;
  fn: (args: S[], ctx: TaCtx) => S | S[];
}

const undef = (n: number): S => new Array<number | undefined>(n).fill(undefined);

/** 取标量参数：对应实参序列最后一个元素必须为数值（常量序列） */
function scalar(args: S[], fnName: string, idx: number): number {
  const a = args[idx];
  const v = a?.[a.length - 1];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`「${fnName}」第 ${idx + 1} 个参数需为常量`);
  }
  return v;
}

function intArg(args: S[], fnName: string, idx: number): number {
  const v = scalar(args, fnName, idx);
  if (!Number.isInteger(v) || v < 1) throw new Error(`「${fnName}」第 ${idx + 1} 个参数需为正整数`);
  return v;
}

/** 窗口滚动：窗口内含 undefined → 输出 undefined */
function rolling(a: S, n: number, f: (win: number[]) => number): S {
  const out = undef(a.length);
  const win: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === undefined) {
      win.length = 0; // 窗口含洞即作废重来
      continue;
    }
    win.push(v);
    if (win.length > n) win.shift();
    if (win.length === n) out[i] = f(win);
  }
  return out;
}
const mulC = (a: S, k: number): S => ops.mul(a, toSeries(k, a.length));

// ---------- 新增 ta 实现（非 K 线依赖部分） ----------

const wmaS = (a: S, n: number): S => rolling(a, n, (w) => coreWma(w, n)![n - 1] as number);

/** hma = wma(2·wma(x, n/2) - wma(x, n), √n)（Pine 整数除法截断） */
const hmaS = (a: S, n: number): S => {
  const half = Math.max(1, Math.floor(n / 2));
  const raw = ops.sub(mulC(wmaS(a, half), 2), wmaS(a, n));
  return wmaS(raw, Math.max(1, Math.round(Math.sqrt(n))));
};

/** rma（Wilder 平滑）：稠密输入复用 core.wilder（与内置指标同源） */
const rmaS = (a: S, n: number): S => {
  if (a.every((v) => v !== undefined)) return coreWilder(a as unknown as number[], n);
  const out = undef(a.length);
  let prev: number | undefined;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === undefined) continue;
    if (prev === undefined) {
      // 种子：首个有效值起累计 n 个（含空洞跳过）
      let sum = 0;
      let cnt = 0;
      let j = i;
      for (; j < a.length && cnt < n; j++) {
        const w = a[j];
        if (w === undefined) continue;
        sum += w;
        cnt++;
      }
      if (cnt < n) return out;
      prev = sum / n;
      out[j - 1] = prev;
      i = j - 1;
      continue;
    }
    prev = (prev * (n - 1) + v) / n;
    out[i] = prev;
  }
  return out;
};

const demaS = (a: S, n: number): S => {
  const e1 = baseTa.ema(a, n);
  return ops.sub(mulC(e1, 2), baseTa.ema(e1, n));
};

const temaS = (a: S, n: number): S => {
  const e1 = baseTa.ema(a, n);
  const e2 = baseTa.ema(e1, n);
  const e3 = baseTa.ema(e2, n);
  return ops.add(ops.sub(mulC(e1, 3), mulC(e2, 3)), e3);
};

/** linreg：窗口线性回归当前值（offset 向前回溯） */
const linregS = (a: S, n: number, offset: number): S =>
  rolling(a, n, (w) => {
    const mx = (n - 1) / 2;
    let my = 0;
    for (const y of w) my += y;
    my /= n;
    let cov = 0;
    let varX = 0;
    for (let k = 0; k < n; k++) {
      cov += (k - mx) * (w[k] - my);
      varX += (k - mx) * (k - mx);
    }
    const slope = cov / varX;
    return my + slope * (n - 1 - mx - offset);
  });

/** tsi = 100 × EMA(EMA(Δsrc, long), short) / EMA(EMA(|Δsrc|, long), short) */
const tsiS = (a: S, short: number, long: number): S => {
  const mom = baseTa.change(a, 1);
  const smooth = (s: S): S => baseTa.ema(baseTa.ema(s, long), short);
  const num = smooth(mom);
  const den = smooth(mom.map((v) => (v === undefined ? undefined : Math.abs(v))));
  const out = undef(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = num[i];
    const y = den[i];
    if (x !== undefined && y !== undefined && y !== 0) out[i] = (100 * x) / y;
  }
  return out;
};

/** macd → [dif, dea, hist]（dif = EMA快 - EMA慢；dea = EMA(dif, signal)） */
const macdT = (a: S, fast: number, slow: number, signal: number): [S, S, S] => {
  const dif = ops.sub(baseTa.ema(a, fast), baseTa.ema(a, slow));
  const dea = baseTa.ema(dif, signal);
  const hist = ops.sub(dif, dea);
  return [dif, dea, hist];
};

const bbT = (a: S, n: number, mult: number): [S, S, S] => {
  const mid = baseTa.sma(a, n);
  const dev = baseTa.stdev(a, n);
  const d = ops.mul(dev, toSeries(mult, a.length));
  return [mid, ops.add(mid, d), ops.sub(mid, d)];
};

// ---------- 注册表 ----------

export const FNS: Record<string, FnDef> = {
  // 既有 10 个（复用 series.ts 实现）
  'ta.sma': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.sma(a[0], intArg(a, 'ta.sma', 1)) },
  'ta.ema': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.ema(a[0], intArg(a, 'ta.ema', 1)) },
  'ta.rsi': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.rsi(a[0], intArg(a, 'ta.rsi', 1)) },
  'ta.stdev': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.stdev(a[0], intArg(a, 'ta.stdev', 1)) },
  'ta.highest': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.highest(a[0], intArg(a, 'ta.highest', 1)) },
  'ta.lowest': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.lowest(a[0], intArg(a, 'ta.lowest', 1)) },
  'ta.change': { min: 1, max: 2, tuple: false, fn: (a) => baseTa.change(a[0], a.length > 1 ? intArg(a, 'ta.change', 1) : 1) },
  'ta.crossover': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.crossover(a[0], a[1]) },
  'ta.crossunder': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.crossunder(a[0], a[1]) },
  'ta.nz': { min: 1, max: 2, tuple: false, fn: (a) => baseTa.nz(a[0], a.length > 1 ? scalar(a, 'ta.nz', 1) : 0) },
  // 新增：均线族
  'ta.wma': { min: 2, max: 2, tuple: false, fn: (a) => wmaS(a[0], intArg(a, 'ta.wma', 1)) },
  'ta.hma': { min: 2, max: 2, tuple: false, fn: (a) => hmaS(a[0], intArg(a, 'ta.hma', 1)) },
  'ta.vwma': {
    min: 2,
    max: 2,
    tuple: false,
    fn: (a, c) => {
      const n = intArg(a, 'ta.vwma', 1);
      const vol: S = c.bars.map((b) => b.volume);
      const num = baseTa.sma(ops.mul(a[0], vol), n);
      const den = baseTa.sma(vol, n);
      const out = undef(a[0].length);
      for (let i = 0; i < out.length; i++) {
        const x = num[i];
        const y = den[i];
        if (x !== undefined && y !== undefined && y !== 0) out[i] = x / y;
      }
      return out;
    },
  },
  'ta.dema': { min: 2, max: 2, tuple: false, fn: (a) => demaS(a[0], intArg(a, 'ta.dema', 1)) },
  'ta.tema': { min: 2, max: 2, tuple: false, fn: (a) => temaS(a[0], intArg(a, 'ta.tema', 1)) },
  'ta.rma': { min: 2, max: 2, tuple: false, fn: (a) => rmaS(a[0], intArg(a, 'ta.rma', 1)) },
  'ta.linreg': { min: 2, max: 3, tuple: false, fn: (a) => linregS(a[0], intArg(a, 'ta.linreg', 1), a.length > 2 ? scalar(a, 'ta.linreg', 2) : 0) },
  'ta.tsi': { min: 1, max: 3, tuple: false, fn: (a) => tsiS(a[0], a.length > 1 ? intArg(a, 'ta.tsi', 1) : 13, a.length > 2 ? intArg(a, 'ta.tsi', 2) : 25) },
  'ta.fisher': { min: 2, max: 2, tuple: false, fn: (a) => barsTa.fisherSeries(a[0], intArg(a, 'ta.fisher', 1)) },
  // 新增：K 线依赖
  'ta.tr': { min: 0, max: 1, tuple: false, fn: (_a, c) => barsTa.trueRange(c.bars) },
  'ta.atr': { min: 1, max: 1, tuple: false, fn: (a, c) => barsTa.atrSeries(c.bars, intArg(a, 'ta.atr', 0)) },
  'ta.adx': { min: 2, max: 2, tuple: false, fn: (a, c) => barsTa.adxSeries(c.bars, intArg(a, 'ta.adx', 0), intArg(a, 'ta.adx', 1)) },
  'ta.cci': { min: 1, max: 1, tuple: false, fn: (a, c) => barsTa.cciSeries(c.bars, intArg(a, 'ta.cci', 0)) },
  'ta.mfi': { min: 1, max: 1, tuple: false, fn: (a, c) => barsTa.mfiSeries(c.bars, intArg(a, 'ta.mfi', 0)) },
  'ta.wpr': { min: 1, max: 1, tuple: false, fn: (a, c) => barsTa.wprSeries(c.bars, intArg(a, 'ta.wpr', 0)) },
  'ta.psar': {
    min: 3,
    max: 3,
    tuple: false,
    fn: (a, c) => barsTa.psarSeries(c.bars, scalar(a, 'ta.psar', 0), scalar(a, 'ta.psar', 1), scalar(a, 'ta.psar', 2)),
  },
  'ta.supertrend': {
    min: 2,
    max: 2,
    tuple: true,
    fn: (a, c) => barsTa.supertrendSeries(c.bars, scalar(a, 'ta.supertrend', 0), intArg(a, 'ta.supertrend', 1)),
  },
  // 新增：多输出（元组）
  'ta.macd': {
    min: 3,
    max: 4,
    tuple: true,
    fn: (a) => macdT(a[0], intArg(a, 'ta.macd', 1), intArg(a, 'ta.macd', 2), a.length > 3 ? intArg(a, 'ta.macd', 3) : 9),
  },
  'ta.bb': { min: 2, max: 3, tuple: true, fn: (a) => bbT(a[0], intArg(a, 'ta.bb', 1), a.length > 2 ? scalar(a, 'ta.bb', 2) : 2) },
  'ta.bbands': { min: 2, max: 3, tuple: true, fn: (a) => bbT(a[0], intArg(a, 'ta.bbands', 1), a.length > 2 ? scalar(a, 'ta.bbands', 2) : 2) },
  'ta.kc': {
    min: 2,
    max: 3,
    tuple: true,
    fn: (a, c) => {
      const n = intArg(a, 'ta.kc', 1);
      const mult = a.length > 2 ? scalar(a, 'ta.kc', 2) : 2;
      const mid = baseTa.ema(a[0], n);
      const range = barsTa.atrSeries(c.bars, n);
      const d = ops.mul(range, toSeries(mult, mid.length));
      return [mid, ops.add(mid, d), ops.sub(mid, d)];
    },
  },
  'ta.donchian': {
    min: 1,
    max: 1,
    tuple: true,
    fn: (a, c) => {
      const n = intArg(a, 'ta.donchian', 0);
      const bars = c.bars;
      const upper = undef(bars.length);
      const lower = undef(bars.length);
      const mid = undef(bars.length);
      for (let i = n - 1; i < bars.length; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let k = i - n + 1; k <= i; k++) {
          if (bars[k].high > hh) hh = bars[k].high;
          if (bars[k].low < ll) ll = bars[k].low;
        }
        upper[i] = hh;
        lower[i] = ll;
        mid[i] = (hh + ll) / 2;
      }
      return [mid, upper, lower];
    },
  },
  // math.*
  'math.abs': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.abs(v))) },
  'math.max': { min: 2, max: 2, tuple: false, fn: (a) => baseMathBin(a[0], a[1], Math.max) },
  'math.min': { min: 2, max: 2, tuple: false, fn: (a) => baseMathBin(a[0], a[1], Math.min) },
  'math.round': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.round(v))) },
  'math.floor': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.floor(v))) },
  'math.ceil': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.ceil(v))) },
  'math.sqrt': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.sqrt(v))) },
  'math.log': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.log(v))) },
  'math.log10': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.log10(v))) },
  'math.sign': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.sign(v))) },
};

function baseMathBin(a: S, b: S, f: (x: number, y: number) => number): S {
  const out = undef(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x !== undefined && y !== undefined) out[i] = f(x, y);
  }
  return out;
}

export const PINE_FN_NAMES: ReadonlySet<string> = new Set(Object.keys(FNS));

/** 统一函数分发：ta.* / math.*；未知函数由调用方（validate/解释器）报错 */
export function callFunction(name: string, args: S[], ctx: TaCtx): S | S[] {
  const def = FNS[name];
  if (!def) throw new Error(`不支持的函数「${name}」`);
  if (args.length < def.min || args.length > def.max) {
    throw new Error(`「${name}」参数数量应为 ${def.min}${def.max !== def.min ? `-${def.max}` : ''}，实际 ${args.length}`);
  }
  return def.fn(args, ctx);
}
