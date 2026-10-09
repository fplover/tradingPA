import { getIndicatorDef } from '@/indicators/registry';
import { pineAlertsOf } from '@/indicators/pine/alerts';

// ---------- 类型 ----------

/** 警报作用对象：价格 / 指标某条 plot 的值 / Pine alertcondition 条件（P2-A③）/ 画线水平线（P2-D②） */
export type AlertSource =
  | { type: 'price' }
  | { type: 'indicator'; indicatorId: string; plotKey: string }
  | { type: 'pine'; indicatorId: string; key: string }
  | { type: 'line'; drawingId: string };

export type AlertCondition = 'greater' | 'less' | 'crossUp' | 'crossDown' | 'enterChannel' | 'exitChannel';
export type AlertFrequency = 'once' | 'every';

/** 警报 v2 schema（v1 {price,direction} 由 migrateAlerts 迁移） */
export interface PriceAlert {
  id: string;
  symbol: string;
  source: AlertSource;
  /** 触发阈值（价格警报 = 目标价；指标警报 = 指标值阈值；通道条件 = 下沿） */
  threshold: number;
  /** 通道条件（enterChannel/exitChannel）上沿；其余条件为 undefined */
  threshold2?: number;
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
  enterChannel: '进入区间',
  exitChannel: '离开区间',
};

/** 通道条件（阈值对：threshold=下沿、threshold2=上沿） */
export const CHANNEL_CONDITIONS: ReadonlySet<AlertCondition> = new Set(['enterChannel', 'exitChannel']);

export function isChannelCondition(c: AlertCondition): boolean {
  return CHANNEL_CONDITIONS.has(c);
}

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
  if (src.type === 'price') return 'price';
  if (src.type === 'pine') return `pine:${src.indicatorId}:${src.key}`;
  if (src.type === 'line') return `line:${src.drawingId}`;
  return `ind:${src.indicatorId}:${src.plotKey}`;
}

export function sampleKey(symbol: string, src: AlertSource): string {
  return `${symbol}:${sourceKeyOf(src)}`;
}

// ---------- 源解析 ----------

/**
 * 指标警报源解析（纯函数，AlertPanel 与单测共用）：plotKey 无效回退首个 plot；
 * 指标缺失或 plots 为空（无可用输出）→ null。空 plot 不静默降级为价格警报——
 * 调用方（AlertPanel）据此阻止创建并在 UI 明示「无可用输出」（用户口径 2026-10-08）。
 */
export function resolveIndicatorAlertSource(
  indicatorId: string,
  plotKey: string,
  def: { plots: readonly { key: string }[] } | undefined,
): Extract<AlertSource, { type: 'indicator' }> | null {
  const eff = def ? (def.plots.some((p) => p.key === plotKey) ? plotKey : (def.plots[0]?.key ?? '')) : '';
  if (!eff) return null;
  return { type: 'indicator', indicatorId, plotKey: eff };
}

/** 作用对象可读名：`价格` / `RSI·RSI`（指标名·plot 名）/ `指标名·条件标题`（Pine 条件）/ `画线水平线`（P2-D②） */
export function describeSource(src: AlertSource): string {
  if (src.type === 'price') return '价格';
  if (src.type === 'line') return '画线水平线';
  if (src.type === 'pine') {
    const entry = pineAlertsOf(src.indicatorId).find((e) => e.key === src.key);
    const def = getIndicatorDef(src.indicatorId);
    return `${def?.name ?? src.indicatorId}·${entry?.title || src.key}`;
  }
  const def = getIndicatorDef(src.indicatorId);
  const plot = def?.plots.find((p) => p.key === src.plotKey);
  return `${def?.name ?? src.indicatorId}·${plot?.label ?? src.plotKey}`;
}

export function describeCondition(condition: AlertCondition, threshold: number, threshold2?: number): string {
  switch (condition) {
    case 'greater':
      return `≥ ${threshold}`;
    case 'less':
      return `≤ ${threshold}`;
    case 'crossUp':
      return `上穿 ${threshold}`;
    case 'crossDown':
      return `下穿 ${threshold}`;
    case 'enterChannel': {
      const [lo, hi] = normChannel(threshold, threshold2);
      return `进入 ${lo}~${hi}`;
    }
    case 'exitChannel': {
      const [lo, hi] = normChannel(threshold, threshold2);
      return `离开 ${lo}~${hi}`;
    }
  }
}

/** 通道边界归一（上下沿可任意输入序），缺上沿时退化为单点区间 */
function normChannel(lo: number, hi?: number): [number, number] {
  const b = hi ?? lo;
  return lo <= b ? [lo, b] : [b, lo];
}

export function describeAlert(a: PriceAlert): string {
  // Pine 条件为布尔触发（阈值固定 1），描述走「条件为真」而非数值阈值；
  // line 源（P2-D②）阈值 = 水平线当前价，走下方数值路径（与 price 同构）
  const trig =
    a.source.type === 'pine'
      ? `${describeSource(a.source)} 条件为真`
      : `${describeSource(a.source)} ${describeCondition(a.condition, a.threshold, a.threshold2)}`;
  return `${a.symbol} ${trig}`;
}

// ---------- 判定 ----------

export function isExpired(a: PriceAlert, now: number): boolean {
  return a.expiresAt !== undefined && now > a.expiresAt;
}

/**
 * 条件判定。greater/less 不依赖穿越（首个采样即判定）；
 * crossUp/crossDown/enterChannel/exitChannel 属穿越族——需要上一采样值
 * （无上一采样时不触发，防误报）。
 */
export function evaluateCondition(
  condition: AlertCondition,
  threshold: number,
  value: number,
  prev: number | undefined,
  threshold2?: number,
): boolean {
  switch (condition) {
    case 'greater':
      return value >= threshold;
    case 'less':
      return value <= threshold;
    case 'crossUp':
      // 与本仓 Pine crossover 同式（x[1] <= y[1] and x > y）：prev == threshold 也算穿越，
      // 整数报价场景下旧式（prev < threshold）可复现漏报
      return prev !== undefined && prev <= threshold && value > threshold;
    case 'crossDown':
      return prev !== undefined && prev >= threshold && value < threshold;
    case 'enterChannel': {
      // TV「Entering Channel」：上一采样在区间外、当前进入区间内（双向：自下或自上）
      if (prev === undefined) return false;
      const [lo, hi] = normChannel(threshold, threshold2);
      return !(lo <= prev && prev <= hi) && lo <= value && value <= hi;
    }
    case 'exitChannel': {
      // TV「Exiting Channel」：上一采样在区间内、当前离开区间
      if (prev === undefined) return false;
      const [lo, hi] = normChannel(threshold, threshold2);
      return lo <= prev && prev <= hi && !(lo <= value && value <= hi);
    }
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
    if (cooled && evaluateCondition(cur.condition, cur.threshold, value, prevSeen[key], cur.threshold2)) {
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

// 解析与 schema 迁移拆至 alertPersist.ts（P2-A③ 拆段控行数）；经此再导出保持
// 既有 import 兼容（alertStore / 测试均从 alertLogic 引入 parseAlertsPayload）
export { parseAlertsPayload } from './alertPersist';
export type { AlertsPayload } from './alertPersist';

// ---------- 品种分组（二期-E） ----------

/** 按品种分组（保持首次出现顺序；单测钉住） */
export function groupAlertsBySymbol(alerts: readonly PriceAlert[]): Array<{ symbol: string; items: PriceAlert[] }> {
  const out: Array<{ symbol: string; items: PriceAlert[] }> = [];
  const bySymbol = new Map<string, PriceAlert[]>();
  for (const a of alerts) {
    let list = bySymbol.get(a.symbol);
    if (!list) {
      list = [];
      bySymbol.set(a.symbol, list);
      out.push({ symbol: a.symbol, items: list });
    }
    list.push(a);
  }
  return out;
}

// ---------- 通知计划（二期-E：去重 + 聚合，纯函数供单测） ----------

/** 通知层去重窗口：同警报 60s 内重复触发不再发系统通知（触发/历史语义不受影响） */
export const NOTIFY_DEDUP_MS = 60_000;

/** 单条通知正文上限：超出折叠为「…等 N 条」 */
export const NOTIFY_MAX_LINES = 3;

export interface NotifyPlan {
  /** 去重后待通知的触发（≤ NOTIFY_MAX_LINES 参与正文，余量折叠计数） */
  items: FiredAlert[];
  /** 是否超上限（聚合侧据此追加「等 N 条」） */
  more: number;
  /** 通知计划更新后的去重时间表（含被聚合条目；无变化返回原引用） */
  lastNotifiedAt: Record<string, number>;
}

/**
 * 通知计划（纯函数）：同警报 lastNotifiedAt 在 NOTIFY_DEDUP_MS 内 → 跳过；
 * 其余按触发顺序保留，超出 NOTIFY_MAX_LINES 的条目计入 more（仍更新去重表）。
 */
export function notifyPlan(
  fired: readonly FiredAlert[],
  lastNotifiedAt: Record<string, number>,
  now: number,
): NotifyPlan {
  const next = { ...lastNotifiedAt };
  const items: FiredAlert[] = [];
  for (const f of fired) {
    const last = next[f.alert.id];
    if (last !== undefined && now - last < NOTIFY_DEDUP_MS) continue;
    next[f.alert.id] = now;
    if (items.length < NOTIFY_MAX_LINES) items.push(f);
  }
  return { items, more: Math.max(0, fired.length - items.length), lastNotifiedAt: next };
}
