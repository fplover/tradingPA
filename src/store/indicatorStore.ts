import { create } from 'zustand';
import type { ParamValue } from '@/indicators/core/types';

/** 逐 plot 的样式覆盖（TV 指标设置「样式」页） */
export interface PlotStyleOverride {
  color?: string;
  lineWidth?: number;
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

interface IndicatorStore {
  active: ActiveIndicator[];
  panelOpen: boolean;
  settingsFor: string | null;
  add: (id: string, params?: Record<string, ParamValue>) => void;
  remove: (id: string) => void;
  updateParams: (id: string, params: Record<string, ParamValue>) => void;
  updateInstance: (id: string, patch: Partial<Omit<ActiveIndicator, 'id' | 'params'>>) => void;
  replaceAll: (list: ActiveIndicator[]) => void;
  setPanelOpen: (open: boolean) => void;
  setSettingsFor: (id: string | null) => void;
  saveTemplate: () => void;
  loadTemplate: () => void;
}

export const useIndicatorStore = create<IndicatorStore>((set, get) => ({
  // 默认挂 VOL 成交量指标（副图直方图），可通过工具栏复选框或指标面板增删
  active: [{ id: 'vol', params: {} }],
  panelOpen: false,
  settingsFor: null,
  add: (id, params) =>
    set((s) => (s.active.some((a) => a.id === id) ? s : { active: [...s.active, { id, params: params ?? {} }] })),
  remove: (id) => set((s) => ({ active: s.active.filter((a) => a.id !== id), settingsFor: null })),
  updateParams: (id, params) =>
    set((s) => ({ active: s.active.map((a) => (a.id === id ? { ...a, params: { ...a.params, ...params } } : a)) })),
  updateInstance: (id, patch) =>
    set((s) => ({ active: s.active.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
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
