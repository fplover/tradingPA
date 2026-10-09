import { describeAlert, type FiredAlert } from './alertLogic';

/**
 * 警报触发历史（二期-E）：本地持久化（localStorage），上限 100 条（新进旧出）。
 * 与警报本体存储分离：清警报/清触发标志不影响历史，历史满也不回写警报表。
 * 快照整体不可变替换，供 useSyncExternalStore 订阅（AlertPanel 历史分区）。
 */

export const ALERT_HISTORY_KEY = 'tradingpa.alertHistory';
export const ALERT_HISTORY_MAX = 100;

export interface AlertHistoryEntry {
  /** 条目 id（追加序，仅作列表 key） */
  id: string;
  /** 来源警报 id（删除警报不级联删历史） */
  alertId: string;
  symbol: string;
  /** 触发时的人类可读描述（describeAlert 快照） */
  message: string;
  /** 触发时的采样值 */
  value: number;
  /** 触发时间戳 */
  time: number;
}

function load(): AlertHistoryEntry[] {
  try {
    const raw = localStorage.getItem(ALERT_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: AlertHistoryEntry[] = [];
    for (const item of parsed) {
      if (item === null || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      if (
        typeof r.id !== 'string' ||
        typeof r.alertId !== 'string' ||
        typeof r.symbol !== 'string' ||
        typeof r.message !== 'string' ||
        typeof r.value !== 'number' ||
        !Number.isFinite(r.value) ||
        typeof r.time !== 'number'
      )
        continue;
      out.push({
        id: r.id,
        alertId: r.alertId,
        symbol: r.symbol,
        message: r.message,
        value: r.value,
        time: r.time,
      });
    }
    return out.slice(-ALERT_HISTORY_MAX);
  } catch {
    return [];
  }
}

function persist(entries: AlertHistoryEntry[]): void {
  try {
    localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* 存储不可用时静默（历史为附属记录，不阻塞触发链路） */
  }
}

let entries: AlertHistoryEntry[] = load();
let snapshot: readonly AlertHistoryEntry[] = entries;
let seq = 0;
const listeners = new Set<() => void>();

function publish(next: AlertHistoryEntry[]): void {
  entries = next;
  snapshot = next;
  persist(next);
  for (const cb of listeners) cb();
}

/** 历史快照（不可变，useSyncExternalStore 直用） */
export function alertHistory(): readonly AlertHistoryEntry[] {
  return snapshot;
}

export function subscribeAlertHistory(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 触发记录追加（alertStore.check 每轮调用一次；本轮多触发合批追加） */
export function recordAlertFires(fired: readonly FiredAlert[], now: number): void {
  if (fired.length === 0) return;
  const added = fired.map((f, i) => ({
    id: `ah_${++seq}_${now}_${i}`,
    alertId: f.alert.id,
    symbol: f.alert.symbol,
    message: describeAlert(f.alert),
    value: f.value,
    time: now,
  }));
  const next = [...entries, ...added].slice(-ALERT_HISTORY_MAX);
  publish(next);
}

/** 清空历史（AlertPanel 清除按钮） */
export function clearAlertHistory(): void {
  publish([]);
}
