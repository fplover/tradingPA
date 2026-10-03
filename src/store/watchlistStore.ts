import { create } from 'zustand';
import type { Instrument } from '@/types/instrument';
import {
  COLUMNS,
  RECENT_MAX,
  type ColumnId,
  type Persisted,
  type SortDir,
  type SortKey,
  type Watchlist,
} from './watchlistModel';
import { load, save } from './watchlistPersist';

/**
 * 自选股 store。模型与常量在 watchlistModel.ts、localStorage 读写在 watchlistPersist.ts，
 * 本文件只留 store 本体与 selector（该文件曾超 300 行红线）。
 * 类型/列定义经本模块按原路径再导出，13 处调用点零改动。
 */
export { COLUMNS, DEFAULT_COLUMNS } from './watchlistModel';
export type { ColumnDef, ColumnId, SortDir, SortKey, Watchlist } from './watchlistModel';

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
