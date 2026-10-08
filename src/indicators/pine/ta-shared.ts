import type { Bar } from '@/types/market';
import { ops, ta as baseTa, toSeries, type S } from './series';
import { wma as coreWma, wilder as coreWilder } from '../core/math';

/**
 * Pine ta.* 注册表共享层：类型定义、参数校验助手与序列实现。
 * 函数族文件（ta-overlap / ta-momentum / ta-math）只依赖本文件、彼此不依赖，
 * 避免注册表合并处出现循环 import。
 */

export interface TaCtx {
  bars: readonly Bar[];
}

export interface FnDef {
  min: number;
  max: number;
  /** 返回元组（须配合 [a, b, ...] 解构赋值使用） */
  tuple: boolean;
  fn: (args: S[], ctx: TaCtx) => S | S[];
}

export const undef = (n: number): S => new Array<number | undefined>(n).fill(undefined);

/** 取标量参数：对应实参序列最后一个元素必须为数值（常量序列） */
export function scalar(args: S[], fnName: string, idx: number): number {
  const a = args[idx];
  const v = a?.[a.length - 1];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`「${fnName}」第 ${idx + 1} 个参数需为常量`);
  }
  return v;
}

export function intArg(args: S[], fnName: string, idx: number): number {
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

export const wmaS = (a: S, n: number): S => rolling(a, n, (w) => coreWma(w, n)![n - 1] as number);

/** hma = wma(2·wma(x, n/2) - wma(x, n), √n)（Pine 整数除法截断） */
export const hmaS = (a: S, n: number): S => {
  const half = Math.max(1, Math.floor(n / 2));
  const raw = ops.sub(mulC(wmaS(a, half), 2), wmaS(a, n));
  return wmaS(raw, Math.max(1, Math.round(Math.sqrt(n))));
};

/** rma（Wilder 平滑）：稠密输入复用 core.wilder（与内置指标同源） */
export const rmaS = (a: S, n: number): S => {
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

export const demaS = (a: S, n: number): S => {
  const e1 = baseTa.ema(a, n);
  return ops.sub(mulC(e1, 2), baseTa.ema(e1, n));
};

export const temaS = (a: S, n: number): S => {
  const e1 = baseTa.ema(a, n);
  const e2 = baseTa.ema(e1, n);
  const e3 = baseTa.ema(e2, n);
  return ops.add(ops.sub(mulC(e1, 3), mulC(e2, 3)), e3);
};

/** linreg：窗口线性回归当前值（offset 向前回溯） */
export const linregS = (a: S, n: number, offset: number): S =>
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
export const tsiS = (a: S, short: number, long: number): S => {
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
export const macdT = (a: S, fast: number, slow: number, signal: number): [S, S, S] => {
  const dif = ops.sub(baseTa.ema(a, fast), baseTa.ema(a, slow));
  const dea = baseTa.ema(dif, signal);
  const hist = ops.sub(dif, dea);
  return [dif, dea, hist];
};

export const bbT = (a: S, n: number, mult: number): [S, S, S] => {
  const mid = baseTa.sma(a, n);
  const dev = baseTa.stdev(a, n);
  const d = ops.mul(dev, toSeries(mult, a.length));
  return [mid, ops.add(mid, d), ops.sub(mid, d)];
};
