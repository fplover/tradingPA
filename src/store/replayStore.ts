import { create } from 'zustand';

interface ReplayStore {
  /** 复盘位置（bar index）；null = 未开启 */
  index: number | null;
  playing: boolean;
  /** 播放倍速 */
  speed: number;
  /** 选择K线模式：开启后图表点击落点即为复盘位置 */
  selectMode: boolean;
  setIndex: (index: number | null) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setSelectMode: (selectMode: boolean) => void;
  /** 进入复盘（从指定 index 开始，暂停态） */
  start: (index: number) => void;
  exit: () => void;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  index: null,
  playing: false,
  speed: 1,
  selectMode: false,
  setIndex: (index) => set({ index }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setSelectMode: (selectMode) => set({ selectMode }),
  start: (index) => set({ index, playing: false, selectMode: false }),
  exit: () => set({ index: null, playing: false, selectMode: false }),
}));
