import type { Bar, TimeframeId } from '@/types/market';
import { getTimeframe } from '@/types/market';
import type { Instrument } from '@/types/instrument';
import { aggregateBars } from '@/data/aggregate';
import { fetchGbk } from './http';
import { NoHistoryError, type BarsRequest, type MarketSource } from './types';

/**
 * 新浪财经：国内期货全部周期 + 美股分钟线（腾讯不提供美股分钟数据）。
 * 该站校验 Referer 且不带 CORS 头，浏览器无法直连，开发环境经 vite 代理注入 Referer。
 * 生产构建没有代理，这两个市场会退化为「暂无数据源」——这是已知边界。
 */

const HOSTS = {
  futures: { direct: 'https://stock2.finance.sina.com.cn', proxy: '/sina-futures' },
  us: { direct: 'https://stock.finance.sina.com.cn', proxy: '/sina-us' },
} as const;

function baseOf(kind: keyof typeof HOSTS): string {
  const h = HOSTS[kind];
  return import.meta.env.DEV ? h.proxy : h.direct;
}

interface SinaBar {
  d: string;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

type ActivePlan = { kind: 'minute'; type: number } | { kind: 'daily' };
type Plan = ActivePlan | { kind: 'none' };

/** 分钟线只支持 1/5/15/30/60；其余周期取更细的基础数据本地聚合 */
function planFor(tf: TimeframeId): Plan {
  switch (tf) {
    case '1m':
      return { kind: 'minute', type: 1 };
    case '3m':
      return { kind: 'minute', type: 1 };
    case '5m':
      return { kind: 'minute', type: 5 };
    case '15m':
      return { kind: 'minute', type: 15 };
    case '30m':
      return { kind: 'minute', type: 30 };
    case '1H':
    case '2H':
    case '4H':
    case '6H':
    case '8H':
    case '12H':
      return { kind: 'minute', type: 60 };
    case '1D':
    case '3D':
    case '1W':
    case '1M':
      return { kind: 'daily' };
    default:
      return { kind: 'none' };
  }
}

/** 日 K "2009-03-27"；分钟 K "2026-09-03 14:35:00"。
 *  按交易所本地墙上时间解析（期货=北京时间，美股=美东时间），与坐标轴的本地时间格式化一致。 */
function parseTime(s: string): number {
  const date = s.slice(0, 10).split('-').map(Number);
  if (s.length <= 10) return new Date(date[0], date[1] - 1, date[2]).getTime();
  const t = s.slice(11).split(':').map(Number);
  return new Date(date[0], date[1] - 1, date[2], t[0] || 0, t[1] || 0, t[2] || 0).getTime();
}

/** 响应形如 `/*...*\/\nvar t=([...]);`，取最外层括号内的 JSON */
function unwrap(text: string): SinaBar[] {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close <= open) return [];
  try {
    const parsed = JSON.parse(text.slice(open + 1, close)) as SinaBar[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 各市场的新浪服务路径。期货代码需大写（RB2610），美股用裸代码。
 *  主连后缀两家不一致：东财 `rbm`，新浪 `RB0`。合约代码恒以数字结尾，故以 M 结尾即主连。 */
function sinaSymbol(inst: Instrument): string {
  const code = inst.code.toUpperCase();
  return code.endsWith('M') ? `${code.slice(0, -1)}0` : code;
}

function serviceFor(inst: Instrument, plan: ActivePlan): string | null {
  if (inst.market === 'cn-fut') {
    const sym = sinaSymbol(inst);
    const path = `${baseOf('futures')}/futures/api/jsonp.php/var%20t=`;
    return plan.kind === 'daily'
      ? `${path}/InnerFuturesNewService.getDailyKLine?symbol=${sym}`
      : `${path}/InnerFuturesNewService.getFewMinLine?symbol=${sym}&type=${plan.type}`;
  }
  if (inst.market.startsWith('us-')) {
    const sym = inst.code.toUpperCase();
    const path = `${baseOf('us')}/usstock/api/jsonp_v2.php/var%20t=`;
    return plan.kind === 'daily'
      ? `${path}/US_MinKService.getDailyK?symbol=${sym}`
      : `${path}/US_MinKService.getMinK?symbol=${sym}&type=${plan.type}`;
  }
  return null;
}

export const sinaSource: MarketSource = {
  name: '新浪财经',
  markets: ['cn-fut', 'us-nasdaq', 'us-nyse', 'us-amex'],

  async bars({ instrument, timeframe }: BarsRequest): Promise<Bar[]> {
    const plan = planFor(timeframe);
    if (plan.kind === 'none') throw new NoHistoryError(instrument, timeframe);
    const url = serviceFor(instrument, plan);
    if (!url) throw new NoHistoryError(instrument, timeframe);

    const rows = unwrap(await fetchGbk(url, 15_000));
    if (rows.length === 0) throw new NoHistoryError(instrument, timeframe);

    const bars: Bar[] = rows.map((r) => ({
      time: parseTime(r.d),
      open: Number(r.o),
      high: Number(r.h),
      low: Number(r.l),
      close: Number(r.c),
      volume: Number(r.v) || 0,
    }));

    const tf = getTimeframe(timeframe);
    const baseSeconds = plan.kind === 'daily' ? 86_400 : plan.type * 60;
    // 新浪一次给全上市以来的数据，不截断，向左滚动无需再翻页
    if (tf.calendar === undefined && tf.seconds <= baseSeconds) return bars;
    return aggregateBars(bars, tf);
  },

  async barsBefore(): Promise<Bar[]> {
    return [];
  },
};
