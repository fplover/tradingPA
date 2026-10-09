import type { AssetClass, Instrument, MarketId } from '@/types/instrument';
import { makeInstrument } from '@/types/instrument';
import { fetchJson, fetchJsonp } from './http';
import type { Quote, SearchHit, SearchSource } from './types';

/**
 * 东方财富：全市场符号搜索 + 期货（国内/外盘）合约列表与实时报价。
 * - searchapi 不带 CORS 头，但支持 cb 回调参数，走 JSONP。
 * - futsseapi 返回 Access-Control-Allow-Origin: *，可直连；push2 系列在本网络不可达，故不用。
 */

const SUGGEST_URL = 'https://searchapi.eastmoney.com/api/suggest/get';
const FUT_LIST_URL = 'https://futsseapi.eastmoney.com/list';

/** 东财期货市场号 → 市场归属与交易所名 */
const FUT_MARKETS: Record<string, { market: MarketId; exchange: string }> = {
  '113': { market: 'cn-fut', exchange: 'SHFE' },
  '114': { market: 'cn-fut', exchange: 'DCE' },
  '115': { market: 'cn-fut', exchange: 'CZCE' },
  '142': { market: 'cn-fut', exchange: 'INE' },
  '8': { market: 'cn-fut', exchange: 'CFFEX' },
  '118': { market: 'cn-fut', exchange: 'SGE' },
  '101': { market: 'global-fut', exchange: 'COMEX' },
  '102': { market: 'global-fut', exchange: 'NYMEX' },
  '103': { market: 'global-fut', exchange: 'CBOT' },
  '104': { market: 'global-fut', exchange: 'SGX' },
  '108': { market: 'global-fut', exchange: 'ICE' },
  '109': { market: 'global-fut', exchange: 'LME' },
  '110': { market: 'global-fut', exchange: 'BMD' },
  '111': { market: 'global-fut', exchange: 'TOCOM' },
  '112': { market: 'global-fut', exchange: 'SGX' },
};

const FUT_FIELDS = 'dm,name,p,zde,zdf,o,h,l,vol,ccl';

interface FutRow {
  dm: string;
  name: string;
  p: number | string;
  zde: number | string;
  zdf: number | string;
  o: number | string;
  h: number | string;
  l: number | string;
  vol: number;
  ccl: number;
}

interface FutListResp {
  total?: number;
  list?: FutRow[];
  result?: string;
}

interface SuggestItem {
  Code: string;
  Name: string;
  PinYin?: string;
  JYS?: string;
  Classify?: string;
  SecurityTypeName?: string;
  MktNum?: string;
  QuoteID?: string;
}

interface SuggestResp {
  QuotationCodeTable?: { Data?: SuggestItem[] | null };
}

/** 合约列表缓存：一次请求覆盖整个交易所，报价与搜索共用 */
const listCache = new Map<string, { at: number; rows: FutRow[]; mkt: string }>();
const LIST_TTL = 20_000;
const inflight = new Map<string, Promise<FutRow[]>>();

async function loadFutList(mkt: string): Promise<FutRow[]> {
  const hit = listCache.get(mkt);
  if (hit && Date.now() - hit.at < LIST_TTL) return hit.rows;
  const pending = inflight.get(mkt);
  if (pending) return pending;

  const task = fetchJson<FutListResp>(
    `${FUT_LIST_URL}/${mkt}?orderBy=zdf&sort=desc&pageSize=600&pageIndex=0&field=${FUT_FIELDS}`,
  )
    .then((resp) => {
      const rows = Array.isArray(resp.list) ? resp.list : [];
      listCache.set(mkt, { at: Date.now(), rows, mkt });
      return rows;
    })
    .catch(() => [] as FutRow[]);
  inflight.set(mkt, task);
  try {
    return await task;
  } finally {
    inflight.delete(mkt);
  }
}

/** 期货小数位：从合约价格推断，避免把 3117 显示成 3117.00 */
function decimalsOf(price: number): number {
  if (!Number.isFinite(price) || price === 0) return 1;
  const s = String(price);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(3, s.length - dot - 1);
}

function futuresInstrument(mkt: string, row: FutRow): Instrument | null {
  const def = FUT_MARKETS[mkt];
  if (!def) return null;
  const price = Number(row.p);
  return makeInstrument(def.market, row.dm, row.name, {
    exchange: def.exchange,
    decimals: decimalsOf(Number.isFinite(price) ? price : 0),
  });
}

/** 东财市场号 + 分类 → 股票/指数 Instrument */
function stockInstrument(item: SuggestItem): Instrument | null {
  const mkt = item.MktNum ?? '';
  const code = item.Code;
  const cls = item.Classify ?? '';
  const typeName = item.SecurityTypeName ?? '';
  const name = item.Name || code;

  if (mkt === '1') {
    const isIndex = cls === 'Index' || typeName.includes('指数');
    return makeInstrument(isIndex ? 'cn-index' : 'cn-sh', code, name, { exchange: 'SSE' });
  }
  if (mkt === '0') {
    const isIndex = cls === 'Index' || typeName.includes('指数');
    // 北交所代码以 4/8/92 开头
    const bj = !isIndex && /^(4|8|92)/.test(code);
    const market: MarketId = isIndex ? 'cn-index' : bj ? 'cn-bj' : 'cn-sz';
    return makeInstrument(market, code, name, { exchange: isIndex ? 'SZSE' : bj ? 'BSE' : 'SZSE' });
  }
  if (mkt === '116') return makeInstrument('hk', code, name, { exchange: 'HKEX' });
  if (mkt === '133') return makeInstrument('forex', code, name);
  if (mkt === '105') return makeInstrument('us-nasdaq', code, name, { exchange: 'NASDAQ' });
  if (mkt === '106') return makeInstrument('us-nyse', code, name, { exchange: 'NYSE' });
  if (mkt === '107') return makeInstrument('us-amex', code, name, { exchange: 'AMEX' });

  const fut = FUT_MARKETS[mkt];
  if (fut) {
    return makeInstrument(fut.market, code, name, { exchange: fut.exchange });
  }
  return null;
}

const ASSET_OF_CLASS: Record<string, AssetClass> = {
  AStock: 'stock',
  UsStock: 'stock',
  HKStock: 'stock',
  Index: 'index',
  Futures: 'futures',
  Fund: 'fund',
  Bond: 'bond',
  Forex: 'forex',
  FOREX: 'forex',
};

/** 期货合约全集：搜索与报价共用，按交易所懒加载 */
export async function futuresUniverse(): Promise<Instrument[]> {
  const mkts = Object.keys(FUT_MARKETS);
  const lists = await Promise.all(mkts.map((m) => loadFutList(m).then((rows) => ({ m, rows }))));
  const out: Instrument[] = [];
  for (const { m, rows } of lists) {
    for (const row of rows) {
      const inst = futuresInstrument(m, row);
      if (inst) out.push(inst);
    }
  }
  return out;
}

export const eastmoneySearch: SearchSource = {
  name: '东方财富',

  async search(query, asset) {
    const q = query.trim();
    if (!q) return [];
    const url = `${SUGGEST_URL}?type=14&count=40&input=${encodeURIComponent(q)}`;
    const resp = await fetchJsonp<SuggestResp>(url, 'cb');
    const items = resp?.QuotationCodeTable?.Data ?? [];
    const hits: SearchHit[] = [];
    for (const item of items) {
      const inst = stockInstrument(item);
      if (!inst) continue;
      const itemAsset = ASSET_OF_CLASS[item.Classify ?? ''] ?? inst.asset;
      if (asset && itemAsset !== asset) continue;
      hits.push({ instrument: { ...inst, asset: itemAsset }, source: '东方财富' });
    }
    return hits;
  },

  universe: futuresUniverse,
};

/** 期货报价：从所属交易所的合约列表里取，一次请求覆盖同交易所全部品种 */
export async function futuresQuotes(instruments: Instrument[]): Promise<Quote[]> {
  const fut = instruments.filter((i) => i.asset === 'futures');
  if (fut.length === 0) return [];

  const byMkt = new Map<string, Instrument[]>();
  for (const inst of fut) {
    const mkt = Object.keys(FUT_MARKETS).find((m) => FUT_MARKETS[m].exchange === inst.exchange);
    if (!mkt) continue;
    const arr = byMkt.get(mkt) ?? [];
    arr.push(inst);
    byMkt.set(mkt, arr);
  }

  const out: Quote[] = [];
  for (const [mkt, wanted] of byMkt) {
    const rows = await loadFutList(mkt);
    const index = new Map(rows.map((r) => [r.dm.toLowerCase(), r]));
    for (const inst of wanted) {
      const row = index.get(inst.code.toLowerCase());
      if (!row) continue;
      const price = Number(row.p);
      if (!Number.isFinite(price) || price <= 0) continue;
      const change = Number(row.zde) || 0;
      out.push({
        id: inst.id,
        price,
        change,
        changePct: Number(row.zdf) || 0,
        prevClose: price - change,
        open: Number(row.o) || 0,
        high: Number(row.h) || 0,
        low: Number(row.l) || 0,
        volume: Number(row.vol) || 0,
        amount: 0,
        time: Date.now(),
      });
    }
  }
  return out;
}

/** 期货本地搜索：合约全集按代码/名称过滤，无需等待网络往返 */
export async function futuresSearch(query: string, asset?: AssetClass): Promise<SearchHit[]> {
  if (asset && asset !== 'futures') return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await futuresUniverse();
  const out: SearchHit[] = [];
  for (const inst of all) {
    if (inst.code.toLowerCase().includes(q) || inst.name.toLowerCase().includes(q)) {
      out.push({ instrument: inst, source: '期货合约' });
    }
    if (out.length >= 60) break;
  }
  return out;
}
