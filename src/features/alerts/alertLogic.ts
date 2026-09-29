import { getIndicatorDef } from '@/indicators/registry';

// ---------- 类型 ----------

/** 警报作用对象：价格 或 指标某条 plot 的值 */
export type AlertSource =
  | { type: 'price' }
  | { type: 'indicator'; indicatorId: string; plotKey: string };

export type AlertCondition = 'greater' | 'less' | 'crossUp' | 'crossDown';
export type AlertFrequency = 'once' | 'every';

/** 警报 v2 schema（v1 {price,direction} 由 migrateAlerts 迁移） */
export interface PriceAlert {
  id: string;
  symbol: string;
  source: AlertSource;
  /** 触发阈值（价格警报 = 目标价；指标警报 = 指标值阈值） */
  threshold: number;
  condition: AlertCondition;
  active: boolean;
  triggered: boolean;
  createdAt: number;
  frequency: AlertFrequency;
  /** every 模式重复触发冷却（毫秒） */
  cooldownMs: number;
  /** 过期时间戳；到期自动停用 */
  expiresAt?: number;
  lastFiredAt?: number;
}

export interface AlertSample {
  /** 采样键：sampleKey(symbol, source) */
  key: string;
  value: number;
}

export interface FiredAlert {
  alert: PriceAlert;
  value: number;
}

export interface CheckResult {
  fired: FiredAlert[];
  /** 有变化时返回新数组（未变化返回原引用） */
  alerts: PriceAlert[];
  /** 本轮全部采样（供下一轮穿越检测） */
  lastSeen: Record<string, number>;
}

// ---------- 常量 / 选项 ----------

export const DEFAULT_COOLDOWN_MS = 30_000;
export const MIN_COOLDOWN_MS = 10_000;

export const CONDITION_LABELS: Record<AlertCondition, string> = {
  greater: '大于',
  less: '小于',
  crossUp: '上穿',
  crossDown: '下穿',
};

export const CONDITION_OPTIONS = (Object.keys(CONDITION_LABELS) as AlertCondition[]).map((v) => ({
  value: v,
  label: CONDITION_LABELS[v],
}));

export const FREQUENCY_OPTIONS: Array<{ value: AlertFrequency; label: string }> = [
  { value: 'once', label: '仅一次' },
  { value: 'every', label: '每次' },
];

// ToolbarSelect 选项 value 为 string：毫秒档位以字符串承载，用时 Number() 还原
export const COOLDOWN_OPTIONS = [30_000, 60_000, 300_000].map((ms) => ({
  value: String(ms),
  label: ms < 60_000 ? `${ms / 1000} 秒` : `${ms / 60_000} 分钟`,
}));

/** 过期档位（value 为毫秒字符串；'0' = 不过期） */
export const EXPIRY_OPTIONS = [0, 30 * 60_000, 3_600_000, 4 * 3_600_000, 24 * 3_600_000, 7 * 24 * 3_600_000].map(
  (ms) => ({
    value: String(ms),
    label: ms === 0 ? '不过期' : ms < 3_600_000 ? `${ms / 60_000} 分钟` : `${ms / 3_600_000} 小时`,
  }),
);

export function clampCooldown(ms: number): number {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_COOLDOWN_MS;
  return Math.max(MIN_COOLDOWN_MS, n);
}

// ---------- 描述 / 键 ----------

export function sourceKeyOf(src: AlertSource): string {
  return src.type === 'price' ? 'price' : `ind:${src.indicatorId}:${src.plotKey}`;
}

export function sampleKey(symbol: string, src: AlertSource): string {
  return `${symbol}:${sourceKeyOf(src)}`;
}

/** 作用对象可读名：`价格` 或 `RSI·RSI`（指标名·plot 名） */
export function describeSource(src: AlertSource): string {
  if (src.type === 'price') return '价格';
  const def = getIndicatorDef(src.indicatorId);
  const plot = def?.plots.find((p) => p.key === src.plotKey);
  return `${def?.name ?? src.indicatorId}·${plot?.label ?? src.plotKey}`;
}

export function describeCondition(condition: AlertCondition, threshold: number): string {
  switch (condition) {
    case 'greater':
      return `≥ ${threshold}`;
    case 'less':
      return `≤ ${threshold}`;
    case 'crossUp':
      return `上穿 ${threshold}`;
    case 'crossDown':
      return `下穿 ${threshold}`;
  }
}

export function describeAlert(a: PriceAlert): string {
  return `${a.symbol} ${describeSource(a.source)} ${describeCondition(a.condition, a.threshold)}`;
}

// ---------- 判定 ----------

export function isExpired(a: PriceAlert, now: number): boolean {
  return a.expiresAt !== undefined && now > a.expiresAt;
}

/**
 * 条件判定。greater/less 不依赖穿越（首个采样即判定）；
 * crossUp/crossDown 需要上一采样值（无上一采样时不触发，防误报）。
 */
export function evaluateCondition(
  condition: AlertCondition,
  threshold: number,
  value: number,
  prev: number | undefined,
): boolean {
  switch (condition) {
    case 'greater':
      return value >= threshold;
    case 'less':
      return value <= threshold;
    case 'crossUp':
      return prev !== undefined && prev < threshold && value >= threshold;
    case 'crossDown':
      return prev !== undefined && prev > threshold && value <= threshold;
    default:
      return false;
  }
}

/**
 * 纯函数警报检查：输入当前警报表 + 本轮采样 + 上一轮采样值，输出触发列表与
 * 新警报表。触发策略：once → 触发后停用；every → 受 cooldownMs 冷却约束可重复触发。
 * 过期警报一律停用（不触发）。暂停/其他品种警报不参与。
 */
export function runAlertCheck(
  alerts: PriceAlert[],
  symbol: string,
  samples: AlertSample[],
  prevSeen: Record<string, number>,
  now: number,
): CheckResult {
  const byKey = new Map(samples.map((s) => [s.key, s.value]));
  const lastSeen: Record<string, number> = {};
  const fired: FiredAlert[] = [];
  let changed = false;
  const next = alerts.map((a) => {
    if (a.symbol !== symbol || !a.active) return a;
    let cur = a;
    if (isExpired(cur, now)) {
      // 到期自动停用，且不再参与本轮触发判定
      cur = { ...cur, active: false };
      changed = true;
      return cur;
    }
    const key = sampleKey(symbol, cur.source);
    const value = byKey.get(key);
    if (value === undefined || !Number.isFinite(value)) return cur;
    lastSeen[key] = value;
    const cooled = cur.lastFiredAt === undefined || now - cur.lastFiredAt >= cur.cooldownMs;
    if (cooled && evaluateCondition(cur.condition, cur.threshold, value, prevSeen[key])) {
      cur =
        cur.frequency === 'once'
          ? { ...cur, active: false, triggered: true, lastFiredAt: now }
          : { ...cur, triggered: true, lastFiredAt: now };
      changed = true;
      fired.push({ alert: cur, value });
    }
    return cur;
  });
  return { fired, alerts: changed ? next : alerts, lastSeen };
}

// ---------- 持久化迁移 ----------

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
  if (!src || (src.type !== 'price' && src.type !== 'indicator')) return null;
  if (src.type === 'indicator' && (typeof src.indicatorId !== 'string' || typeof src.plotKey !== 'string')) return null;
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

export interface AlertsPayload {
  alerts: PriceAlert[];
  soundEnabled: boolean;
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
