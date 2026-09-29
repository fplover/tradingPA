import { create } from 'zustand';
// 强制求值序：customInterval 的模块体 initCustomIntervals() 必须早于本模块体的
// readFile() 执行——否则刷新恢复时自定义周期（custom:N，运行时注册）尚未进注册表，
// isKnownTimeframeId 判 false → 布局快照静默回退 '1m'（QA 终验 P1，2026-09-29）。
// customInterval 不导入本模块，无循环依赖。
import '@/features/market/customInterval';
import type { Instrument } from '@/types/instrument';
import type { Drawing } from '@/engine/drawing/types';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useThemeStore } from '@/store/themeStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import type { ChartTypeId, TimeframeId } from '@/types/market';
import {
  LAYOUTS_STORAGE_KEY,
  LAYOUT_SNAPSHOT_VERSION,
  migrateSnapshot,
  type LayoutCellSnapshot,
  type LayoutSnapshot,
  type LayoutsFile,
  type SavedLayout,
} from '@/types/layout';

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

// ---------- 跨 store 桥接 ----------

/** App 注册的桥接：周期/图表类型是 App 的 React state，画线在主图 renderer 里，store 不直接持有 */
export interface LayoutBridges {
  getChartState: () => { timeframe: TimeframeId; chartType: ChartTypeId };
  setChartState: (timeframe: TimeframeId, chartType: ChartTypeId) => void;
  /** 主图画线序列化 JSON；renderer 未就绪返回 null */
  getDrawings: () => string | null;
  /** 还原主图画线；renderer 未就绪时由 App 暂存，onRendererReady 时补放 */
  applyDrawings: (raw: string) => void;
}

let bridges: LayoutBridges | null = null;

export function setLayoutBridges(b: LayoutBridges | null): void {
  bridges = b;
}

// ---------- 持久化 ----------

function emptyFile(): LayoutsFile {
  return { version: LAYOUT_SNAPSHOT_VERSION, activeId: null, items: [] };
}

/** 读档：单条损坏不拖垮整份存档；themeStore 的 localStorage 在隐私模式下会抛错，统一兜底 */
function readFile(): LayoutsFile {
  try {
    const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as Partial<LayoutsFile> | null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return emptyFile();
    const items: SavedLayout[] = [];
    for (const it of parsed.items) {
      if (!it || typeof it !== 'object') continue;
      const snapshot = migrateSnapshot((it as SavedLayout).snapshot);
      const id = (it as SavedLayout).id;
      if (!snapshot || typeof id !== 'string' || id.length === 0) continue;
      items.push({ id, name: snapshot.name, savedAt: snapshot.savedAt, snapshot });
    }
    const activeId =
      typeof parsed.activeId === 'string' && items.some((i) => i.id === parsed.activeId) ? parsed.activeId : null;
    return { version: LAYOUT_SNAPSHOT_VERSION, activeId, items };
  } catch {
    return emptyFile();
  }
}

function persist(): void {
  const s = useLayoutStore.getState();
  const file: LayoutsFile = {
    version: LAYOUT_SNAPSHOT_VERSION,
    activeId: s.activeLayoutId,
    items: s.savedLayouts,
  };
  try {
    localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* 隐私模式 / 存储超额：内存态继续可用，不阻断保存动作 */
  }
}

/** 刷新后待自动恢复的布局 id（模块初始化时确定，App 挂载后消费一次） */
let pendingRestoreId: string | null = null;

const initialFile = readFile();
if (initialFile.activeId) pendingRestoreId = initialFile.activeId;

// ---------- 内部工具 ----------

let idSeq = 0;
function newLayoutId(): string {
  idSeq += 1;
  return `layout-${Date.now().toString(36)}-${idSeq}`;
}

function autoName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `布局 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 主题只能 toggle（不改 themeStore 既有 API），按目标名折叠到一次翻转 */
function applyTheme(name: 'dark' | 'light'): void {
  if (useThemeStore.getState().name !== name) useThemeStore.getState().toggle();
}

/** 采集当前整图状态为快照（画线经 migrateSnapshot 复用同一套校验） */
function captureSnapshot(name: string): LayoutSnapshot {
  const chart = bridges?.getChartState();
  let drawings: Drawing[] | null = null;
  const raw = bridges?.getDrawings();
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) drawings = migrateSnapshot({ version: 1, drawings: parsed })?.drawings ?? null;
    } catch {
      /* 画线损坏不阻断布局其余部分的保存 */
    }
  }
  return {
    version: LAYOUT_SNAPSHOT_VERSION,
    name,
    savedAt: Date.now(),
    layout: useLayoutStore.getState().layout,
    activeInstrumentId: useWatchlistStore.getState().activeId,
    timeframe: chart?.timeframe ?? '1m',
    chartType: chart?.chartType ?? 'candles',
    indicators: useIndicatorStore.getState().active.map((a) => ({ ...a, params: { ...a.params } })),
    drawings,
    theme: useThemeStore.getState().name,
    cells: useLayoutStore.getState().cells.map((c) => ({ ...c })),
  };
}

/** 把快照应用到全部相关 store；activeId = 该布局成为当前激活布局（null = 不改变激活态） */
function applySnapshot(snap: LayoutSnapshot, activeId: string | null): void {
  useLayoutStore.setState({
    layout: snap.layout as LayoutId,
    cells: snap.cells.length > 0 ? snap.cells.map((c) => ({ ...c })) : defaultCells(snap.layout),
    activeLayoutId: activeId,
  });
  // 品种：在全部列表 + recent 中按 id 找；找不到（被删/换设备）时保持现状，不凭空造品种
  const wl = useWatchlistStore.getState();
  let instrument: Instrument | null = null;
  for (const list of wl.lists) {
    const hit = list.items.find((i) => i.id === snap.activeInstrumentId);
    if (hit) {
      instrument = hit;
      break;
    }
  }
  if (!instrument && snap.activeInstrumentId) {
    instrument = wl.recent.find((i) => i.id === snap.activeInstrumentId) ?? null;
  }
  if (instrument) wl.setActive(instrument);
  // 指标为全局共享：整量替换（含参数/样式/小数位/可见周期）
  useIndicatorStore.getState().replaceAll(snap.indicators.map((a) => ({ ...a, params: { ...a.params } })));
  applyTheme(snap.theme);
  bridges?.setChartState(snap.timeframe, snap.chartType);
  // 画线世界坐标还原；layout !== 1 时主图 renderer 不存在，由 App 侧丢弃（多图表单元格画线不在 B8 能力内）
  if (snap.drawings) bridges?.applyDrawings(JSON.stringify(snap.drawings));
  persist();
}

interface LayoutStore {
  layout: LayoutId;
  setLayout: (l: LayoutId) => void;
  /** 多图表单元格状态（提升自 ChartCell 本地 state，布局快照的组成部分） */
  cells: LayoutCellSnapshot[];
  setCell: (index: number, patch: Partial<LayoutCellSnapshot>) => void;
  /** 已保存的命名布局（最新在前） */
  savedLayouts: SavedLayout[];
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
  setLayout: (layout) => set({ layout }),

  cells: defaultCells(1),
  setCell: (index, patch) =>
    set((s) => {
      if (index < 0 || index >= LAYOUTS[LAYOUTS.length - 1].id) return {};
      const cells = [...s.cells];
      while (cells.length <= index) cells.push(defaultCell(cells.length));
      cells[index] = { ...cells[index], ...patch };
      return { cells };
    }),

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
    let activeId: string;
    let items: SavedLayout[];
    if (existing) {
      activeId = existing.id;
      items = s.savedLayouts.map((l) =>
        l.id === existing.id ? { ...l, name: finalName, savedAt: snapshot.savedAt, snapshot } : l,
      );
    } else {
      activeId = newLayoutId();
      items = [{ id: activeId, name: finalName, savedAt: snapshot.savedAt, snapshot }, ...s.savedLayouts].slice(
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
    const entry: SavedLayout = { id: newLayoutId(), name: finalName, savedAt: snapshot.savedAt, snapshot };
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
    applySnapshot(snap, id);
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
    useLayoutStore.setState({ layout: 1, cells: defaultCells(1), activeLayoutId: null });
    // 与 indicatorStore 初始态保持一致（默认挂 VOL）
    useIndicatorStore.getState().replaceAll([{ id: 'vol', params: {} }]);
    applyTheme('dark');
    bridges?.setChartState('1m', 'candles');
    bridges?.applyDrawings('[]');
    persist();
  },

  consumePendingRestore: () => {
    const id = pendingRestoreId;
    pendingRestoreId = null;
    return id;
  },
}));
