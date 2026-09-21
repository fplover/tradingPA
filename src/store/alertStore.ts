import { create } from 'zustand';

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  /** 'above' = 上穿触发；'below' = 下穿触发 */
  direction: 'above' | 'below';
  active: boolean;
  triggered: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'tradingpa.alerts';
let seq = 0;

interface AlertStore {
  alerts: PriceAlert[];
  add: (alert: Omit<PriceAlert, 'id' | 'active' | 'triggered' | 'createdAt'>) => void;
  remove: (id: string) => void;
  clearTriggered: () => void;
  /** 用最新价检查全部警报，返回新触发列表 */
  check: (symbol: string, price: number) => PriceAlert[];
}

function load(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {
    /* 忽略 */
  }
  return [];
}

function persist(alerts: PriceAlert[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    /* 忽略 */
  }
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: load(),
  add: (alert) =>
    set((s) => {
      const alerts = [
        ...s.alerts,
        { ...alert, id: `alert_${++seq}_${Date.now()}`, active: true, triggered: false, createdAt: Date.now() },
      ];
      persist(alerts);
      return { alerts };
    }),
  remove: (id) =>
    set((s) => {
      const alerts = s.alerts.filter((a) => a.id !== id);
      persist(alerts);
      return { alerts };
    }),
  clearTriggered: () =>
    set((s) => {
      const alerts = s.alerts.filter((a) => !a.triggered);
      persist(alerts);
      return { alerts };
    }),
  check: (symbol, price) => {
    const { alerts } = get();
    const fired: PriceAlert[] = [];
    for (const a of alerts) {
      if (!a.active || a.triggered || a.symbol !== symbol) continue;
      // 简化模型：当前价已在阈值正确一侧即触发（真实实现需跨越检测）
      if ((a.direction === 'above' && price >= a.price) || (a.direction === 'below' && price <= a.price)) {
        fired.push(a);
      }
    }
    if (fired.length > 0) {
      const firedIds = new Set(fired.map((f) => f.id));
      const next = alerts.map((a) => (firedIds.has(a.id) ? { ...a, triggered: true } : a));
      persist(next);
      set({ alerts: next });
      for (const f of fired) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`价格警报 ${f.symbol}`, {
            body: `${f.symbol} ${f.direction === 'above' ? '上穿' : '下穿'} ${f.price}（当前 ${price}）`,
          });
        }
      }
    }
    return fired;
  },
}));
