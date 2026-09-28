import type { Timeframe, TimeframeId } from '@/types/market';
import { TIMEFRAMES, registerTimeframe } from '@/types/market';
import type { ToolbarOption } from '@/ui/ToolbarSelect';

/** 自定义周期持久化 key（B5）。只存分钟数（唯一事实源），id/label/seconds 全部派生，避免存档格式漂移 */
export const CUSTOM_INTERVAL_STORAGE_KEY = 'tradingpa.custom-intervals.v1';

/** 自定义周期 id 前缀：custom:<分钟数>，如 custom:7 / custom:90 */
export const CUSTOM_ID_PREFIX = 'custom:';

/** 周期下拉里「自定义间隔…」动作项的哨兵值（不是真实周期 id，选中即打开浮层） */
export const CUSTOM_INTERVAL_ACTION = '__custom_interval__';

/** 最多记住最近多少个自定义周期（TV 同样只保留最近用过的几个），防止 localStorage 无上限增长 */
export const MAX_CUSTOM_INTERVALS = 8;

/** TV 自定义间隔范围：分钟 1-1440，小时 1-24 */
export const CUSTOM_MINUTE_RANGE = { min: 1, max: 1440 } as const;
export const CUSTOM_HOUR_RANGE = { min: 1, max: 24 } as const;

export type CustomIntervalUnit = 'm' | 'H';

/** localStorage 不可用（node 测试环境 / 隐私模式）时的最小接口 */
interface KvStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 惰性取存储：隐私模式下访问 localStorage 本身会抛错，统一兜底 null（内存态继续可用） */
function storage(): KvStorage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* 隐私模式：getItem/setItem 一律不可用 */
  }
  return null;
}

export function customIntervalId(minutes: number): string {
  return `${CUSTOM_ID_PREFIX}${minutes}`;
}

export function isCustomIntervalId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX) && /^[1-9]\d*$/.test(id.slice(CUSTOM_ID_PREFIX.length));
}

export function customIntervalMinutes(id: string): number | null {
  return isCustomIntervalId(id) ? Number(id.slice(CUSTOM_ID_PREFIX.length)) : null;
}

/** 展示标签：整小时折「时」，否则「分」（与内置档位 '1时' / '45分' 同风格） */
export function customIntervalLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}时` : `${minutes}分`;
}

/** 输入校验（TV 范围）：返回错误文案，合法返回 null */
export function validateCustomInterval(value: number, unit: CustomIntervalUnit): string | null {
  if (!Number.isInteger(value)) return '请输入整数';
  const range = unit === 'H' ? CUSTOM_HOUR_RANGE : CUSTOM_MINUTE_RANGE;
  if (value < range.min || value > range.max) {
    return unit === 'H' ? '小时数量需为 1-24 的整数' : '分钟数量需为 1-1440 的整数';
  }
  return null;
}

/** 由分钟数生成自定义周期定义（前提：分钟数不命中任何内置档位，见 resolveCustomInterval） */
export function createCustomInterval(minutes: number): Timeframe {
  // 自定义 id 不在编译期 TimeframeId 联合类型内，运行时即字符串键（getTimeframe 经注册表解析）
  return { id: customIntervalId(minutes) as TimeframeId, label: customIntervalLabel(minutes), seconds: minutes * 60 };
}

/** 内置档位（排除运行时注册的自定义周期，避免自定义项把匹配源污染） */
function builtinBySeconds(minutes: number): Timeframe | undefined {
  return TIMEFRAMES.find((t) => !isCustomIntervalId(t.id) && t.seconds === minutes * 60);
}

/** 解析用户输入 → 周期定义：命中内置档位（按秒数）直接返回内置定义（不造重复项），
 *  否则创建自定义周期、注册进 TIMEFRAMES 并写入最近列表。走既有聚合器（tf.seconds 分桶）。 */
export function resolveCustomInterval(value: number, unit: CustomIntervalUnit): Timeframe {
  const minutes = unit === 'H' ? value * 60 : value;
  const builtin = builtinBySeconds(minutes);
  if (builtin) return builtin;
  const tf = createCustomInterval(minutes);
  registerTimeframe(tf);
  rememberCustomInterval(tf);
  return tf;
}

/** 直接套用一个已保存的自定义周期（浮层「最近使用」点击）：注册 + 提到最新 + 返回 */
export function selectCustomInterval(tf: Timeframe): Timeframe {
  registerTimeframe(tf);
  rememberCustomInterval(tf);
  return tf;
}

// ---------- 持久化（localStorage，坏数据宽容兜底） ----------

interface StoredFile {
  version: 1;
  items: Array<{ id: string; minutes: number }>;
}

export function serializeCustomIntervals(list: Timeframe[]): string {
  const file: StoredFile = { version: 1, items: list.map((t) => ({ id: t.id, minutes: t.seconds / 60 })) };
  return JSON.stringify(file);
}

/** 宽容解析：坏 JSON / 坏条目 / 非正整数分钟 / 与内置档位重复（后续升级为内置）的一律跳过 */
export function parseCustomIntervals(raw: string | null): Timeframe[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = (parsed as Partial<StoredFile> | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: Timeframe[] = [];
  const seen = new Set<number>();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const minutes = (it as { minutes: unknown }).minutes;
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1) continue;
    if (builtinBySeconds(minutes)) continue;
    if (seen.has(minutes)) continue;
    seen.add(minutes);
    out.push(createCustomInterval(minutes));
    if (out.length >= MAX_CUSTOM_INTERVALS) break;
  }
  return out;
}

export function loadCustomIntervals(): Timeframe[] {
  return parseCustomIntervals(storage()?.getItem(CUSTOM_INTERVAL_STORAGE_KEY) ?? null);
}

/** 记住一个自定义周期：按分钟数去重，最新在前，封顶 MAX_CUSTOM_INTERVALS */
export function rememberCustomInterval(tf: Timeframe): void {
  const next = [
    createCustomInterval(tf.seconds / 60),
    ...loadCustomIntervals().filter((t) => t.seconds !== tf.seconds),
  ].slice(0, MAX_CUSTOM_INTERVALS);
  try {
    storage()?.setItem(CUSTOM_INTERVAL_STORAGE_KEY, serializeCustomIntervals(next));
  } catch {
    /* 隐私模式 / 存储超额：TIMEFRAMES 注册态继续可用，不阻断应用动作 */
  }
}

export function forgetCustomInterval(id: string): void {
  const next = loadCustomIntervals().filter((t) => t.id !== id);
  try {
    storage()?.setItem(CUSTOM_INTERVAL_STORAGE_KEY, serializeCustomIntervals(next));
  } catch {
    /* 同上：删除失败不抛错 */
  }
}

/** 周期下拉的「自定义」分组选项（已保存的自定义周期；不含「自定义间隔…」动作项） */
export function customIntervalOptions(): ToolbarOption[] {
  return loadCustomIntervals().map((t) => ({ value: t.id, label: t.label, group: '自定义' }));
}

/** 模块初始化：把持久化的自定义周期注册进 TIMEFRAMES，
 *  使 getTimeframe / 顶栏下拉 / 图表单元格在下次进入时立即认得它们（幂等）。 */
export function initCustomIntervals(): void {
  for (const tf of loadCustomIntervals()) registerTimeframe(tf);
}

initCustomIntervals();
