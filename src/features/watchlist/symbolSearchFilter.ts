import type { AssetClass, Instrument, MarketId } from '@/types/instrument';
import type { SearchHit } from '@/data/sources/types';
import type { Watchlist } from '@/store/watchlistStore';

/** 顶部分类。按市场而非纯资产类别切分，A股/美股/国内外期货才能各自成组。 */
export interface TabDef {
  id: string;
  label: string;
  /** 传给搜索接口的资产类别，用于让期货走合约全集 */
  asset?: AssetClass;
  markets?: MarketId[];
}

export const TABS: TabDef[] = [
  { id: 'all', label: '全部' },
  { id: 'cn', label: 'A股', markets: ['cn-sh', 'cn-sz', 'cn-bj'] },
  { id: 'hk', label: '港股', markets: ['hk'] },
  { id: 'us', label: '美股', markets: ['us-nasdaq', 'us-nyse', 'us-amex'] },
  { id: 'cnfut', label: '国内期货', asset: 'futures', markets: ['cn-fut'] },
  { id: 'globalfut', label: '外盘期货', asset: 'futures', markets: ['global-fut'] },
  { id: 'index', label: '指数', asset: 'index', markets: ['cn-index'] },
  { id: 'forex', label: '外汇', asset: 'forex', markets: ['forex'] },
  { id: 'crypto', label: '加密', asset: 'crypto', markets: ['crypto'] },
];

/** 结果分组：label = 分组标题（null = 搜索结果无分组）；items 展平后即键盘导航的行序列 */
export interface ResultSection {
  label: string | null;
  items: SearchHit[];
}

/**
 * 分组构建（纯函数，自 SymbolSearchDialog 拆出）：
 * 空查询 = 收藏置顶 + 最近访问；有查询 = 搜索结果（整段无分组标题）。
 */
export function buildResultSections(
  showingRecent: boolean,
  hits: SearchHit[],
  recent: Instrument[],
  flagged: string[],
  lists: Watchlist[],
  tab: TabDef,
): ResultSection[] {
  if (!showingRecent) return hits.length > 0 ? [{ label: null, items: hits }] : [];
  const inTab = (i: Instrument) =>
    (!tab.markets || tab.markets.includes(i.market)) && (!tab.asset || i.asset === tab.asset);
  // 收藏（flagged 存 id）：经全部列表 + 最近访问解析回品种；被移除的 id 静默跳过
  const byId = new Map<string, Instrument>();
  for (const l of lists) for (const i of l.items) byId.set(i.id, i);
  for (const i of recent) byId.set(i.id, i);
  const fav = flagged
    .map((id) => byId.get(id))
    .filter((i): i is Instrument => !!i)
    .filter(inTab);
  const favIds = new Set(fav.map((i) => i.id));
  // 最近访问剔除已在收藏分组的品种，避免同一行在两个分组重复出现
  const rec = recent.filter(inTab).filter((i) => !favIds.has(i.id));
  const out: ResultSection[] = [];
  if (fav.length > 0)
    out.push({ label: '收藏', items: fav.map((i): SearchHit => ({ instrument: i, source: '收藏' })) });
  if (rec.length > 0)
    out.push({ label: '最近访问', items: rec.map((i): SearchHit => ({ instrument: i, source: '最近访问' })) });
  return out;
}

export function filterByTab(hits: SearchHit[], tab: TabDef): SearchHit[] {
  return hits.filter((h) => {
    if (tab.markets && !tab.markets.includes(h.instrument.market)) return false;
    if (tab.asset && h.instrument.asset !== tab.asset) return false;
    return true;
  });
}
