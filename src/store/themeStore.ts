import { create } from 'zustand';
import { setTheme, type ThemeName } from '@/engine/theme';

interface ThemeStore {
  name: ThemeName;
  toggle: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  name: 'dark',
  toggle: () => {
    const next: ThemeName = get().name === 'dark' ? 'light' : 'dark';
    setTheme(next);
    set({ name: next });
  },
}));
