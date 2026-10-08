// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { load } from '@/store/watchlistPersist';
import { DEFAULT_COLUMNS } from '@/store/watchlistModel';
import { makeInstrument } from '@/types/instrument';

/**
 * watchlistPersist 坏档枚举校验（第四轮审查低优先项）：
 * 读档对枚举字段（instrument.market/asset、columns、sort.key/dir）与结构字段
 * （list.name、flagged、recent）做校验——无效 instrument 整条丢弃，枚举字段级
 * 回退默认，坏值不进 store。
 */

const KEY = 'tradingpa.watchlist.v2';
const LEGACY_KEY = 'tradingpa.watchlist';

const GOOD = makeInstrument('cn-sh', '600519', '贵州茅台', { exchange: 'SSE' });

function persisted(patch: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    lists: [{ id: 'l1', name: '我的列表', items: [GOOD] }],
    activeListId: 'l1',
    activeId: GOOD.id,
    flagged: [],
    recent: [],
    columns: ['last'],
    sort: { key: 'symbol', dir: 'manual' },
    ...patch,
  });
}

describe('watchlistPersist 坏档枚举校验', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('好档完整装载：各字段原样进 store（回归）', () => {
    localStorage.setItem(KEY, persisted());
    const s = load();
    expect(s.lists).toHaveLength(1);
    expect(s.lists[0].name).toBe('我的列表');
    expect(s.lists[0].items).toEqual([GOOD]);
    expect(s.activeListId).toBe('l1');
    expect(s.activeId).toBe(GOOD.id);
    expect(s.columns).toEqual(['last']);
    expect(s.sort).toEqual({ key: 'symbol', dir: 'manual' });
  });

  it('无效 market/asset 的 instrument 整条丢弃，同列表其余品种保留', () => {
    localStorage.setItem(
      KEY,
      persisted({
        lists: [
          {
            id: 'l1',
            name: '混合',
            items: [
              GOOD,
              { ...GOOD, id: 'x:1', market: 'mars' }, // 市场枚举坏值
              { ...GOOD, id: 'x:2', asset: 'widget' }, // 资产类别枚举坏值
              { ...GOOD, id: 'x:3', decimals: '2' }, // decimals 非有限数
              { id: 'x:4', code: '4', name: '缺字段', market: 'cn-sh', asset: 'stock' }, // 缺 symbol/exchange/decimals
              null,
            ],
          },
        ],
      }),
    );
    const s = load();
    expect(s.lists[0].items.map((i) => i.id)).toEqual([GOOD.id]);
  });

  it('list.name 非字符串回退默认名；不整条丢弃列表', () => {
    localStorage.setItem(
      KEY,
      persisted({
        lists: [{ id: 'l1', name: 42, items: [GOOD] }],
      }),
    );
    const s = load();
    expect(s.lists).toHaveLength(1);
    expect(s.lists[0].name).toBe('自选股');
    expect(s.lists[0].items).toEqual([GOOD]);
  });

  it('columns 过滤无效 ColumnId；全无效回退默认列', () => {
    localStorage.setItem(KEY, persisted({ columns: ['last', 'bogusCol', 'changePct'] }));
    expect(load().columns).toEqual(['last', 'changePct']);

    localStorage.setItem(KEY, persisted({ columns: ['nope'] }));
    expect(load().columns).toEqual(DEFAULT_COLUMNS);

    localStorage.setItem(KEY, persisted({ columns: [] }));
    expect(load().columns).toEqual(DEFAULT_COLUMNS);
  });

  it('sort 字段级回退：key/dir 各自校验，坏值落默认、好值保留', () => {
    localStorage.setItem(KEY, persisted({ sort: { key: 'bogus', dir: 'sideways' } }));
    expect(load().sort).toEqual({ key: 'symbol', dir: 'manual' });

    localStorage.setItem(KEY, persisted({ sort: { key: 'volume', dir: 'desc' } }));
    expect(load().sort).toEqual({ key: 'volume', dir: 'desc' });

    localStorage.setItem(KEY, persisted({ sort: { dir: 'asc' } }));
    expect(load().sort).toEqual({ key: 'symbol', dir: 'asc' });

    localStorage.setItem(KEY, persisted({ sort: null }));
    expect(load().sort).toEqual({ key: 'symbol', dir: 'manual' });
  });

  it('flagged 过滤非字符串；recent 丢弃无效 instrument、保留有效', () => {
    localStorage.setItem(
      KEY,
      persisted({
        flagged: [GOOD.id, 7, null, 'cn-sh:600519'],
        recent: [GOOD, { ...GOOD, id: 'x:9', market: 'mars' }],
      }),
    );
    const s = load();
    expect(s.flagged).toEqual([GOOD.id, 'cn-sh:600519']);
    expect(s.recent.map((i) => i.id)).toEqual([GOOD.id]);
  });

  it('全部列表条目无效 → 回默认列表（含默认多市场品种）', () => {
    localStorage.setItem(KEY, persisted({ lists: [{ id: 'l1', name: '坏', items: 'not-array' }] }));
    const s = load();
    expect(s.lists[0].id).toBe('default');
    expect(s.lists[0].items.length).toBeGreaterThan(0);
    expect(s.columns).toEqual(DEFAULT_COLUMNS);
  });

  it('JSON 损坏 → 回默认（既有行为回归）', () => {
    localStorage.setItem(KEY, '{oops');
    const s = load();
    expect(s.lists[0].id).toBe('default');
    expect(s.sort).toEqual({ key: 'symbol', dir: 'manual' });
  });

  it('旧版符号档仍迁移为 crypto 列表（迁移路径回归）', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(['BTCUSDT', 'ETHUSDT']));
    const s = load();
    const crypto = s.lists.find((l) => l.id === 'crypto');
    expect(crypto?.items.map((i) => i.id)).toEqual(['crypto:BTCUSDT', 'crypto:ETHUSDT']);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull(); // 迁移后清除旧键
  });
});
