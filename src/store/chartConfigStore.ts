import { create } from 'zustand';
import type { LegendOptions } from '@/engine/renderer/drawCrosshair';
import { DEFAULT_LEGEND_OPTIONS } from '@/engine/renderer/drawCrosshair';
import type { GridMode } from '@/engine/renderer/drawAxes';
import type { PriceAxisPos } from '@/engine/renderer/chartPanes';
import { CHART_TYPES, isKnownTimeframeId } from '@/types/market';
import type { ChartTypeId, TimeframeId } from '@/types/market';
import type { Instrument } from '@/types/instrument';

/**
 * 单图图表配置（P2-C：原 App.tsx 本地 state 下沉，释放上帝组件）。
 * 覆盖：周期 / 图表类型 / 对数 / 百分比 / 自动坐标 / 画线锁定与隐藏 / 指标显隐 / 图例选项 /
 * 画布偏好（网格·边框·水印·价格轴位置·时间制式，三期-B0 自对话框 useState 迁入）。
 *
 * 与 layoutStore 的分工：本 store 管「主图配置」（原 App state），layoutStore 管
 * 「布局与单元格」。layoutSnapshot 的桥接 getChartState 直接同步读本 store——
 * 消除原 App state + useLayoutEffect 补 ref 的 <1 帧竞态窗口（QA advisory #7）：
 * zustand setState 同步生效，Ctrl+S 同帧存档必读到的就是新周期。
 *
 * 三期-B0「设置态单一来源」：B0 之前这五项画布偏好由 ChartSettingsDialog 自持
 * useState + 硬编码默认值，本 store 无任何持久化——刷新即丢全部偏好，且对话框是
 * 引擎这些字段的唯一写入方。现在本 store 是唯一持有者，引擎经对话框的
 * 「renderer 就绪即下发」effect 由 store 播种（不新增引擎 getter：唯一写入方就是
 * 对话框，回读面无必要）。transient 字段（compareSymbol / comparePickerOpen）不落盘。
 */

/** 偏好落盘 key（含版本号，换 schema 时换 key，旧档自然隔离——与 layouts/watchlist 同口径） */
export const CHART_PREFS_STORAGE_KEY = 'tradingpa.chartPrefs.v1';

/** 可落盘的偏好切片（store 的标量字段，不含 setter 与 transient 字段）；
 *  三期-B1 起同时是「图表模板」的快照单元（chartTemplateStore 按此结构存/校验） */
export interface ChartPrefs {
  timeframe: TimeframeId;
  chartType: ChartTypeId;
  logScale: boolean;
  percent: boolean;
  autoScale: boolean;
  drawingsLocked: boolean;
  hideDrawings: boolean;
  hideStudies: boolean;
  legendOpts: LegendOptions;
  gridMode: GridMode;
  bordersVisible: boolean;
  watermarkVisible: boolean;
  priceAxisPos: PriceAxisPos;
  timeHour12: boolean;
  /** 图表时区显示偏移（分钟，东为正）；null = 浏览器本地（三期-B3「一般」页） */
  tzOffsetMinutes: number | null;
}

/** 默认值：画布五项沿用 B0 改造前对话框里的硬编码初值，与引擎侧默认一致 → 首次进入零行为变化 */
const DEFAULT_PREFS: ChartPrefs = {
  timeframe: '1m',
  chartType: 'candles',
  logScale: false,
  percent: false,
  autoScale: true,
  drawingsLocked: false,
  hideDrawings: false,
  hideStudies: false,
  legendOpts: { ...DEFAULT_LEGEND_OPTIONS },
  gridMode: 'both',
  bordersVisible: true,
  watermarkVisible: false,
  priceAxisPos: 'right',
  timeHour12: false,
  tzOffsetMinutes: null,
};

const GRID_MODES: readonly GridMode[] = ['none', 'horizontal', 'vertical', 'both'];
const PRICE_AXIS_POSS: readonly PriceAxisPos[] = ['right', 'left', 'none'];
const CHART_TYPE_IDS: readonly ChartTypeId[] = CHART_TYPES.map((t) => t.id);
const LEGEND_KEYS = Object.keys(DEFAULT_LEGEND_OPTIONS) as (keyof LegendOptions)[];
/** 自定义周期 id 形状（customInterval.ts 的 custom:<分钟数>，id 不在编译期联合类型内） */
const CUSTOM_TF_RE = /^custom:[1-9]\d*$/;

function readBool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}

function readEnum<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === 'string' && allowed.includes(v as T) ? (v as T) : d;
}

/** 时区显示偏移上下限（分钟）：真实固定偏移档是 UTC−12 ~ UTC+14（含 +5:30 这类半小时档）。
 *  读入 clamp 与「一般」页步进器的 min/max 共用这一份，不留第二套口径（三期-B2 同例）。 */
export const TZ_OFFSET_LIMITS = { min: -720, max: 840 } as const;

/** 时区显示偏移：null / 缺字段 / 坏值（字符串、NaN、Infinity）一律回落 null = 浏览器本地
 *  （改造前口径）；有限数取整并 clamp——坏一个字段不改掉整档（B0 口径）。 */
function readTzOffset(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.round(Math.min(TZ_OFFSET_LIMITS.max, Math.max(TZ_OFFSET_LIMITS.min, v)));
}

function readTimeframe(v: unknown): TimeframeId {
  if (typeof v !== 'string') return DEFAULT_PREFS.timeframe;
  // 自定义周期按形状放行而不是只认注册表：本模块求值可能早于 customInterval.ts 的
  // initCustomIntervals()，此刻 isKnownTimeframeId 还认不得刚持久化的 custom:<分钟数>。
  // 真被删除（不在最近列表）时 getTimeframe 自有 '1m' 回退，不会崩。
  return isKnownTimeframeId(v) || CUSTOM_TF_RE.test(v) ? (v as TimeframeId) : DEFAULT_PREFS.timeframe;
}

/** 图例选项逐字段兜底（坏档不得让一个非布尔值改掉整组开关） */
function readLegend(v: unknown): LegendOptions {
  const src = (v ?? {}) as Record<string, unknown>;
  const out: LegendOptions = { ...DEFAULT_LEGEND_OPTIONS };
  for (const k of LEGEND_KEYS) out[k] = readBool(src[k], DEFAULT_LEGEND_OPTIONS[k]);
  return out;
}

/** 宽容读档：localStorage 不可用（node 环境 / 隐私模式）或坏 JSON → 全默认；逐字段校验回落 */
function loadPrefs(): ChartPrefs {
  let raw: string | null = null;
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFS;
    raw = localStorage.getItem(CHART_PREFS_STORAGE_KEY);
  } catch {
    return DEFAULT_PREFS;
  }
  if (!raw) return DEFAULT_PREFS;
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  return parseChartPrefs(p);
}

/** 未知对象 → 偏好切片，逐字段回落不整体弃档。落盘读档与三期-B1 图表模板快照共用这一层
 *  （模板来自 localStorage，其 prefs 子对象同样是不可信输入）。 */
export function parseChartPrefs(v: unknown): ChartPrefs {
  const s = (v ?? {}) as Record<string, unknown>;
  return {
    timeframe: readTimeframe(s.timeframe),
    chartType: readEnum(s.chartType, CHART_TYPE_IDS, DEFAULT_PREFS.chartType),
    logScale: readBool(s.logScale, DEFAULT_PREFS.logScale),
    percent: readBool(s.percent, DEFAULT_PREFS.percent),
    autoScale: readBool(s.autoScale, DEFAULT_PREFS.autoScale),
    drawingsLocked: readBool(s.drawingsLocked, DEFAULT_PREFS.drawingsLocked),
    hideDrawings: readBool(s.hideDrawings, DEFAULT_PREFS.hideDrawings),
    hideStudies: readBool(s.hideStudies, DEFAULT_PREFS.hideStudies),
    legendOpts: readLegend(s.legendOpts),
    gridMode: readEnum(s.gridMode, GRID_MODES, DEFAULT_PREFS.gridMode),
    bordersVisible: readBool(s.bordersVisible, DEFAULT_PREFS.bordersVisible),
    watermarkVisible: readBool(s.watermarkVisible, DEFAULT_PREFS.watermarkVisible),
    priceAxisPos: readEnum(s.priceAxisPos, PRICE_AXIS_POSS, DEFAULT_PREFS.priceAxisPos),
    timeHour12: readBool(s.timeHour12, DEFAULT_PREFS.timeHour12),
    tzOffsetMinutes: readTzOffset(s.tzOffsetMinutes),
  };
}

/** 取当前状态的可落盘切片（三期-B1 亦用它作模板快照的采集面） */
export function slicePrefs(s: ChartConfigStore): ChartPrefs {
  return {
    timeframe: s.timeframe,
    chartType: s.chartType,
    logScale: s.logScale,
    percent: s.percent,
    autoScale: s.autoScale,
    drawingsLocked: s.drawingsLocked,
    hideDrawings: s.hideDrawings,
    hideStudies: s.hideStudies,
    legendOpts: s.legendOpts,
    gridMode: s.gridMode,
    bordersVisible: s.bordersVisible,
    watermarkVisible: s.watermarkVisible,
    priceAxisPos: s.priceAxisPos,
    timeHour12: s.timeHour12,
    tzOffsetMinutes: s.tzOffsetMinutes,
  };
}

function savePrefs(p: ChartPrefs): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify({ version: 1, ...p }));
  } catch {
    /* 隐私模式 / 存储超额：内存态继续可用，不阻断任何用户动作 */
  }
}

export interface ChartConfigStore {
  timeframe: TimeframeId;
  setTimeframe: (tf: TimeframeId) => void;
  chartType: ChartTypeId;
  setChartType: (ct: ChartTypeId) => void;
  /** 对数坐标（StatusBar log / 图表设置 / Alt+L） */
  logScale: boolean;
  setLogScale: (v: boolean) => void;
  toggleLog: () => void;
  /** 百分比坐标（StatusBar % / Alt+P） */
  percent: boolean;
  setPercent: (v: boolean) => void;
  togglePercent: () => void;
  /** 自动坐标（StatusBar auto） */
  autoScale: boolean;
  setAutoScale: (v: boolean) => void;
  toggleAutoScale: () => void;
  /** 画线锁定（画线工具栏） */
  drawingsLocked: boolean;
  setDrawingsLocked: (v: boolean) => void;
  toggleDrawingsLocked: () => void;
  /** 隐藏全部画线（Ctrl+Alt+H） */
  hideDrawings: boolean;
  setHideDrawings: (v: boolean) => void;
  toggleHideDrawings: () => void;
  /** 隐藏全部指标（StatusBar 眼睛） */
  hideStudies: boolean;
  setHideStudies: (v: boolean) => void;
  toggleHideStudies: () => void;
  /** 图例选项（图表设置 / 图例右键菜单） */
  legendOpts: LegendOptions;
  setLegendOpts: (patch: Partial<LegendOptions>) => void;
  /** 网格四态（图表设置 外观页）：none / horizontal / vertical / both */
  gridMode: GridMode;
  setGridMode: (v: GridMode) => void;
  /** 画布边框（Canvas 页） */
  bordersVisible: boolean;
  setBordersVisible: (v: boolean) => void;
  /** 水印（Canvas 页）：主价格面板居中「代码 · 周期」 */
  watermarkVisible: boolean;
  setWatermarkVisible: (v: boolean) => void;
  /** 价格坐标位置（Scales 页）：右 / 左 / 无 */
  priceAxisPos: PriceAxisPos;
  setPriceAxisPos: (v: PriceAxisPos) => void;
  /** 时间坐标制式（Scales 页）：false = 24 小时，true = 12 小时（AM/PM） */
  timeHour12: boolean;
  setTimeHour12: (v: boolean) => void;
  /** 图表时区显示偏移（分钟，东为正；三期-B3「一般」页）：null = 浏览器本地 */
  tzOffsetMinutes: number | null;
  setTzOffsetMinutes: (v: number | null) => void;
  /** 对比品种（P2-D 叠加）：null = 不叠加；独立订阅数据，归一化百分比副坐标渲染 */
  compareSymbol: Instrument | null;
  setCompareSymbol: (inst: Instrument | null) => void;
  /** 对比品种选择浮层开合（顶栏 Compare 按钮 ↔ ChartWorkspace 弹层） */
  comparePickerOpen: boolean;
  setComparePickerOpen: (v: boolean) => void;
}

const INITIAL = loadPrefs();

export const useChartConfigStore = create<ChartConfigStore>((set) => ({
  timeframe: INITIAL.timeframe,
  setTimeframe: (timeframe) => set({ timeframe }),
  chartType: INITIAL.chartType,
  setChartType: (chartType) => set({ chartType }),

  logScale: INITIAL.logScale,
  setLogScale: (v) => set({ logScale: v }),
  toggleLog: () => set((s) => ({ logScale: !s.logScale })),
  percent: INITIAL.percent,
  setPercent: (v) => set({ percent: v }),
  togglePercent: () => set((s) => ({ percent: !s.percent })),
  autoScale: INITIAL.autoScale,
  setAutoScale: (v) => set({ autoScale: v }),
  toggleAutoScale: () => set((s) => ({ autoScale: !s.autoScale })),

  drawingsLocked: INITIAL.drawingsLocked,
  setDrawingsLocked: (v) => set({ drawingsLocked: v }),
  toggleDrawingsLocked: () => set((s) => ({ drawingsLocked: !s.drawingsLocked })),
  hideDrawings: INITIAL.hideDrawings,
  setHideDrawings: (v) => set({ hideDrawings: v }),
  toggleHideDrawings: () => set((s) => ({ hideDrawings: !s.hideDrawings })),
  hideStudies: INITIAL.hideStudies,
  setHideStudies: (v) => set({ hideStudies: v }),
  toggleHideStudies: () => set((s) => ({ hideStudies: !s.hideStudies })),

  legendOpts: INITIAL.legendOpts,
  setLegendOpts: (patch) => set((s) => ({ legendOpts: { ...s.legendOpts, ...patch } })),

  gridMode: INITIAL.gridMode,
  setGridMode: (gridMode) => set({ gridMode }),
  bordersVisible: INITIAL.bordersVisible,
  setBordersVisible: (bordersVisible) => set({ bordersVisible }),
  watermarkVisible: INITIAL.watermarkVisible,
  setWatermarkVisible: (watermarkVisible) => set({ watermarkVisible }),
  priceAxisPos: INITIAL.priceAxisPos,
  setPriceAxisPos: (priceAxisPos) => set({ priceAxisPos }),
  timeHour12: INITIAL.timeHour12,
  setTimeHour12: (timeHour12) => set({ timeHour12 }),
  tzOffsetMinutes: INITIAL.tzOffsetMinutes,
  setTzOffsetMinutes: (tzOffsetMinutes) => set({ tzOffsetMinutes }),

  compareSymbol: null,
  setCompareSymbol: (compareSymbol) => set({ compareSymbol }),
  comparePickerOpen: false,
  setComparePickerOpen: (comparePickerOpen) => set({ comparePickerOpen }),
}));

// 单点落盘：偏好变更经订阅统一写盘，任何 setter 路径（含快捷键走 getState()）都不必各自写；
// 比对切片避免 transient 字段（compareSymbol / comparePickerOpen）变化触发 IO
let lastSaved = slicePrefs(useChartConfigStore.getState());
useChartConfigStore.subscribe((s) => {
  const next = slicePrefs(s);
  if (JSON.stringify(next) === JSON.stringify(lastSaved)) return;
  lastSaved = next;
  savePrefs(next);
});
