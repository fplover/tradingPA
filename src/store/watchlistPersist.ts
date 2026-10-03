import { makeInstrument } from '@/types/instrument';
import { DEFAULT_COLUMNS, type Persisted, type Watchlist } from './watchlistModel';

/**
 * 自选股持久化层（自 watchlistStore.ts 外提，该文件曾超 300 行红线）。
 * 纯 localStorage 读写与旧档迁移，不依赖 store —— 供 store 模块体调用 load() 初始化。
 * 行为与迁移前逐字一致。
 */

const STORAGE_KEY = 'tradingpa.watchlist.v2';
/** 旧版只存 Binance 符号字符串，迁移为 crypto 品种，不丢用户已有收藏 */
const LEGACY_KEY = 'tradingpa.watchlist';

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

export function load(): Persisted {
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

/** 每次变更整体落盘：结构小，逐字段 diff 反而更容易漏 */
export function save(s: Persisted): void {
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
