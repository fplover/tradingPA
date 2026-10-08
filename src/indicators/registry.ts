import type { IndicatorDef } from './core/types';
import { trendMaIndicators } from './builtin/trend-ma';
import { Ichimoku } from './builtin/trend-ichimoku';
import { Supertrend } from './builtin/trend-supertrend';
import { oscillatorsRsiIndicators } from './builtin/oscillators-rsi';
import { oscillatorsRangeIndicators } from './builtin/oscillators-range';
import { oscillatorsMomentumIndicators } from './builtin/oscillators-momentum';
import { MACD } from './builtin/momentum-macd';
import { momentumAdxIndicators } from './builtin/momentum-adx';
import { ATR } from './builtin/momentum-atr';
import { channelIndicators } from './builtin/channels';
import { volumeIndicators } from './builtin/volume';
import { trendExtendedIndicators } from './builtin/trend-extended';
import { momentumBasicIndicators } from './builtin/momentum-extended';
import { momentumOscSmoothIndicators } from './builtin/momentum-osc-smooth';
import { Fisher } from './builtin/momentum-osc-fisher';
import { momentumOscRocIndicators } from './builtin/momentum-osc-roc';
import { volatilityIndicators } from './builtin/volatility';
import { volumeExtendedIndicators } from './builtin/volume-extended';
import { profileIndicators } from './builtin/profile';
import { AVWAP } from './builtin/avwap';

export const ALL_INDICATORS: IndicatorDef[] = [
  // 趋势：MA 族 / Ichimoku / Supertrend（原 trend.ts 按族拆分，顺序不变）
  ...trendMaIndicators,
  Ichimoku,
  Supertrend,
  // 震荡：RSI/Stoch 族 / 区间位置族 / 动量振荡族（原 oscillators.ts 按子族拆分，顺序不变）
  ...oscillatorsRsiIndicators,
  ...oscillatorsRangeIndicators,
  ...oscillatorsMomentumIndicators,
  // 动量：MACD / ADX 族 / ATR（原 momentum.ts 按族拆分，顺序不变）
  MACD,
  ...momentumAdxIndicators,
  ATR,
  ...channelIndicators,
  ...volumeIndicators,
  ...trendExtendedIndicators,
  ...momentumBasicIndicators,
  // 动量震荡：平滑族 / Fisher / ROC 族（原 momentum-osc.ts 按子族拆分，顺序不变）
  ...momentumOscSmoothIndicators,
  Fisher,
  ...momentumOscRocIndicators,
  ...volatilityIndicators,
  ...volumeExtendedIndicators,
  ...profileIndicators,
  // P2-B：Anchored VWAP（锚定 bar 由画线锚定落点交互写入 params.anchorTime）
  AVWAP,
];

/** 自定义指标（Pine 子集编译产物）：运行时注册，与内置指标同管线 */
const customDefs = new Map<string, IndicatorDef>();

export function registerCustomDef(def: IndicatorDef): void {
  customDefs.set(def.id, def);
}

export function unregisterCustomDef(id: string): void {
  customDefs.delete(id);
}

function allDefs(): IndicatorDef[] {
  return customDefs.size === 0 ? ALL_INDICATORS : [...ALL_INDICATORS, ...customDefs.values()];
}

export function getIndicatorDef(id: string): IndicatorDef | undefined {
  return allDefs().find((d) => d.id === id);
}

export function indicatorsByCategory(): Array<{ category: string; items: IndicatorDef[] }> {
  const map = new Map<string, IndicatorDef[]>();
  for (const def of allDefs()) {
    const list = map.get(def.category) ?? [];
    list.push(def);
    map.set(def.category, list);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}
