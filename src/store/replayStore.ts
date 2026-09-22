import { create } from 'zustand';

const BAR_POS_KEY = 'tradingpa.replayBarPos';

interface BarPos {
  x: number;
  y: number;
}

interface ReplayStore {
  /** 复盘位置（bar index）；null = 未开启 */
  index: number | null;
  playing: boolean;
  /** 播放倍速 */
  speed: number;
  /** 选择K线模式：开启后图表点击落点即为复盘位置 */
  selectMode: boolean;
  /** 回放工具条悬浮窗位置（null = 默认居中偏下） */
  barPos: BarPos | null;
  setIndex: (index: number | null) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setSelectMode: (selectMode: boolean) => void;
  setBarPos: (pos: BarPos | null) => void;
  /** 进入回放并默认进入选择K线状态（用户先点图表选起点） */
  enterSelect: () => void;
  /** 进入复盘（从指定 index 开始，暂停态） */
  start: (index: number) => void;
  exit: () => void;
}

function loadBarPos(): BarPos | null {
  try {
    const raw = localStorage.getItem(BAR_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
    }
  } catch {
    /* 忽略损坏的位置 */
  }
  return null;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  index: null,
  playing: false,
  speed: 1,
  selectMode: false,
  barPos: loadBarPos(),
  setIndex: (index) => set({ index }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setSelectMode: (selectMode) => set({ selectMode }),
  setBarPos: (barPos) => {
    try {
      if (barPos) localStorage.setItem(BAR_POS_KEY, JSON.stringify(barPos));
      else localStorage.removeItem(BAR_POS_KEY);
    } catch {
      /* 存储不可用时忽略 */
    }
    set({ barPos });
  },
  enterSelect: () => set({ selectMode: true, playing: false, index: null }),
  start: (index) => set({ index, playing: false, selectMode: false }),
  exit: () => set({ index: null, playing: false, selectMode: false }),
}));
