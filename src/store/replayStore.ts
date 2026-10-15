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
  /** 播放倍速；恒为 `REPLAY_SPEEDS` 档位值（`setSpeed` 拒绝越界档） */
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

/** 自动播放步进裁决：返回下一根 index；已在最后一根（barCount-1）时返回 null 表示停止播放 */
export function nextAutoplayIndex(index: number, barCount: number): number | null {
  const next = index + 1;
  return next >= barCount ? null : next;
}

/** 1x 档的 tick 间隔（毫秒） */
const BASE_INTERVAL_MS = 300;

/**
 * 倍速档位表——下拉选项与 tick 换算**同源**于此。
 * 原 `SPEEDS`/`BASE_INTERVAL` 各自留在 ReplayBar 组件文件里，档位与换算分处两地，
 * 与三期-B5 收敛的「同一真值另存一份」同类；上界取 8x（间隔 37.5ms）。
 */
export const REPLAY_SPEEDS = [1, 2, 4, 8] as const;

/** 档位校验的唯一落点：越界值不进 store，故 state.speed 恒为档位值 */
function isSpeed(v: number): boolean {
  return (REPLAY_SPEEDS as readonly number[]).includes(v);
}

/** 倍速 → 自动播放 tick 间隔（毫秒） */
export function replayTickMs(speed: number): number {
  return BASE_INTERVAL_MS / speed;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  index: null,
  playing: false,
  speed: 1,
  selectMode: false,
  barPos: loadBarPos(),
  setIndex: (index) => set({ index }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => {
    if (!isSpeed(speed)) return;
    set({ speed });
  },
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
