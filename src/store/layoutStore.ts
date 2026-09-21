import { create } from 'zustand';

export type LayoutId = 1 | 2 | 4 | 6 | 8;

export const LAYOUTS: Array<{ id: LayoutId; label: string; cols: number; rows: number }> = [
  { id: 1, label: '单图', cols: 1, rows: 1 },
  { id: 2, label: '二分', cols: 2, rows: 1 },
  { id: 4, label: '四分', cols: 2, rows: 2 },
  { id: 6, label: '六分', cols: 3, rows: 2 },
  { id: 8, label: '八分', cols: 4, rows: 2 },
];

interface LayoutStore {
  layout: LayoutId;
  setLayout: (l: LayoutId) => void;
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  layout: 1,
  setLayout: (layout) => set({ layout }),
}));
