import { create } from 'zustand';

interface DrawingStore {
  activeTool: string | null;
  magnet: boolean;
  treeOpen: boolean;
  setActiveTool: (tool: string | null) => void;
  setMagnet: (on: boolean) => void;
  setTreeOpen: (open: boolean) => void;
}

export const useDrawingStore = create<DrawingStore>((set) => ({
  activeTool: null,
  magnet: false,
  treeOpen: false,
  setActiveTool: (activeTool) => set({ activeTool }),
  setMagnet: (magnet) => set({ magnet }),
  setTreeOpen: (treeOpen) => set({ treeOpen }),
}));
