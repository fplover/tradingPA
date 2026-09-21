import { create } from 'zustand';

const STORAGE_KEY = 'tradingpa.watchlist';
const DEFAULTS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];

interface WatchlistStore {
  symbols: string[];
  active: string;
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
  setActive: (symbol: string) => void;
  search: (query: string) => string[];
}

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {
    /* 忽略损坏的收藏 */
  }
  return DEFAULTS;
}

function persist(symbols: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    /* 存储不可用时忽略 */
  }
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  symbols: load(),
  active: 'BTCUSDT',
  add: (symbol) =>
    set((s) => {
      const up = symbol.toUpperCase();
      if (s.symbols.includes(up)) return s;
      const symbols = [...s.symbols, up];
      persist(symbols);
      return { symbols };
    }),
  remove: (symbol) =>
    set((s) => {
      const symbols = s.symbols.filter((x) => x !== symbol);
      persist(symbols);
      return { symbols, active: s.active === symbol ? (symbols[0] ?? 'BTCUSDT') : s.active };
    }),
  setActive: (active) => set({ active }),
  search: (query) => {
    const q = query.toUpperCase();
    return get().symbols.filter((s) => s.includes(q));
  },
}));
