import { DEFAULT_COOLDOWN_MS, clampCooldown } from './alertLogic';
import type { AlertCondition, AlertSource, PriceAlert } from './alertLogic';

/**
 * 警报表持久化解析（自 alertLogic.ts 拆出，P2-A③：pine 条件源扩展；
 * P2-D②：line 画线水平线源扩展）。v1 顶层数组 {price, direction} →
 * v2 {version:2, soundEnabled, alerts}；v2 条目 source 支持
 * price / indicator / pine / line。
 */

export interface AlertsPayload {
  alerts: PriceAlert[];
  soundEnabled: boolean;
}

const LEGACY_DIRECTION: Record<string, AlertCondition> = { above: 'greater', below: 'less' };

/** v1 条目 {price, direction} → v2；行为与旧实现一致（阈值一侧即触发 + 仅一次） */
function migrateLegacyAlert(raw: Record<string, unknown>): PriceAlert | null {
  const price = raw.price;
  const direction = raw.direction;
  if (typeof price !== 'number' || !Number.isFinite(price) || typeof direction !== 'string') return null;
  const condition = LEGACY_DIRECTION[direction];
  if (!condition) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : `alert_migrated_${price}`,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : '',
    source: { type: 'price' },
    threshold: price,
    condition,
    active: raw.active !== false,
    triggered: raw.triggered === true,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    frequency: 'once',
    cooldownMs: DEFAULT_COOLDOWN_MS,
  };
}

function normalizeAlert(raw: Record<string, unknown>): PriceAlert | null {
  if (typeof raw.id !== 'string' || typeof raw.symbol !== 'string') return null;
  if (typeof raw.threshold !== 'number' || !Number.isFinite(raw.threshold)) return null;
  const src = raw.source as AlertSource | undefined;
  if (!src || (src.type !== 'price' && src.type !== 'indicator' && src.type !== 'pine' && src.type !== 'line')) return null;
  if (src.type === 'indicator' && (typeof src.indicatorId !== 'string' || typeof src.plotKey !== 'string')) return null;
  if (src.type === 'pine' && (typeof src.indicatorId !== 'string' || typeof src.key !== 'string')) return null;
  if (src.type === 'line' && typeof src.drawingId !== 'string') return null;
  const condition = raw.condition;
  if (condition !== 'greater' && condition !== 'less' && condition !== 'crossUp' && condition !== 'crossDown') return null;
  return {
    id: raw.id,
    symbol: raw.symbol,
    source: src,
    threshold: raw.threshold,
    condition,
    active: raw.active !== false,
    triggered: raw.triggered === true,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    frequency: raw.frequency === 'every' ? 'every' : 'once',
    cooldownMs: clampCooldown(typeof raw.cooldownMs === 'number' ? raw.cooldownMs : DEFAULT_COOLDOWN_MS),
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : undefined,
    lastFiredAt: typeof raw.lastFiredAt === 'number' ? raw.lastFiredAt : undefined,
  };
}

/**
 * 解析持久化数据：v2 `{version:2, soundEnabled, alerts}`；v1 顶层数组（旧行为
 * 阈值一侧即触发 → 迁移为 greater/less + once）；损坏条目跳过，整体损坏给空表。
 */
export function parseAlertsPayload(raw: string | null): AlertsPayload {
  if (!raw) return { alerts: [], soundEnabled: true };
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as { alerts?: unknown }).alerts)
        ? (parsed as { alerts: unknown[] }).alerts
        : null;
    if (!list) return { alerts: [], soundEnabled: true };
    const alerts: PriceAlert[] = [];
    for (const item of list) {
      if (item === null || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const migrated = 'source' in rec ? normalizeAlert(rec) : migrateLegacyAlert(rec);
      if (migrated) alerts.push(migrated);
    }
    const sound =
      !Array.isArray(parsed) &&
      parsed !== null &&
      typeof parsed === 'object' &&
      (parsed as { soundEnabled?: unknown }).soundEnabled === false
        ? false
        : true;
    return { alerts, soundEnabled: sound };
  } catch {
    return { alerts: [], soundEnabled: true };
  }
}
