/** 跨市场品种模型。id 用 `${market}:${code}` 命名空间，避免不同交易所同码冲突
 *  （如 `cn-sh:600519` 与 `cn-fut:fu2610`；美股 CL 是高露洁，期货 CL 是原油）。 */

/** 资产类别：对齐符号搜索弹窗的分类 tab */
export type AssetClass = 'stock' | 'futures' | 'index' | 'fund' | 'bond' | 'forex' | 'crypto';

/** 市场：决定数据源路由、交易时段与代码拼写规则 */
export type MarketId =
  | 'cn-sh'
  | 'cn-sz'
  | 'cn-bj'
  | 'hk'
  | 'us-nasdaq'
  | 'us-nyse'
  | 'us-amex'
  | 'cn-index'
  | 'cn-fut'
  | 'global-fut'
  | 'forex'
  | 'crypto';

export interface Instrument {
  /** 全局唯一 id */
  id: string;
  /** 交易所内代码，原样保存（大小写敏感：期货 `rb2610`、美股 `AAPL`） */
  code: string;
  /** 展示用简称，图表图例与列表首行 */
  symbol: string;
  /** 中文名/全称，列表次行 */
  name: string;
  market: MarketId;
  asset: AssetClass;
  /** 交易所名，如 NASDAQ / SHFE / COMEX */
  exchange: string;
  /** 价格小数位 */
  decimals: number;
}

export interface MarketDef {
  id: MarketId;
  /** 中文市场名，用于列表分组与搜索徽章 */
  label: string;
  asset: AssetClass;
  /** 国旗/地区二字码，用于搜索结果右侧徽章 */
  region: string;
  /** 价格小数位缺省值 */
  decimals: number;
}

export const MARKETS: Record<MarketId, MarketDef> = {
  'cn-sh': { id: 'cn-sh', label: '沪A', asset: 'stock', region: 'CN', decimals: 2 },
  'cn-sz': { id: 'cn-sz', label: '深A', asset: 'stock', region: 'CN', decimals: 2 },
  'cn-bj': { id: 'cn-bj', label: '京A', asset: 'stock', region: 'CN', decimals: 2 },
  hk: { id: 'hk', label: '港股', asset: 'stock', region: 'HK', decimals: 3 },
  'us-nasdaq': { id: 'us-nasdaq', label: 'NASDAQ', asset: 'stock', region: 'US', decimals: 2 },
  'us-nyse': { id: 'us-nyse', label: 'NYSE', asset: 'stock', region: 'US', decimals: 2 },
  'us-amex': { id: 'us-amex', label: 'AMEX', asset: 'stock', region: 'US', decimals: 2 },
  'cn-index': { id: 'cn-index', label: '指数', asset: 'index', region: 'CN', decimals: 2 },
  'cn-fut': { id: 'cn-fut', label: '国内期货', asset: 'futures', region: 'CN', decimals: 1 },
  'global-fut': { id: 'global-fut', label: '外盘期货', asset: 'futures', region: 'US', decimals: 2 },
  forex: { id: 'forex', label: '外汇', asset: 'forex', region: '—', decimals: 4 },
  crypto: { id: 'crypto', label: '加密货币', asset: 'crypto', region: '—', decimals: 2 },
};

export function makeId(market: MarketId, code: string): string {
  return `${market}:${code}`;
}

export function parseId(id: string): { market: MarketId; code: string } | null {
  const i = id.indexOf(':');
  if (i < 1) return null;
  const market = id.slice(0, i) as MarketId;
  if (!(market in MARKETS)) return null;
  return { market, code: id.slice(i + 1) };
}

export function makeInstrument(
  market: MarketId,
  code: string,
  name: string,
  overrides: Partial<Pick<Instrument, 'symbol' | 'exchange' | 'decimals' | 'asset'>> = {},
): Instrument {
  const def = MARKETS[market];
  return {
    id: makeId(market, code),
    code,
    symbol: overrides.symbol ?? code,
    name: name || code,
    market,
    asset: overrides.asset ?? def.asset,
    exchange: overrides.exchange ?? def.label,
    decimals: overrides.decimals ?? def.decimals,
  };
}
