import { create } from 'zustand';

/**
 * 交易偏好（三期-B2「交易」页）。
 *
 * 改造前的形态是「四处硬编码 + 一处隐式默认」：下单默认量 `0.01` 分散在挂单对话框初值、
 * 图表点击浮窗 state、交易面板传参与回放条 state 四个点位，止损价偏移 `×1.01` 与初始资金
 * `100_000` 各写死一处。任一处改动都可能与其他处漂移，且用户无入口可调、刷新即回默认。
 * 本 store 是这四值的唯一持有者 + 落盘点。
 *
 * 与 chartConfigStore 的分工：本 store 只管「交易默认值与交易可视化开关」，
 * 不接管引擎的其他可见性开关——`showTrading` 之所以落在这里而不是画布偏好，
 * 是因为它的语义是「交易层是否参与图表」，与下单量/初始资金同属一个设置页。
 *
 * 未纳入的项（有意留空，非遗忘）：手续费 / 滑点模型。paperEngine 无此概念，
 * 加了只能是假开关（UI 有、引擎无），故本页不提供。
 */

/** 偏好落盘 key（含版本号；读档宽容、逐字段回落——与 chartPrefs 同口径） */
export const TRADE_SETTINGS_STORAGE_KEY = 'tradingpa.tradeSettings.v1';

/** 数值上下限：落盘读档 clamp 与 UI NumberStepper 的 min/max 共用同一份，避免两侧口径漂移 */
export const TRADE_LIMITS = {
  qty: { min: 0.0001, max: 1_000_000 },
  slPct: { min: 0.1, max: 50 },
  balance: { min: 1_000, max: 1_000_000_000 },
} as const;

export interface TradePrefs {
  /** 下单表单默认数量（挂单对话框 / 图表点击浮窗 / 交易面板 / 回放条四处共用） */
  defaultQty: number;
  /** 止损价默认偏移百分比：止损价 = 当前价 × (1 + slPct/100)，默认 1% 即原硬编码 ×1.01 */
  stopOffsetPct: number;
  /** 模拟盘初始资金：仅在「新回放会话重置引擎」时生效，不打断进行中的会话 */
  initialBalance: number;
  /** 交易可视化（挂单线 / 持仓线 / TP-SL / 进出场标记）在图表上的显隐 */
  showTrading: boolean;
}

const DEFAULT_PREFS: TradePrefs = {
  defaultQty: 0.01,
  stopOffsetPct: 1,
  initialBalance: 100_000,
  showTrading: true,
};

/** 数值字段：非有限数回默认，有限数按区间 clamp（手改坏值不弃整档） */
function readNumber(v: unknown, d: number, limits: { min: number; max: number }): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d;
  return Math.min(limits.max, Math.max(limits.min, v));
}

function readBool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}

/** 数量精度：与 TRADE_LIMITS.qty.min（0.0001）同口径 */
const QTY_DECIMALS = 4;

/** 归一小数位：UI 的 NumberStepper 对字段值直接加减，二进制浮点噪声（0.01+0.01 →
 *  0.020000000000000004）会随 setter 进内存并落盘、再流入下单表单，故写入前按精度收拢。 */
function round(v: number, decimals: number): number {
  return Number(v.toFixed(decimals));
}

/** 宽容读档：未知对象 → 偏好，逐字段回落 */
export function parseTradePrefs(v: unknown): TradePrefs {
  const s = (v ?? {}) as Record<string, unknown>;
  return {
    defaultQty: readNumber(s.defaultQty, DEFAULT_PREFS.defaultQty, TRADE_LIMITS.qty),
    stopOffsetPct: readNumber(s.stopOffsetPct, DEFAULT_PREFS.stopOffsetPct, TRADE_LIMITS.slPct),
    initialBalance: readNumber(s.initialBalance, DEFAULT_PREFS.initialBalance, TRADE_LIMITS.balance),
    showTrading: readBool(s.showTrading, DEFAULT_PREFS.showTrading),
  };
}

function loadPrefs(): TradePrefs {
  let raw: string | null = null;
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFS;
    raw = localStorage.getItem(TRADE_SETTINGS_STORAGE_KEY);
  } catch {
    return DEFAULT_PREFS;
  }
  if (!raw) return DEFAULT_PREFS;
  try {
    return parseTradePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: TradePrefs): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TRADE_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, ...p }));
  } catch {
    /* 隐私模式 / 存储超额：内存态继续可用，不阻断下单 */
  }
}

export interface TradeSettingsStore extends TradePrefs {
  setDefaultQty: (v: number) => void;
  setStopOffsetPct: (v: number) => void;
  setInitialBalance: (v: number) => void;
  setShowTrading: (v: boolean) => void;
}

const INITIAL = loadPrefs();

export const useTradeSettingsStore = create<TradeSettingsStore>((set) => ({
  defaultQty: INITIAL.defaultQty,
  stopOffsetPct: INITIAL.stopOffsetPct,
  initialBalance: INITIAL.initialBalance,
  showTrading: INITIAL.showTrading,

  setDefaultQty: (v) => set({ defaultQty: round(v, QTY_DECIMALS) }),
  setStopOffsetPct: (v) => set({ stopOffsetPct: round(v, 2) }),
  setInitialBalance: (v) => set({ initialBalance: v }),
  setShowTrading: (v) => set({ showTrading: v }),
}));

// 单点落盘：setter 路径不必各自写盘；四字段全可落盘，故直接比对整片
let lastSaved: TradePrefs = { ...INITIAL };
useTradeSettingsStore.subscribe((s) => {
  const next: TradePrefs = {
    defaultQty: s.defaultQty,
    stopOffsetPct: s.stopOffsetPct,
    initialBalance: s.initialBalance,
    showTrading: s.showTrading,
  };
  if (JSON.stringify(next) === JSON.stringify(lastSaved)) return;
  lastSaved = next;
  savePrefs(next);
});
