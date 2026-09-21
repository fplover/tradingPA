import { create } from 'zustand';
import { setTheme, type ThemeName } from '@/engine/theme';

interface ThemeStore {
  name: ThemeName;
  toggle: () => void;
}

// 初始化：应用默认主题并挂上 body 类名（CSS 变量依赖此类名）
setTheme('dark');

export const useThemeStore = create<ThemeStore>((set, get) => ({
  name: 'dark',
  toggle: () => {
    const next: ThemeName = get().name === 'dark' ? 'light' : 'dark';
    setTheme(next);
    set({ name: next });
  },
}));
