import { create } from 'zustand';
import {
  DEFAULT_COOLDOWN_MS,
  clampCooldown,
  describeAlert,
  notifyPlan,
  parseAlertsPayload,
  runAlertCheck,
  type AlertCondition,
  type AlertFrequency,
  type AlertSample,
  type AlertSource,
  type FiredAlert,
  type PriceAlert,
} from '@/features/alerts/alertLogic';
import { recordAlertFires } from '@/features/alerts/alertHistory';
import { playAlertBeep } from '@/features/alerts/sound';

export type {
  PriceAlert,
  AlertSource,
  AlertCondition,
  AlertFrequency,
  AlertSample,
} from '@/features/alerts/alertLogic';

const STORAGE_KEY = 'tradingpa.alerts';
let seq = 0;

export interface NewAlertInput {
  symbol: string;
  source: AlertSource;
  threshold: number;
  /** 通道条件上沿（enterChannel/exitChannel） */
  threshold2?: number;
  condition: AlertCondition;
  frequency: AlertFrequency;
  cooldownMs?: number;
  expiresAt?: number;
}

interface AlertStore {
  alerts: PriceAlert[];
  soundEnabled: boolean;
  add: (input: NewAlertInput) => void;
  update: (id: string, patch: Partial<Omit<PriceAlert, 'id' | 'symbol' | 'createdAt'>>) => void;
  togglePause: (id: string) => void;
  remove: (id: string) => void;
  clearTriggered: () => void;
  setSoundEnabled: (v: boolean) => void;
  /** 用最新采样检查全部警报，返回本轮触发列表（含条件/频率/过期处理） */
  check: (symbol: string, samples: AlertSample[]) => PriceAlert[];
}

function load(): AlertsLoaded {
  try {
    return parseAlertsPayload(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { alerts: [], soundEnabled: true };
  }
}
interface AlertsLoaded {
  alerts: PriceAlert[];
  soundEnabled: boolean;
}

function persist(alerts: PriceAlert[], soundEnabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, soundEnabled, alerts }));
  } catch {
    /* 忽略 */
  }
}

/** 运行时穿越检测缓存（跨品种采样键隔离；不持久化——刷新后首轮不触发穿越属预期） */
let lastSeen: Record<string, number> = {};

/** 通知层去重表（alertId → 最近通知时间；纯内存，重启即清零） */
let lastNotifiedAt: Record<string, number> = {};

/** 发送系统通知（单条；发送失败静默） */
function sendNotification(title: string, body: string): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* 通知不可用时静默 */
  }
}

/**
 * 触发通知出口（二期-E：去重 + 聚合）。同警报 60s 内重复触发不发系统通知
 * （notifyPlan 纯函数，去重窗口不影响触发/历史/声音语义）；多触发合并为一条
 * 通知（正文至多 NOTIFY_MAX_LINES 行，余量折叠为「等 N 条」）。
 */
function notifyBatch(fired: readonly FiredAlert[]): void {
  if (fired.length === 0) return;
  const plan = notifyPlan(fired, lastNotifiedAt, Date.now());
  lastNotifiedAt = plan.lastNotifiedAt;
  if (plan.items.length === 0) return;
  const lines = plan.items.map((f) => `${describeAlert(f.alert)}（当前 ${f.value}）`);
  if (plan.items.length === 1 && plan.more === 0) {
    sendNotification(`价格警报 ${plan.items[0].alert.symbol}`, lines[0]);
    return;
  }
  const more = plan.more > 0 ? `\n…等 ${plan.items.length + plan.more} 条` : '';
  sendNotification(`价格警报（${plan.items.length + plan.more} 条触发）`, lines.join('\n') + more);
}

export const useAlertStore = create<AlertStore>((set, get) => {
  const initial = load();
  return {
    alerts: initial.alerts,
    soundEnabled: initial.soundEnabled,
    add: (input) =>
      set((s) => {
        const alerts: PriceAlert[] = [
          ...s.alerts,
          {
            id: `alert_${++seq}_${Date.now()}`,
            symbol: input.symbol,
            source: input.source,
            threshold: input.threshold,
            threshold2: input.threshold2,
            condition: input.condition,
            active: true,
            triggered: false,
            createdAt: Date.now(),
            frequency: input.frequency,
            cooldownMs: clampCooldown(input.cooldownMs ?? DEFAULT_COOLDOWN_MS),
            expiresAt: input.expiresAt,
          },
        ];
        persist(alerts, s.soundEnabled);
        return { alerts };
      }),
    update: (id, patch) =>
      set((s) => {
        const alerts = s.alerts.map((a) =>
          a.id === id
            ? {
                ...a,
                ...patch,
                cooldownMs: patch.cooldownMs !== undefined ? clampCooldown(patch.cooldownMs) : a.cooldownMs,
              }
            : a,
        );
        persist(alerts, s.soundEnabled);
        return { alerts };
      }),
    togglePause: (id) =>
      set((s) => {
        const alerts = s.alerts.map((a) => (a.id === id ? { ...a, active: !a.active } : a));
        persist(alerts, s.soundEnabled);
        return { alerts };
      }),
    remove: (id) =>
      set((s) => {
        const alerts = s.alerts.filter((a) => a.id !== id);
        persist(alerts, s.soundEnabled);
        return { alerts };
      }),
    clearTriggered: () =>
      set((s) => {
        // 只清「已触发且已停用」（once 触发后，用户裁决 2026-10-03）；
        // 运行中的 every 警报（triggered=true, active=true）保留，不再被一并删除
        const alerts = s.alerts.filter((a) => !(a.triggered && !a.active));
        persist(alerts, s.soundEnabled);
        return { alerts };
      }),
    setSoundEnabled: (v) =>
      set((s) => {
        persist(s.alerts, v);
        return { soundEnabled: v };
      }),
    check: (symbol, samples) => {
      const { alerts, soundEnabled } = get();
      const res = runAlertCheck(alerts, symbol, samples, lastSeen, Date.now());
      lastSeen = res.lastSeen;
      if (res.alerts !== alerts) {
        persist(res.alerts, soundEnabled);
        set({ alerts: res.alerts });
      }
      recordAlertFires(res.fired, Date.now());
      notifyBatch(res.fired);
      if (res.fired.length > 0 && soundEnabled) playAlertBeep();
      return res.fired.map((f) => f.alert);
    },
  };
});
