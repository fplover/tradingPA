// 布局快照存档域：localStorage 序列化/迁移复检、跨 store 桥接注册表、快照采集与应用。
// 自 layoutStore 拆出（单文件 ≤300 行红线）：layoutStore 只保留 store 定义与公开导出面。
// 本模块经 @/store/layoutStore 读存档态（persist/captureSnapshot/applySnapshot 均为函数体内
// 延迟使用，无模块初始化环）；读档时机与 customInterval 的强制求值序仍在 layoutStore 模块体。
import type { Instrument } from '@/types/instrument';
import type { Drawing } from '@/engine/drawing/types';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useThemeStore } from '@/store/themeStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { defaultCells, useLayoutStore } from '@/store/layoutStore';
import type { LayoutId } from '@/store/layoutStore';
import type { ChartTypeId, TimeframeId } from '@/types/market';
import {
  LAYOUTS_STORAGE_KEY,
  LAYOUT_SNAPSHOT_VERSION,
  migrateSnapshot,
  type LayoutSnapshot,
  type LayoutsFile,
  type SavedLayout,
} from '@/types/layout';

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

/** 读取当前桥接（store 动作经此取用；快照采集/应用内部直接用闭包变量） */
export function getLayoutBridges(): LayoutBridges | null {
  return bridges;
}

// ---------- 持久化 ----------

function emptyFile(): LayoutsFile {
  return { version: LAYOUT_SNAPSHOT_VERSION, activeId: null, items: [] };
}

/** 读档：单条损坏不拖垮整份存档；themeStore 的 localStorage 在隐私模式下会抛错，统一兜底 */
export function readFile(): LayoutsFile {
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

export function persist(): void {
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

// ---------- 内部工具 ----------

let idSeq = 0;
export function newLayoutId(): string {
  idSeq += 1;
  return `layout-${Date.now().toString(36)}-${idSeq}`;
}

export function autoName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `布局 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 主题只能 toggle（不改 themeStore 既有 API），按目标名折叠到一次翻转 */
export function applyTheme(name: 'dark' | 'light'): void {
  if (useThemeStore.getState().name !== name) useThemeStore.getState().toggle();
}

// ---------- 快照采集 / 应用 ----------

/** 采集当前整图状态为快照（画线经 migrateSnapshot 复用同一套校验） */
export function captureSnapshot(name: string): LayoutSnapshot {
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
export function applySnapshot(snap: LayoutSnapshot, activeId: string | null): void {
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
