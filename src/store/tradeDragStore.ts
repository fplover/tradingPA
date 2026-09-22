import { create } from 'zustand';

export interface TradeDragEnd {
  side: 'buy' | 'sell';
  qty: number;
  clientY: number;
}

interface TradeDragStore {
  dragging: boolean;
  side: 'buy' | 'sell';
  qty: number;
  clientY: number;
  overChart: boolean;
  /** 一次待消费的拖拽结束事件（Chart 消费后清空） */
  pendingEnd: TradeDragEnd | null;
  begin: (side: 'buy' | 'sell', qty: number, clientY: number) => void;
  move: (clientY: number, overChart: boolean) => void;
  end: (clientY: number, overChart: boolean) => void;
  clearPendingEnd: () => void;
}

export const useTradeDragStore = create<TradeDragStore>((set) => ({
  dragging: false,
  side: 'buy',
  qty: 0.01,
  clientY: 0,
  overChart: false,
  pendingEnd: null,
  begin: (side, qty, clientY) => set({ dragging: true, side, qty, clientY, overChart: false, pendingEnd: null }),
  move: (clientY, overChart) => set({ clientY, overChart }),
  end: (clientY, overChart) =>
    set((s) =>
      s.dragging
        ? { dragging: false, pendingEnd: overChart ? { side: s.side, qty: s.qty, clientY } : null }
        : s,
    ),
  clearPendingEnd: () => set({ pendingEnd: null }),
}));
