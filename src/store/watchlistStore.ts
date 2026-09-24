import { create } from 'zustand';
import type { Instrument } from '@/types/instrument';
import { makeInstrument } from '@/types/instrument';

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

interface Persisted {
  lists: Watchlist[];
  activeListId: string;
  activeId: string | null;
  flagged: string[];
  recent: Instrument[];
  columns: ColumnId[];
  sort: { key: SortKey; dir: SortDir };
}

const STORAGE_KEY = 'tradingpa.watchlist.v2';
/** 旧版只存 Binance 符号字符串，迁移为 crypto 品种，不丢用户已有收藏 */
const LEGACY_KEY = 'tradingpa.watchlist';
const RECENT_MAX = 12;

function defaultList(): Watchlist {
  return {
    id: 'default',
    name: '自选股',
    items: [
      makeInstrument('cn-index', '000001', '上证指数', { exchange: 'SSE' }),
      makeInstrument('cn-sh', '600519', '贵州茅台', { exchange: 'SSE' }),
      makeInstrument('cn-sz', '300750', '宁德时代', { exchange: 'SZSE' }),
      makeInstrument('cn-sh', '601318', '中国平安', { exchange: 'SSE' }),
      makeInstrument('hk', '00700', '腾讯控股', { exchange: 'HKEX' }),
      makeInstrument('us-nasdaq', 'AAPL', '苹果', { exchange: 'NASDAQ' }),
      makeInstrument('us-nasdaq', 'NVDA', '英伟达', { exchange: 'NASDAQ' }),
      makeInstrument('cn-fut', 'rbm', '螺纹钢主连', { exchange: 'SHFE', decimals: 0 }),
      makeInstrument('global-fut', 'GC00Y', 'COMEX黄金', { exchange: 'COMEX' }),
      makeInstrument('global-fut', 'CL00Y', 'NYMEX原油', { exchange: 'NYMEX' }),
    ],
  };
}

function migrateLegacy(): Watchlist | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list) || list.length === 0) return null;
    const items = list
      .filter((s): s is string => typeof s === 'string')
      .map((s) => makeInstrument('crypto', s.toUpperCase(), s.toUpperCase(), { exchange: 'BINANCE' }));
    if (items.length === 0) return null;
    localStorage.removeItem(LEGACY_KEY);
    return { id: 'crypto', name: '加密货币', items };
  } catch {
    return null;
  }
}

function baseState(lists: Watchlist[]): Persisted {
  return {
    lists,
    activeListId: lists[0].id,
    activeId: lists[0].items[1]?.id ?? lists[0].items[0]?.id ?? null,
    flagged: [],
    recent: [],
    columns: [...DEFAULT_COLUMNS],
    sort: { key: 'symbol', dir: 'manual' },
  };
}

function load(): Persisted {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* 隐私模式下 localStorage 会抛错 */
  }

  // 首次使用：默认多市场列表 + 迁移旧版加密收藏
  if (!raw) {
    const lists = [defaultList()];
    const legacy = migrateLegacy();
    if (legacy) lists.push(legacy);
    return baseState(lists);
  }

  const base = baseState([defaultList()]);
  try {
    const p = JSON.parse(raw) as Partial<Persisted>;
    const lists = Array.isArray(p.lists)
      ? p.lists.filter((l) => l && typeof l.id === 'string' && Array.isArray(l.items))
      : [];
    if (lists.length === 0) return base;
    const activeListId = lists.some((l) => l.id === p.activeListId) ? (p.activeListId as string) : lists[0].id;
    return {
      lists,
      activeListId,
      activeId: typeof p.activeId === 'string' ? p.activeId : (lists[0].items[0]?.id ?? null),
      flagged: Array.isArray(p.flagged) ? p.flagged : [],
      recent: Array.isArray(p.recent) ? p.recent : [],
      columns: Array.isArray(p.columns) && p.columns.length > 0 ? p.columns : base.columns,
      sort: p.sort && p.sort.key ? p.sort : base.sort,
    };
  } catch {
    /* 损坏的存档直接回默认 */
    return base;
  }
}

interface WatchlistStore extends Persisted {
  add: (instrument: Instrument, listId?: string) => void;
  remove: (instrumentId: string, listId?: string) => void;
  /** 拖拽排序，索引针对当前列表 */
  reorder: (from: number, to: number) => void;
  setActive: (instrument: Instrument) => void;
  toggleFlag: (instrumentId: string) => void;
  createList: (name?: string) => void;
  deleteList: (listId: string) => void;
  renameList: (listId: string, name: string) => void;
  duplicateList: (listId: string) => void;
  switchList: (listId: string) => void;
  toggleColumn: (col: ColumnId) => void;
  cycleSort: (key: SortKey) => void;
}

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** 每次变更整体落盘：结构小，逐字段 diff 反而更容易漏 */
function save(s: WatchlistStore): void {
  const payload: Persisted = {
    lists: s.lists,
    activeListId: s.activeListId,
    activeId: s.activeId,
    flagged: s.flagged,
    recent: s.recent,
    columns: s.columns,
    sort: s.sort,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* 存储不可用时忽略 */
  }
}

function mapList(lists: Watchlist[], listId: string, fn: (l: Watchlist) => Watchlist): Watchlist[] {
  return lists.map((l) => (l.id === listId ? fn(l) : l));
}

export const useWatchlistStore = create<WatchlistStore>((set) => {
  /** 变更 lists 的统一入口，顺带持久化 */
  const commit = (patch: (s: WatchlistStore) => Partial<WatchlistStore>) =>
    set((s) => {
      const next = { ...s, ...patch(s) } as WatchlistStore;
      save(next);
      return next;
    });

  return {
    ...load(),

    add: (instrument, listId) =>
      commit((s) => {
        const target = listId ?? s.activeListId;
        return {
          lists: mapList(s.lists, target, (l) =>
            l.items.some((i) => i.id === instrument.id) ? l : { ...l, items: [...l.items, instrument] },
          ),
        };
      }),

    remove: (instrumentId, listId) =>
      commit((s) => {
        const target = listId ?? s.activeListId;
        const lists = mapList(s.lists, target, (l) => ({
          ...l,
          items: l.items.filter((i) => i.id !== instrumentId),
        }));
        // 删掉的是当前图表品种时，回落到列表首项
        if (s.activeId !== instrumentId) return { lists };
        const list = lists.find((l) => l.id === target);
        return { lists, activeId: list?.items[0]?.id ?? null };
      }),

    reorder: (from, to) =>
      commit((s) => {
        const items = [...(s.lists.find((l) => l.id === s.activeListId)?.items ?? [])];
        if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return {};
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        return {
          lists: mapList(s.lists, s.activeListId, (l) => ({ ...l, items })),
          sort: { key: s.sort.key, dir: 'manual' },
        };
      }),

    setActive: (instrument) =>
      commit((s) => ({
        activeId: instrument.id,
        recent: [instrument, ...s.recent.filter((i) => i.id !== instrument.id)].slice(0, RECENT_MAX),
      })),

    toggleFlag: (instrumentId) =>
      commit((s) => ({
        flagged: s.flagged.includes(instrumentId)
          ? s.flagged.filter((x) => x !== instrumentId)
          : [...s.flagged, instrumentId],
      })),

    createList: (name) =>
      commit((s) => {
        const list: Watchlist = { id: newId('list'), name: name ?? `列表 ${s.lists.length + 1}`, items: [] };
        return { lists: [...s.lists, list], activeListId: list.id };
      }),

    deleteList: (listId) =>
      commit((s) => {
        if (s.lists.length <= 1) return {};
        const lists = s.lists.filter((l) => l.id !== listId);
        return {
          lists,
          activeListId: s.activeListId === listId ? lists[0].id : s.activeListId,
        };
      }),

    renameList: (listId, name) =>
      commit((s) => ({
        lists: mapList(s.lists, listId, (l) => ({ ...l, name: name.trim() || l.name })),
      })),

    duplicateList: (listId) =>
      commit((s) => {
        const src = s.lists.find((l) => l.id === listId);
        if (!src) return {};
        const copy: Watchlist = { id: newId('list'), name: `${src.name} 副本`, items: [...src.items] };
        return { lists: [...s.lists, copy], activeListId: copy.id };
      }),

    switchList: (listId) => commit(() => ({ activeListId: listId })),

    toggleColumn: (col) =>
      commit((s) => {
        const has = s.columns.includes(col);
        // 至少保留一列，否则行右侧空白
        if (has && s.columns.length <= 1) return {};
        const columns = has ? s.columns.filter((c) => c !== col) : [...s.columns, col];
        return { columns: columns.sort((a, b) => COLUMNS.findIndex((c) => c.id === a) - COLUMNS.findIndex((c) => c.id === b)) };
      }),

    cycleSort: (key) =>
      commit((s) => {
        if (s.sort.key !== key) return { sort: { key, dir: 'asc' } };
        const dir: SortDir = s.sort.dir === 'asc' ? 'desc' : s.sort.dir === 'desc' ? 'manual' : 'asc';
        return { sort: { key, dir } };
      }),
  };
});

/** 当前列表 */
export function selectActiveList(s: WatchlistStore): Watchlist {
  return s.lists.find((l) => l.id === s.activeListId) ?? s.lists[0];
}

/** 当前图表品种。被删除后可能落到 null，调用方需容错。 */
export function selectActiveInstrument(s: WatchlistStore): Instrument | null {
  if (!s.activeId) return null;
  for (const list of s.lists) {
    const hit = list.items.find((i) => i.id === s.activeId);
    if (hit) return hit;
  }
  return s.recent.find((i) => i.id === s.activeId) ?? null;
}
