import { create } from 'zustand';

/** 符号搜索弹窗。mode 决定选中后的动作：切换图表品种，或仅加入自选股。 */
export type SearchMode = 'switch' | 'add';

interface SymbolSearchStore {
  open: boolean;
  mode: SearchMode;
  /** 打开时预填的查询词（字母键直开品种搜索用；按钮 / Ctrl+K 打开为空） */
  initialQuery: string;
  openSearch: (mode?: SearchMode, initialQuery?: string) => void;
  close: () => void;
}

export const useSymbolSearchStore = create<SymbolSearchStore>((set) => ({
  open: false,
  mode: 'switch',
  initialQuery: '',
  openSearch: (mode = 'switch', initialQuery = '') => set({ open: true, mode, initialQuery }),
  close: () => set({ open: false }),
}));
