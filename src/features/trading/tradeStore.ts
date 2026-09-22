import { create } from 'zustand';
import { PaperTradingEngine, type OrderSpec } from './paperEngine';

interface TradeStore {
  engine: PaperTradingEngine;
  /** 变更版本号：引擎是可变对象，用它触发 React 重渲染 */
  version: number;
  place: (spec: OrderSpec, refPrice: number, time: number) => void;
  cancel: (id: string) => void;
  closePosition: (refPrice: number, time: number) => void;
  onBar: (bar: { time: number; high: number; low: number; close: number }) => void;
  reset: (balance?: number) => void;
}

export const useTradeStore = create<TradeStore>((set, get) => ({
  engine: new PaperTradingEngine(100_000),
  version: 0,
  place: (spec, refPrice, time) => {
    get().engine.place(spec, refPrice, time);
    set((s) => ({ version: s.version + 1 }));
  },
  cancel: (id) => {
    get().engine.cancel(id);
    set((s) => ({ version: s.version + 1 }));
  },
  closePosition: (refPrice, time) => {
    get().engine.closePosition(refPrice, time);
    set((s) => ({ version: s.version + 1 }));
  },
  onBar: (bar) => {
    get().engine.onBar(bar);
    set((s) => ({ version: s.version + 1 }));
  },
  reset: (balance) => {
    get().engine.reset(balance);
    set((s) => ({ version: s.version + 1 }));
  },
}));
