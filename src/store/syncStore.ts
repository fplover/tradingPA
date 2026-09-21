import { create } from 'zustand';

export interface ChartSyncState {
  /** 十字光标所在 bar 时间戳（null = 无） */
  crosshairTime: number | null;
  /** 时间范围同步：视口首 index 与 bar 间距 */
  viewport: { first: number; spacing: number } | null;
}

interface SyncStore extends ChartSyncState {
  setCrosshairTime: (t: number | null) => void;
  setViewport: (v: { first: number; spacing: number } | null) => void;
  syncEnabled: boolean;
  toggleSync: () => void;
}

/** 多图表联动：十字光标时间 + 视口范围广播 */
export const useSyncStore = create<SyncStore>((set) => ({
  crosshairTime: null,
  viewport: null,
  syncEnabled: true,
  setCrosshairTime: (crosshairTime) => set({ crosshairTime }),
  setViewport: (viewport) => set({ viewport }),
  toggleSync: () => set((s) => ({ syncEnabled: !s.syncEnabled })),
}));
