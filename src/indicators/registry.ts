import type { IndicatorDef } from './core/types';
import { trendIndicators } from './builtin/trend';
import { oscillatorIndicators } from './builtin/oscillators';
import { macdAdxIndicators } from './builtin/momentum';
import { channelIndicators } from './builtin/channels';
import { volumeIndicators } from './builtin/volume';
import { trendExtendedIndicators } from './builtin/trend-extended';
import { momentumBasicIndicators } from './builtin/momentum-extended';
import { momentumOscIndicators } from './builtin/momentum-osc';
import { volatilityIndicators } from './builtin/volatility';
import { volumeExtendedIndicators } from './builtin/volume-extended';
import { profileIndicators } from './builtin/profile';
import { AVWAP } from './builtin/avwap';

export const ALL_INDICATORS: IndicatorDef[] = [
  ...trendIndicators,
  ...oscillatorIndicators,
  ...macdAdxIndicators,
  ...channelIndicators,
  ...volumeIndicators,
  ...trendExtendedIndicators,
  ...momentumBasicIndicators,
  ...momentumOscIndicators,
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
