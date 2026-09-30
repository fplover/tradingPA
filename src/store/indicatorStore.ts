import { create } from 'zustand';
import type { ParamValue, PlotKind } from '@/indicators/core/types';

/** 逐 plot 的样式覆盖（TV 指标设置「样式」页） */
export interface PlotStyleOverride {
  color?: string;
  lineWidth?: number;
  /** 绘制类型覆盖（TV 样式页 plot 类型下拉） */
  kind?: PlotKind;
  hidden?: boolean;
}

export interface ActiveIndicator {
  id: string;
  params: Record<string, ParamValue>;
  /** 显示名覆盖（样式页顶部可编辑） */
  displayName?: string;
  /** 小数位覆盖；undefined = 跟随默认 */
  precision?: number;
  styles?: Record<string, PlotStyleOverride>;
  /** 可见周期 id 列表；undefined/null = 全部周期可见 */
  visibleTimeframes?: string[];
}

const STORAGE_KEY = 'tradingpa.indicatorTemplate';
const FAV_KEY = 'tradingpa.indicatorFavorites';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) {
      const list = JSON.parse(raw) as string[];
      if (Array.isArray(list)) return list.filter((x) => typeof x === 'string');
    }
  } catch {
    /* 忽略 */
  }
  return [];
}

interface IndicatorStore {
  active: ActiveIndicator[];
  favorites: string[];
  panelOpen: boolean;
  settingsFor: string | null;
  add: (id: string, params?: Record<string, ParamValue>) => void;
  remove: (id: string) => void;
  updateParams: (id: string, params: Record<string, ParamValue>) => void;
  /** AVWAP 锚点写回（P2-D③）：引擎落锚后经回调把 anchorTime 落入 params；
   *  同值短路——已是该锚点不新建 state（避免 store→engine→store 回环） */
  setAnchorTime: (id: string, anchorTime: number) => void;
  updateInstance: (id: string, patch: Partial<Omit<ActiveIndicator, 'id' | 'params'>>) => void;
  toggleFavorite: (id: string) => void;
  replaceAll: (list: ActiveIndicator[]) => void;
  setPanelOpen: (open: boolean) => void;
  setSettingsFor: (id: string | null) => void;
  saveTemplate: () => void;
  loadTemplate: () => void;
}

export const useIndicatorStore = create<IndicatorStore>((set, get) => ({
  // 默认挂 VOL 成交量指标（副图直方图），可通过工具栏复选框或指标面板增删
  active: [{ id: 'vol', params: {} }],
  favorites: loadFavorites(),
  panelOpen: false,
  settingsFor: null,
  add: (id, params) =>
    set((s) => (s.active.some((a) => a.id === id) ? s : { active: [...s.active, { id, params: params ?? {} }] })),
  remove: (id) => set((s) => ({ active: s.active.filter((a) => a.id !== id), settingsFor: null })),
  updateParams: (id, params) =>
    set((s) => ({ active: s.active.map((a) => (a.id === id ? { ...a, params: { ...a.params, ...params } } : a)) })),
  setAnchorTime: (id, anchorTime) =>
    set((s) => {
      const entry = s.active.find((a) => a.id === id);
      // 同值短路 / 目标不存在：原样返回，不新建 state（useChartCommands 不会重复下发）
      if (!entry || entry.params.anchorTime === anchorTime) return s;
      return { active: s.active.map((a) => (a.id === id ? { ...a, params: { ...a.params, anchorTime } } : a)) };
    }),
  updateInstance: (id, patch) =>
    set((s) => ({ active: s.active.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  toggleFavorite: (id) =>
    set((s) => {
      const favorites = s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
      } catch {
        /* 忽略 */
      }
      return { favorites };
    }),
  replaceAll: (list) => set({ active: list }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setSettingsFor: (settingsFor) => set({ settingsFor }),
  saveTemplate: () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(get().active));
  },
  loadTemplate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) set({ active: JSON.parse(raw) });
    } catch {
      /* 模板损坏时忽略 */
    }
  },
}));
