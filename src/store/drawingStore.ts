import { create } from 'zustand';

interface DrawingStore {
  activeTool: string | null;
  magnet: boolean;
  /** 磁吸档位：weak 50px 内吸附 / strong 始终吸附（TV 默认 weak） */
  magnetMode: 'weak' | 'strong';
  treeOpen: boolean;
  /** TV「保持绘图模式」：完成后不退出工具 */
  stayMode: boolean;
  /** 画线设置对话框目标 drawing id */
  settingsFor: string | null;
  /** 应用内画线剪贴板（三期-C1，用户裁决 2026-10-14：内存态、不落盘、不碰系统剪贴板）。
   *  存 ChartController.exportDrawingsByIds 的产物（与导出同一格式），null = 空（粘贴项禁用）。
   *  刻意不入 localStorage：刷新即清是本仓唯一跨会话保留剪贴板会带来的意外。 */
  clipboard: string | null;
  setActiveTool: (tool: string | null) => void;
  setMagnet: (on: boolean) => void;
  setMagnetMode: (mode: 'weak' | 'strong') => void;
  setTreeOpen: (open: boolean) => void;
  setStayMode: (on: boolean) => void;
  setSettingsFor: (id: string | null) => void;
  setClipboard: (raw: string | null) => void;
}

export const useDrawingStore = create<DrawingStore>((set) => ({
  activeTool: null,
  magnet: false,
  magnetMode: 'weak',
  treeOpen: false,
  stayMode: false,
  settingsFor: null,
  clipboard: null,
  setActiveTool: (activeTool) => set({ activeTool }),
  setMagnet: (magnet) => set({ magnet }),
  setMagnetMode: (magnetMode) => set({ magnetMode }),
  setTreeOpen: (treeOpen) => set({ treeOpen }),
  setStayMode: (stayMode) => set({ stayMode }),
  setSettingsFor: (settingsFor) => set({ settingsFor }),
  setClipboard: (clipboard) => set({ clipboard }),
}));
