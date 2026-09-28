import { create } from 'zustand';

interface DrawingStore {
  activeTool: string | null;
  magnet: boolean;
  treeOpen: boolean;
  /** TV「保持绘图模式」：完成后不退出工具 */
  stayMode: boolean;
  /** 画线设置对话框目标 drawing id */
  settingsFor: string | null;
  setActiveTool: (tool: string | null) => void;
  setMagnet: (on: boolean) => void;
  setTreeOpen: (open: boolean) => void;
  setStayMode: (on: boolean) => void;
  setSettingsFor: (id: string | null) => void;
}

export const useDrawingStore = create<DrawingStore>((set) => ({
  activeTool: null,
  magnet: false,
  treeOpen: false,
  stayMode: false,
  settingsFor: null,
  setActiveTool: (activeTool) => set({ activeTool }),
  setMagnet: (magnet) => set({ magnet }),
  setTreeOpen: (treeOpen) => set({ treeOpen }),
  setStayMode: (stayMode) => set({ stayMode }),
  setSettingsFor: (settingsFor) => set({ settingsFor }),
}));
