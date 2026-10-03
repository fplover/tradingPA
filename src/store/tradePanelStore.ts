import { create } from 'zustand';

const STORAGE_KEY = 'tradingpa.tradePanel';
const DEFAULT_HEIGHT = 168;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 420;

interface TradePanelState {
  open: boolean;
  height: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setHeight: (height: number) => void;
}

interface Persisted {
  open?: boolean;
  height?: number;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* 忽略损坏的持久化 */
  }
  return {};
}

function persist(state: { open: boolean; height: number }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时忽略 */
  }
}

export const clampPanelHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h)));

export const useTradePanelStore = create<TradePanelState>((set, get) => {
  const saved = load();
  return {
    open: saved.open ?? false, // 默认收起（仅显示标题头部）
    height: clampPanelHeight(saved.height ?? DEFAULT_HEIGHT),
    setOpen: (open) => {
      persist({ open, height: get().height });
      set({ open });
    },
    toggle: () => {
      const open = !get().open;
      persist({ open, height: get().height });
      set({ open });
    },
    setHeight: (height) => {
      const h = clampPanelHeight(height);
      persist({ open: get().open, height: h });
      set({ height: h });
    },
  };
});
