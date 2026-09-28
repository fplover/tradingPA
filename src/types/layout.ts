import type { Drawing, DrawingPoint, DrawingTypeId } from '@/engine/drawing/types';
import { DRAWING_TOOLS, getToolDef } from '@/engine/drawing/types';
import type { ParamValue } from '@/indicators/core/types';
import type { ActiveIndicator } from '@/store/indicatorStore';
import { CHART_TYPES, TIMEFRAMES, type ChartTypeId, type TimeframeId } from '@/types/market';

/** 布局快照 schema 版本。v1 = B8 首发；未来不兼容变更递增版本号，由 migrateSnapshot 负责升级 */
export const LAYOUT_SNAPSHOT_VERSION = 1;

/** localStorage 存档 key（含版本号，换 schema 时换 key，旧档自然隔离） */
export const LAYOUTS_STORAGE_KEY = 'tradingpa.layouts.v1';

/** 单个图表单元格的可还原状态（多图表布局 2/4/6/8） */
export interface LayoutCellSnapshot {
  symbol: string;
  timeframe: TimeframeId;
  chartType: ChartTypeId;
}

/** 整图布局快照：覆盖 Spec §5 数据契约要求的全部字段 */
export interface LayoutSnapshot {
  version: number;
  name: string;
  /** 保存时间（epoch ms） */
  savedAt: number;
  /** 布局档位 1/2/4/6/8（对应 LAYOUTS） */
  layout: number;
  /** 主图品种 id（watchlistStore.activeId）；多图表时单元格各自持有 symbol */
  activeInstrumentId: string | null;
  /** 主图周期 / 图表类型（layout===1 时由顶栏持有） */
  timeframe: TimeframeId;
  chartType: ChartTypeId;
  /** 指标实例（含参数/样式/小数位/可见周期）。当前架构为全局共享，多图表共用 */
  indicators: ActiveIndicator[];
  /** 主图画线（世界坐标 time+price，与缩放平移无关）；null = 无画线或未捕获 */
  drawings: Drawing[] | null;
  theme: 'dark' | 'light';
  /** 多图表单元格状态；layout===1 时为空数组 */
  cells: LayoutCellSnapshot[];
}

/** 一条已保存的命名布局 */
export interface SavedLayout {
  id: string;
  name: string;
  savedAt: number;
  snapshot: LayoutSnapshot;
}

/** localStorage 文件结构 */
export interface LayoutsFile {
  version: number;
  /** 当前激活的布局 id（刷新后自动恢复）；null = 回默认 */
  activeId: string | null;
  items: SavedLayout[];
}

// ---------- 迁移与校验 ----------

const TIMEFRAME_IDS = new Set<string>(TIMEFRAMES.map((t) => t.id));
const CHART_TYPE_IDS = new Set<string>(CHART_TYPES.map((c) => c.id));
const DRAWING_TYPE_IDS = new Set<string>(DRAWING_TOOLS.map((t) => t.id));
const LAYOUT_IDS = new Set([1, 2, 4, 6, 8]);
const MAX_LAYOUT_NAME_LEN = 60;

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function asFiniteNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 校验并克隆单条指标（localStorage 数据可能被手改坏，逐字段兜底） */
function normalizeIndicator(v: unknown): ActiveIndicator | null {
  if (!isPlainObject(v) || typeof v.id !== 'string' || v.id.length === 0) return null;
  const out: ActiveIndicator = {
    id: v.id,
    params: isPlainObject(v.params) ? ({ ...v.params } as Record<string, ParamValue>) : {},
  };
  if (typeof v.displayName === 'string') out.displayName = v.displayName;
  if (typeof v.precision === 'number' && Number.isFinite(v.precision)) out.precision = v.precision;
  if (isPlainObject(v.styles)) out.styles = JSON.parse(JSON.stringify(v.styles)) as ActiveIndicator['styles'];
  if (Array.isArray(v.visibleTimeframes)) {
    out.visibleTimeframes = v.visibleTimeframes.filter((x): x is string => typeof x === 'string');
  }
  return out;
}

function isPointLike(v: unknown): v is DrawingPoint {
  return isPlainObject(v) && typeof v.time === 'number' && typeof v.price === 'number';
}

/** 校验并克隆单条画线；类型未知 / 锚点缺失时丢弃该条而不是整体失败 */
function normalizeDrawing(v: unknown): Drawing | null {
  if (!isPlainObject(v) || typeof v.id !== 'string' || v.id.length === 0) return null;
  if (!DRAWING_TYPE_IDS.has(v.type as string)) return null;
  const type = v.type as DrawingTypeId;
  const def = getToolDef(type);
  const points = Array.isArray(v.points) ? v.points.filter(isPointLike) : [];
  if (points.length === 0) return null;
  const style: Drawing['style'] = { ...def.defaultStyle };
  if (isPlainObject(v.style)) {
    if (typeof v.style.color === 'string') style.color = v.style.color;
    if (typeof v.style.lineWidth === 'number' && Number.isFinite(v.style.lineWidth)) style.lineWidth = v.style.lineWidth;
    if (typeof v.style.dash === 'boolean') style.dash = v.style.dash;
    if (typeof v.style.fillColor === 'string') style.fillColor = v.style.fillColor;
    if (typeof v.style.text === 'string') style.text = v.style.text;
    if (typeof v.style.fontSize === 'number' && Number.isFinite(v.style.fontSize)) style.fontSize = v.style.fontSize;
  }
  return {
    id: v.id,
    type,
    points,
    style,
    locked: v.locked === true,
    visible: v.visible !== false,
  };
}

function normalizeCell(v: unknown): LayoutCellSnapshot | null {
  if (!isPlainObject(v)) return null;
  const { symbol, timeframe, chartType } = v;
  if (typeof symbol !== 'string' || symbol.length === 0) return null;
  if (!TIMEFRAME_IDS.has(timeframe as string) || !CHART_TYPE_IDS.has(chartType as string)) return null;
  return { symbol, timeframe: timeframe as TimeframeId, chartType: chartType as ChartTypeId };
}

/**
 * 快照迁移 + 校验：任何来自 localStorage / 未来的数据都要过这一层。
 * - version 缺失或为 0：无版本号的旧数据不可信，拒绝；
 * - version 高于当前：来自未来的 schema，拒绝而不是猜测语义；
 * - version <= 当前：逐字段校验归一化后直通（v1 为直通，未来版本在此加升级分支）。
 */
export function migrateSnapshot(raw: unknown): LayoutSnapshot | null {
  if (!isPlainObject(raw)) return null;
  const version = asFiniteNumber(raw.version, 0);
  if (version < 1) return null;
  if (version > LAYOUT_SNAPSHOT_VERSION) return null;

  const indicators = Array.isArray(raw.indicators)
    ? raw.indicators.map(normalizeIndicator).filter((a): a is ActiveIndicator => a !== null)
    : [];
  const drawings = Array.isArray(raw.drawings)
    ? raw.drawings.map(normalizeDrawing).filter((d): d is Drawing => d !== null)
    : [];
  const cells = Array.isArray(raw.cells)
    ? raw.cells.map(normalizeCell).filter((c): c is LayoutCellSnapshot => c !== null).slice(0, 8)
    : [];
  const layout = asFiniteNumber(raw.layout, 1);

  return {
    version: LAYOUT_SNAPSHOT_VERSION,
    name: asString(raw.name, '未命名布局').slice(0, MAX_LAYOUT_NAME_LEN),
    savedAt: asFiniteNumber(raw.savedAt, 0),
    layout: LAYOUT_IDS.has(layout) ? layout : 1,
    activeInstrumentId: typeof raw.activeInstrumentId === 'string' ? raw.activeInstrumentId : null,
    timeframe: TIMEFRAME_IDS.has(raw.timeframe as string) ? (raw.timeframe as TimeframeId) : '1m',
    chartType: CHART_TYPE_IDS.has(raw.chartType as string) ? (raw.chartType as ChartTypeId) : 'candles',
    indicators,
    drawings: drawings.length > 0 ? drawings : null,
    theme: raw.theme === 'light' ? 'light' : 'dark',
    cells,
  };
}
