import { ops, ta as baseTa, type S } from './series';
import * as barsTa from './taCore';
import { demaS, type FnDef, hmaS, intArg, linregS, rmaS, scalar, temaS, tsiS, undef, wmaS } from './ta-shared';

/**
 * ta.* 单序列族注册表：既有 10 个（复用 series.ts 实现）+ 均线族
 * （wma/hma/vwma/dema/tema/rma/linreg/tsi/fisher）。
 * 条目为「参数校验 + 调用实现」的声明式数据；装配与统一分发在 taFunctions.ts，
 * 共享层（类型/参数校验/序列实现）在 ta-shared.ts。
 */

export const FNS_OVERLAP: Record<string, FnDef> = {
  // 既有 10 个（复用 series.ts 实现）
  'ta.sma': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.sma(a[0], intArg(a, 'ta.sma', 1)) },
  'ta.ema': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.ema(a[0], intArg(a, 'ta.ema', 1)) },
  'ta.rsi': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.rsi(a[0], intArg(a, 'ta.rsi', 1)) },
  'ta.stdev': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.stdev(a[0], intArg(a, 'ta.stdev', 1)) },
  'ta.highest': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.highest(a[0], intArg(a, 'ta.highest', 1)) },
  'ta.lowest': { min: 2, max: 2, tuple: false, fn: (a) => baseTa.lowest(a[0], intArg(a, 'ta.lowest', 1)) },
  'ta.change': {
    min: 1,
    max: 2,
    tuple: false,
    fn: (a) => baseTa.change(a[0], a.length > 1 ? intArg(a, 'ta.change', 1) : 1),
  },
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
  'ta.linreg': {
    min: 2,
    max: 3,
    tuple: false,
    fn: (a) => linregS(a[0], intArg(a, 'ta.linreg', 1), a.length > 2 ? scalar(a, 'ta.linreg', 2) : 0),
  },
  'ta.tsi': {
    min: 1,
    max: 3,
    tuple: false,
    fn: (a) => tsiS(a[0], a.length > 1 ? intArg(a, 'ta.tsi', 1) : 13, a.length > 2 ? intArg(a, 'ta.tsi', 2) : 25),
  },
  'ta.fisher': { min: 2, max: 2, tuple: false, fn: (a) => barsTa.fisherSeries(a[0], intArg(a, 'ta.fisher', 1)) },
};
