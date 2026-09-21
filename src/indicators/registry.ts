import type { IndicatorDef } from './core/types';
import { trendIndicators } from './builtin/trend';
import { oscillatorIndicators } from './builtin/oscillators';
import { macdAdxIndicators } from './builtin/momentum';
import { channelIndicators } from './builtin/channels';
import { volumeIndicators } from './builtin/volume';

export const ALL_INDICATORS: IndicatorDef[] = [
  ...trendIndicators,
  ...oscillatorIndicators,
  ...macdAdxIndicators,
  ...channelIndicators,
  ...volumeIndicators,
];

export function getIndicatorDef(id: string): IndicatorDef | undefined {
  return ALL_INDICATORS.find((d) => d.id === id);
}

export function indicatorsByCategory(): Array<{ category: string; items: IndicatorDef[] }> {
  const map = new Map<string, IndicatorDef[]>();
  for (const def of ALL_INDICATORS) {
    const list = map.get(def.category) ?? [];
    list.push(def);
    map.set(def.category, list);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}
