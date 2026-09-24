import { create } from 'zustand';

/** 符号搜索弹窗。mode 决定选中后的动作：切换图表品种，或仅加入自选股。 */
export type SearchMode = 'switch' | 'add';

interface SymbolSearchStore {
  open: boolean;
  mode: SearchMode;
  openSearch: (mode?: SearchMode) => void;
  close: () => void;
}

export const useSymbolSearchStore = create<SymbolSearchStore>((set) => ({
  open: false,
  mode: 'switch',
  openSearch: (mode = 'switch') => set({ open: true, mode }),
  close: () => set({ open: false }),
}));
