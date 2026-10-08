import { ops, ta as baseTa, toSeries } from './series';
import * as barsTa from './taCore';
import { bbT, type FnDef, intArg, macdT, scalar, undef } from './ta-shared';

/**
 * ta.* K 线依赖族 + 多输出元组族注册表（tr/atr/adx/cci/mfi/wpr/psar/supertrend/
 * macd/bb/bbands/kc/donchian）。
 * 依赖 OHLCV 的实现在 taCore.ts，序列运算复用 series.ts 与 ta-shared.ts；
 * 条目为声明式数据，装配与统一分发在 taFunctions.ts。
 */

export const FNS_MOMENTUM: Record<string, FnDef> = {
  // 新增：K 线依赖
  'ta.tr': { min: 0, max: 1, tuple: false, fn: (_a, c) => barsTa.trueRange(c.bars) },
  'ta.atr': { min: 1, max: 1, tuple: false, fn: (a, c) => barsTa.atrSeries(c.bars, intArg(a, 'ta.atr', 0)) },
  'ta.adx': {
    min: 2,
    max: 2,
    tuple: false,
    fn: (a, c) => barsTa.adxSeries(c.bars, intArg(a, 'ta.adx', 0), intArg(a, 'ta.adx', 1)),
  },
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
    fn: (a) =>
      macdT(a[0], intArg(a, 'ta.macd', 1), intArg(a, 'ta.macd', 2), a.length > 3 ? intArg(a, 'ta.macd', 3) : 9),
  },
  'ta.bb': {
    min: 2,
    max: 3,
    tuple: true,
    fn: (a) => bbT(a[0], intArg(a, 'ta.bb', 1), a.length > 2 ? scalar(a, 'ta.bb', 2) : 2),
  },
  'ta.bbands': {
    min: 2,
    max: 3,
    tuple: true,
    fn: (a) => bbT(a[0], intArg(a, 'ta.bbands', 1), a.length > 2 ? scalar(a, 'ta.bbands', 2) : 2),
  },
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
};
