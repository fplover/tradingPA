import { create } from 'zustand';

export interface OrderMenuState {
  open: boolean;
  /** 点击处的价格（默认下单价） */
  price: number;
  /** 当前回放 bar 时间 */
  time: number;
  /** 浮窗位置（视口坐标） */
  x: number;
  y: number;
  openMenu: (price: number, time: number, x: number, y: number) => void;
  close: () => void;
}

/** 图表点击下单浮窗状态 */
export const useOrderMenuStore = create<OrderMenuState>((set) => ({
  open: false,
  price: 0,
  time: 0,
  x: 0,
  y: 0,
  openMenu: (price, time, x, y) => set({ open: true, price, time, x, y }),
  close: () => set({ open: false }),
}));
