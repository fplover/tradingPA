import { create } from 'zustand';

/** 右侧停靠面板。TradingView 的面板是挤压图表宽度停靠，不是浮在图表上。 */
export type RightPanelId = 'watchlist' | 'objectTree' | 'alerts';

const WIDTH_KEY = 'tradingpa.rightdock.width';
const PANEL_KEY = 'tradingpa.rightdock.panel';

export const DOCK_MIN = 240;
export const DOCK_MAX = 640;
const DOCK_DEFAULT = 320;

const IDS: RightPanelId[] = ['watchlist', 'objectTree', 'alerts'];

function loadPanel(): RightPanelId | null {
  try {
    const v = localStorage.getItem(PANEL_KEY);
    if (v === 'null') return null;
    if (IDS.includes(v as RightPanelId)) return v as RightPanelId;
  } catch {
    /* 存储不可用时用默认 */
  }
  return 'watchlist';
}

function loadWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(n) && n >= DOCK_MIN && n <= DOCK_MAX) return Math.round(n);
  } catch {
    /* 同上 */
  }
  return DOCK_DEFAULT;
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 同上 */
  }
}

interface RightDockStore {
  panel: RightPanelId | null;
  width: number;
  toggle: (id: RightPanelId) => void;
  open: (id: RightPanelId) => void;
  close: () => void;
  setWidth: (width: number) => void;
}

export const useRightDockStore = create<RightDockStore>((set) => ({
  panel: loadPanel(),
  width: loadWidth(),

  toggle: (id) =>
    set((s) => {
      const panel = s.panel === id ? null : id;
      save(PANEL_KEY, String(panel));
      return { panel };
    }),

  open: (id) => {
    save(PANEL_KEY, id);
    set({ panel: id });
  },

  close: () => {
    save(PANEL_KEY, 'null');
    set({ panel: null });
  },

  setWidth: (width) => {
    const w = Math.round(Math.min(DOCK_MAX, Math.max(DOCK_MIN, width)));
    save(WIDTH_KEY, String(w));
    set({ width: w });
  },
}));
