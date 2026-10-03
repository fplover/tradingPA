// 布局快照存档域：localStorage 序列化/迁移复检、跨 store 桥接注册表、快照采集与应用。
// 自 layoutStore 拆出（单文件 ≤300 行红线）：layoutStore 只保留 store 定义与公开导出面。
// 本模块经 @/store/layoutStore 读存档态（persist/captureSnapshot/applySnapshot 均为函数体内
// 延迟使用，无模块初始化环）；读档时机与 customInterval 的强制求值序仍在 layoutStore 模块体。
//
// P2-C 扩展：布局元数据域（meta）——最大化单元格 / 多图表联动开关 / grid 行列比例。
// 与 types/layout.ts 的 LayoutSnapshot（schema 版本 v1 不动，P2-C 白名单不含该文件）解耦：
// meta 挂在本模块的 SavedLayoutEx 条目上随命名布局持久化（"进快照"），readFile 逐字段
// 归一化（坏数据宽容兜底沿用同先例）；旧档无 meta 字段 → normalizeMeta 回落默认值。
import type { Instrument } from '@/types/instrument';
import type { Drawing } from '@/engine/drawing/types';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useThemeStore } from '@/store/themeStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { defaultCells, LAYOUTS, useLayoutStore } from '@/store/layoutStore';
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

// ---------- P2-C 布局元数据（最大化 / 联动开关 / 行列比例） ----------

/** 多图表联动 channel 标识（与 syncBus 三 channel 一一对应，布局开关在发布侧裁决） */
export type SyncChannel = 'symbol' | 'interval' | 'drawings';

/** 布局元数据：随命名布局条目持久化（进快照），刷新后经激活布局恢复 */
export interface LayoutMeta {
  /** 最大化的单元格索引；null = 无最大化（单图布局恒为 null） */
  maximizedCell: number | null;
  /** 多图表联动开关（默认：品种/周期开、画线关） */
  syncSymbol: boolean;
  syncInterval: boolean;
  syncDrawings: boolean;
  /** grid 列 / 行比例（fr 权重，长度 = 当前布局 cols/rows） */
  colRatios: number[];
  rowRatios: number[];
}

/** 命名布局条目扩展：meta 与 snapshot 并列（snapshot schema 在 types/layout.ts，版本不动） */
export type SavedLayoutEx = SavedLayout & { meta: LayoutMeta };

export interface LayoutsFileEx extends Omit<LayoutsFile, 'items'> {
  items: SavedLayoutEx[];
}

/** grid 轨道最小比例（fr 权重）：拖拽分隔条时单轨不可低于此值，防止单元格被压没 */
export const MIN_TRACK_RATIO = 0.2;

/** 等分比例（n 条轨道各取 1） */
export function equalRatios(n: number): number[] {
  return Array.from({ length: Math.max(1, n) }, () => 1);
}

/** 比例适配：长度不符 / 非正有限值逐轨钳到最小比例（坏数据不整体失败） */
export function fitRatios(ratios: unknown, n: number): number[] {
  const count = Math.max(1, n);
  if (!Array.isArray(ratios) || ratios.length !== count) return equalRatios(count);
  return ratios.map((r) => (typeof r === 'number' && Number.isFinite(r) && r >= MIN_TRACK_RATIO ? r : MIN_TRACK_RATIO));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 元数据默认值：无最大化、品种/周期联动开、画线联动关、行列等分 */
export function defaultMeta(cols: number, rows: number): LayoutMeta {
  return {
    maximizedCell: null,
    syncSymbol: true,
    syncInterval: true,
    syncDrawings: false,
    colRatios: equalRatios(cols),
    rowRatios: equalRatios(rows),
  };
}

/**
 * 元数据归一化（localStorage 数据可能被手改坏，逐字段兜底）：
 * - 开关缺省 = 默认值（syncSymbol/syncInterval 默认开，syncDrawings 默认关）；
 * - maximizedCell 越界 / 非整数 / 单图布局 → null；比例按目标布局行列数适配（不符回落等分）。
 */
export function normalizeMeta(raw: unknown, layout: number): LayoutMeta {
  const def = LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0];
  const base = defaultMeta(def.cols, def.rows);
  if (!isPlainObject(raw)) return base;
  const cell = raw.maximizedCell;
  const ok = typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < def.id;
  return {
    maximizedCell: layout === 1 || !ok ? null : cell,
    syncSymbol: raw.syncSymbol !== false,
    syncInterval: raw.syncInterval !== false,
    syncDrawings: raw.syncDrawings === true,
    colRatios: fitRatios(raw.colRatios, def.cols),
    rowRatios: fitRatios(raw.rowRatios, def.rows),
  };
}

/** 采集当前布局元数据（存命名布局时随条目持久化；比例过一遍适配防脏值入库） */
export function captureMeta(): LayoutMeta {
  const s = useLayoutStore.getState();
  const def = LAYOUTS.find((l) => l.id === s.layout) ?? LAYOUTS[0];
  return {
    maximizedCell: s.maximizedCell !== null && s.maximizedCell < def.id ? s.maximizedCell : null,
    syncSymbol: s.syncSymbol,
    syncInterval: s.syncInterval,
    syncDrawings: s.syncDrawings,
    colRatios: fitRatios(s.colRatios, def.cols),
    rowRatios: fitRatios(s.rowRatios, def.rows),
  };
}

/** 应用布局元数据到 store（读档 / 刷新恢复；layout 为目标档位，用于比例适配与越界钳制） */
export function applyMeta(meta: LayoutMeta | undefined, layout: number): void {
  const m = normalizeMeta(meta, layout);
  useLayoutStore.setState({ ...m });
}

/** 元数据落盘：拖拽调比 / 联动开关变更后调用——写回激活布局条目的 meta 并 persist；
 *  无激活布局时仅保持内存态（与单元格状态同一持久化语义：刷新恢复走激活布局快照）。 */
export function commitMeta(): void {
  const s = useLayoutStore.getState();
  if (s.activeLayoutId) {
    const meta = captureMeta();
    useLayoutStore.setState((st) => ({
      savedLayouts: st.savedLayouts.map((l) => (l.id === st.activeLayoutId ? { ...l, meta } : l)),
    }));
  }
  persist();
}

// ---------- 持久化 ----------

function emptyFile(): LayoutsFileEx {
  return { version: LAYOUT_SNAPSHOT_VERSION, activeId: null, items: [] };
}

/** 读档：单条损坏不拖垮整份存档；themeStore 的 localStorage 在隐私模式下会抛错，统一兜底 */
export function readFile(): LayoutsFileEx {
  try {
    const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as Partial<LayoutsFileEx> | null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return emptyFile();
    const items: SavedLayoutEx[] = [];
    for (const it of parsed.items) {
      if (!it || typeof it !== 'object') continue;
      const snapshot = migrateSnapshot((it as SavedLayout).snapshot);
      const id = (it as SavedLayout).id;
      if (!snapshot || typeof id !== 'string' || id.length === 0) continue;
      // meta 缺省（v1 旧档 / 手改数据）→ normalizeMeta 回落默认值
      items.push({
        id,
        name: snapshot.name,
        savedAt: snapshot.savedAt,
        snapshot,
        meta: normalizeMeta((it as SavedLayoutEx).meta, snapshot.layout),
      });
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
  const file: LayoutsFileEx = {
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

/** 把快照应用到全部相关 store；activeId = 该布局成为当前激活布局（null = 不改变激活态）。
 *  meta = 布局元数据（最大化/联动开关/行列比例，P2-C）；缺省时按目标档位回落默认值。 */
export function applySnapshot(snap: LayoutSnapshot, activeId: string | null, meta?: LayoutMeta): void {
  useLayoutStore.setState({
    layout: snap.layout as LayoutId,
    cells: snap.cells.length > 0 ? snap.cells.map((c) => ({ ...c })) : defaultCells(snap.layout),
    activeLayoutId: activeId,
  });
  applyMeta(meta, snap.layout);
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
