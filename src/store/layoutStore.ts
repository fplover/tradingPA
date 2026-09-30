import { create } from 'zustand';
// 强制求值序：customInterval 的模块体 initCustomIntervals() 必须早于本模块体的
// readFile() 执行——否则刷新恢复时自定义周期（custom:N，运行时注册）尚未进注册表，
// isKnownTimeframeId 判 false → 布局快照静默回退 '1m'（QA 终验 P1，2026-09-29）。
// customInterval 不导入本模块，无循环依赖。
import '@/features/market/customInterval';
import { useIndicatorStore } from '@/store/indicatorStore';
import { migrateSnapshot, type LayoutCellSnapshot } from '@/types/layout';
import {
  applySnapshot,
  applyTheme,
  autoName,
  captureMeta,
  captureSnapshot,
  commitMeta,
  defaultMeta,
  equalRatios,
  getLayoutBridges,
  MIN_TRACK_RATIO,
  newLayoutId,
  persist,
  readFile,
} from '@/store/layoutSnapshot';
import type { SavedLayoutEx, SyncChannel } from '@/store/layoutSnapshot';

// 公开导出面不变：桥接注册入口在 layoutSnapshot 实现，此处再导出（既有调用点 diff = 0）
export { setLayoutBridges } from '@/store/layoutSnapshot';
export type { LayoutBridges, LayoutMeta, SavedLayoutEx, SyncChannel } from '@/store/layoutSnapshot';

export type LayoutId = 1 | 2 | 4 | 6 | 8;

export const LAYOUTS: Array<{ id: LayoutId; label: string; cols: number; rows: number }> = [
  { id: 1, label: '单图', cols: 1, rows: 1 },
  { id: 2, label: '二分', cols: 2, rows: 1 },
  { id: 4, label: '四分', cols: 2, rows: 2 },
  { id: 6, label: '六分', cols: 3, rows: 2 },
  { id: 8, label: '八分', cols: 4, rows: 2 },
];

/** 命名布局数量上限，防止 localStorage 无上限增长 */
export const MAX_SAVED_LAYOUTS = 50;

/** 多图表单元格默认品种池（与 ChartCell 初始态同源，提升后由这里统一维护） */
export const CELL_DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];

/** 单元格默认态：与 ChartCell 提升前的 useState 初值一致（BTCUSDT / 5m / candles 起） */
export function defaultCell(index: number): LayoutCellSnapshot {
  return {
    symbol: CELL_DEFAULT_SYMBOLS[index % CELL_DEFAULT_SYMBOLS.length],
    timeframe: '5m',
    chartType: 'candles',
  };
}

export function defaultCells(count: number): LayoutCellSnapshot[] {
  return Array.from({ length: count }, (_, i) => defaultCell(i));
}

/** 刷新后待自动恢复的布局 id（模块初始化时确定，App 挂载后消费一次） */
let pendingRestoreId: string | null = null;

const initialFile = readFile();
if (initialFile.activeId) pendingRestoreId = initialFile.activeId;

interface LayoutStore {
  layout: LayoutId;
  setLayout: (l: LayoutId) => void;
  /** 多图表单元格状态（提升自 ChartCell 本地 state，布局快照的组成部分） */
  cells: LayoutCellSnapshot[];
  setCell: (index: number, patch: Partial<LayoutCellSnapshot>) => void;
  /** 最大化的单元格索引（Alt+Enter / 双击窗格标题区切换）；null = 无最大化。进快照 */
  maximizedCell: number | null;
  toggleMaximizeCell: (index: number) => void;
  exitMaximize: () => void;
  /** grid 列 / 行比例（fr 权重，长度随布局档位；拖拽边缘调整，进快照刷新后持久） */
  colRatios: number[];
  rowRatios: number[];
  /** 拖拽分隔条：原子调整相邻两条轨道比例（before/after 为调整后的权重） */
  resizeTrack: (axis: 'col' | 'row', index: number, before: number, after: number) => void;
  /** 比例 / 开关变更落盘（拖拽 pointerup、联动开关切换时调用） */
  commitMeta: () => void;
  /** 多图表联动开关（syncBus 品种/周期/画线 channel 的发布侧裁决；进快照） */
  syncSymbol: boolean;
  syncInterval: boolean;
  syncDrawings: boolean;
  setSyncChannel: (channel: SyncChannel, on: boolean) => void;
  /** 已保存的命名布局（最新在前） */
  savedLayouts: SavedLayoutEx[];
  /** 当前激活布局 id：Ctrl+S 快速保存覆盖它，刷新后自动恢复它 */
  activeLayoutId: string | null;
  /** 布局菜单开合（'.' 快捷键经此打开） */
  saveMenuOpen: boolean;
  setSaveMenuOpen: (open: boolean) => void;
  /** 最近一次成功保存的时间（菜单内展示「已保存」反馈） */
  lastSavedAt: number | null;
  /** Ctrl+S / 菜单「保存当前布局」：覆盖激活布局，无激活布局则新建 */
  saveCurrentLayout: (name?: string) => string | null;
  /** 菜单「另存为」：始终新建命名布局 */
  saveAsLayout: (name: string) => string | null;
  loadLayout: (id: string) => boolean;
  deleteLayout: (id: string) => void;
  renameLayout: (id: string, name: string) => void;
  /** 重置为默认图表：单图 + 1m + candles + VOL + 深色 + 清空画线（品种不动） */
  resetToDefault: () => void;
  /** App 挂载时消费一次：返回待自动恢复的布局 id 并清空 */
  consumePendingRestore: () => string | null;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  layout: 1,
  // 布局档位切换：比例数组按新档行列数重置为等分，并退出最大化（最大化索引随单元格集合失效）
  setLayout: (layout) => {
    const def = LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0];
    set({ layout, maximizedCell: null, colRatios: equalRatios(def.cols), rowRatios: equalRatios(def.rows) });
  },

  cells: defaultCells(1),
  setCell: (index, patch) =>
    set((s) => {
      if (index < 0 || index >= LAYOUTS[LAYOUTS.length - 1].id) return {};
      const cells = [...s.cells];
      while (cells.length <= index) cells.push(defaultCell(cells.length));
      cells[index] = { ...cells[index], ...patch };
      return { cells };
    }),

  maximizedCell: null,
  toggleMaximizeCell: (index) =>
    set((s) => {
      if (index < 0 || index >= s.layout) return {}; // 越界索引（布局已切）忽略
      return { maximizedCell: s.maximizedCell === index ? null : index };
    }),
  exitMaximize: () => set({ maximizedCell: null }),

  colRatios: equalRatios(1),
  rowRatios: equalRatios(1),
  resizeTrack: (axis, index, before, after) =>
    set((s) => {
      const clamp = (v: number) => (Number.isFinite(v) && v >= MIN_TRACK_RATIO ? v : MIN_TRACK_RATIO);
      if (axis === 'col') {
        const colRatios = [...s.colRatios];
        if (index < 0 || index + 1 >= colRatios.length) return {};
        colRatios[index] = clamp(before);
        colRatios[index + 1] = clamp(after);
        return { colRatios };
      }
      const rowRatios = [...s.rowRatios];
      if (index < 0 || index + 1 >= rowRatios.length) return {};
      rowRatios[index] = clamp(before);
      rowRatios[index + 1] = clamp(after);
      return { rowRatios };
    }),
  commitMeta,

  syncSymbol: true,
  syncInterval: true,
  syncDrawings: false,
  setSyncChannel: (channel, on) =>
    set(
      channel === 'symbol'
        ? { syncSymbol: on }
        : channel === 'interval'
          ? { syncInterval: on }
          : { syncDrawings: on },
    ),

  savedLayouts: initialFile.items,
  activeLayoutId: initialFile.activeId,
  saveMenuOpen: false,
  setSaveMenuOpen: (saveMenuOpen) => set({ saveMenuOpen }),
  lastSavedAt: null,

  saveCurrentLayout: (name) => {
    const s = get();
    const existing = s.activeLayoutId ? s.savedLayouts.find((l) => l.id === s.activeLayoutId) : undefined;
    const finalName = name?.trim() || existing?.name || autoName();
    const snapshot = captureSnapshot(finalName);
    const meta = captureMeta();
    let activeId: string;
    let items: SavedLayoutEx[];
    if (existing) {
      activeId = existing.id;
      items = s.savedLayouts.map((l) =>
        l.id === existing.id ? { ...l, name: finalName, savedAt: snapshot.savedAt, snapshot, meta } : l,
      );
    } else {
      activeId = newLayoutId();
      items = [{ id: activeId, name: finalName, savedAt: snapshot.savedAt, snapshot, meta }, ...s.savedLayouts].slice(
        0,
        MAX_SAVED_LAYOUTS,
      );
    }
    set({ savedLayouts: items, activeLayoutId: activeId, lastSavedAt: snapshot.savedAt });
    persist();
    return activeId;
  },

  saveAsLayout: (name) => {
    const finalName = name.trim();
    if (!finalName) return null;
    const snapshot = captureSnapshot(finalName);
    const meta = captureMeta();
    const entry: SavedLayoutEx = { id: newLayoutId(), name: finalName, savedAt: snapshot.savedAt, snapshot, meta };
    set((s) => ({
      savedLayouts: [entry, ...s.savedLayouts].slice(0, MAX_SAVED_LAYOUTS),
      activeLayoutId: entry.id,
      lastSavedAt: snapshot.savedAt,
    }));
    persist();
    return entry.id;
  },

  loadLayout: (id) => {
    const item = get().savedLayouts.find((l) => l.id === id);
    if (!item) return false;
    // 存档读档时已过 migrate，这里复检一次防内存态被异常写入
    const snap = migrateSnapshot(item.snapshot);
    if (!snap) return false;
    applySnapshot(snap, id, item.meta);
    set({ lastSavedAt: null });
    return true;
  },

  deleteLayout: (id) => {
    const s = get();
    if (!s.savedLayouts.some((l) => l.id === id)) return;
    const items = s.savedLayouts.filter((l) => l.id !== id);
    if (s.activeLayoutId === id) {
      // 删除当前激活布局 → 回默认图表（与 TradingView 删除激活布局的行为一致）
      set({ savedLayouts: items, activeLayoutId: null });
      persist();
      get().resetToDefault();
      return;
    }
    set({ savedLayouts: items });
    persist();
  },

  renameLayout: (id, name) => {
    const finalName = name.trim();
    if (!finalName) return;
    set((s) => ({
      savedLayouts: s.savedLayouts.map((l) =>
        l.id === id
          ? { ...l, name: finalName, snapshot: { ...l.snapshot, name: finalName } }
          : l,
      ),
    }));
    persist();
  },

  resetToDefault: () => {
    // 元数据同步回落默认（单图 1x1、无最大化、等分比例、默认联动开关）
    const meta = defaultMeta(1, 1);
    useLayoutStore.setState({
      layout: 1,
      cells: defaultCells(1),
      activeLayoutId: null,
      maximizedCell: meta.maximizedCell,
      colRatios: meta.colRatios,
      rowRatios: meta.rowRatios,
      syncSymbol: meta.syncSymbol,
      syncInterval: meta.syncInterval,
      syncDrawings: meta.syncDrawings,
    });
    // 与 indicatorStore 初始态保持一致（默认挂 VOL）
    useIndicatorStore.getState().replaceAll([{ id: 'vol', params: {} }]);
    applyTheme('dark');
    getLayoutBridges()?.setChartState('1m', 'candles');
    getLayoutBridges()?.applyDrawings('[]');
    persist();
  },

  consumePendingRestore: () => {
    const id = pendingRestoreId;
    pendingRestoreId = null;
    return id;
  },
}));
