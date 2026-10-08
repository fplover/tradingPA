import type { S } from './series';
import { type FnDef, undef } from './ta-shared';

/**
 * math.* 注册表（abs/max/min/round/floor/ceil/sqrt/log/log10/sign）：
 * 逐元素映射与二元运算，空洞不产出。条目为声明式数据，
 * 装配与统一分发在 taFunctions.ts。
 */

function baseMathBin(a: S, b: S, f: (x: number, y: number) => number): S {
  const out = undef(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x !== undefined && y !== undefined) out[i] = f(x, y);
  }
  return out;
}

export const FNS_MATH: Record<string, FnDef> = {
  'math.abs': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.abs(v))) },
  'math.max': { min: 2, max: 2, tuple: false, fn: (a) => baseMathBin(a[0], a[1], Math.max) },
  'math.min': { min: 2, max: 2, tuple: false, fn: (a) => baseMathBin(a[0], a[1], Math.min) },
  'math.round': {
    min: 1,
    max: 1,
    tuple: false,
    fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.round(v))),
  },
  'math.floor': {
    min: 1,
    max: 1,
    tuple: false,
    fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.floor(v))),
  },
  'math.ceil': {
    min: 1,
    max: 1,
    tuple: false,
    fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.ceil(v))),
  },
  'math.sqrt': {
    min: 1,
    max: 1,
    tuple: false,
    fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.sqrt(v))),
  },
  'math.log': { min: 1, max: 1, tuple: false, fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.log(v))) },
  'math.log10': {
    min: 1,
    max: 1,
    tuple: false,
    fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.log10(v))),
  },
  'math.sign': {
    min: 1,
    max: 1,
    tuple: false,
    fn: (a) => a[0].map((v) => (v === undefined ? undefined : Math.sign(v))),
  },
};
