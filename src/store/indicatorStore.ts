import { create } from 'zustand';
import type { ParamValue } from '@/indicators/core/types';

export interface ActiveIndicator {
  id: string;
  params: Record<string, ParamValue>;
}

const STORAGE_KEY = 'tradingpa.indicatorTemplate';

interface IndicatorStore {
  active: ActiveIndicator[];
  panelOpen: boolean;
  settingsFor: string | null;
  add: (id: string, params?: Record<string, ParamValue>) => void;
  remove: (id: string) => void;
  updateParams: (id: string, params: Record<string, ParamValue>) => void;
  replaceAll: (list: ActiveIndicator[]) => void;
  setPanelOpen: (open: boolean) => void;
  setSettingsFor: (id: string | null) => void;
  saveTemplate: () => void;
  loadTemplate: () => void;
}

export const useIndicatorStore = create<IndicatorStore>((set, get) => ({
  active: [],
  panelOpen: false,
  settingsFor: null,
  add: (id, params) =>
    set((s) => (s.active.some((a) => a.id === id) ? s : { active: [...s.active, { id, params: params ?? {} }] })),
  remove: (id) => set((s) => ({ active: s.active.filter((a) => a.id !== id), settingsFor: null })),
  updateParams: (id, params) =>
    set((s) => ({ active: s.active.map((a) => (a.id === id ? { ...a, params: { ...a.params, ...params } } : a)) })),
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
