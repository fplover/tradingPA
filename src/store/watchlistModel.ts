import type { Instrument } from '@/types/instrument';

/**
 * 自选股领域模型：列定义、列表与落盘结构、常量。
 * 只放纯类型与常量，不引 store/persist —— 供 watchlistPersist 与 watchlistStore 共用，
 * 避免「persist 需要 DEFAULT_COLUMNS、store 需要 load/save」形成运行时循环依赖。
 */

/** 列表可显示的数值列。默认只开「最新价 + 涨跌幅」，与 TradingView 一致。 */
export type ColumnId = 'last' | 'changePct' | 'change' | 'volume' | 'amount' | 'open' | 'high' | 'low' | 'prevClose';
export type SortKey = ColumnId | 'symbol' | 'name';
/** manual = 用户手动排列的顺序；点列头在 升 → 降 → 手动 之间三态循环 */
export type SortDir = 'asc' | 'desc' | 'manual';

export interface ColumnDef {
  id: ColumnId;
  label: string;
}

export const COLUMNS: ColumnDef[] = [
  { id: 'last', label: '最新价' },
  { id: 'changePct', label: '涨跌幅' },
  { id: 'change', label: '涨跌额' },
  { id: 'volume', label: '成交量' },
  { id: 'amount', label: '成交额' },
  { id: 'open', label: '今开' },
  { id: 'high', label: '最高' },
  { id: 'low', label: '最低' },
  { id: 'prevClose', label: '昨收' },
];

export const DEFAULT_COLUMNS: ColumnId[] = ['last', 'changePct'];

export interface Watchlist {
  id: string;
  name: string;
  items: Instrument[];
}

/** 落盘结构：整体存取（见 watchlistPersist.save），不做逐字段 diff */
export interface Persisted {
  lists: Watchlist[];
  activeListId: string;
  activeId: string | null;
  flagged: string[];
  recent: Instrument[];
  columns: ColumnId[];
  sort: { key: SortKey; dir: SortDir };
}

/** 「最近访问」保留的品种条数上限 */
export const RECENT_MAX = 12;
