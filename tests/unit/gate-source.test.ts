import { describe, expect, it } from 'vitest';
import type { TimeframeId } from '@/types/market';
import { candlesUrl, parseCandle, planFor, toGatePair, tickerToQuote } from '@/data/sources/gate';

describe('交易对转换：Binance 形态 → Gate 形态', () => {
  it('常见计价资产', () => {
    expect(toGatePair('BTCUSDT')).toBe('BTC_USDT');
    expect(toGatePair('ETHBTC')).toBe('ETH_BTC');
    expect(toGatePair('SOLFDUSD')).toBe('SOL_FDUSD');
    expect(toGatePair('bnbusdc')).toBe('BNB_USDC');
    expect(toGatePair('ETHUSD')).toBe('ETH_USD');
  });

  it('识别不了的计价资产返回 null', () => {
    expect(toGatePair('BTC')).toBeNull();
    expect(toGatePair('USDT')).toBeNull();
    expect(toGatePair('XYZABC')).toBeNull();
  });
});

describe('蜡烛行解析：[ts, 计价量, 收, 高, 低, 开, 基础量]（收在开前，钉死）', () => {
  it('按 Gate 顺序取 OHLC', () => {
    const bar = parseCandle(['1791455040', '6511.58', '82962.9', '82987.5', '82962.8', '82986.5', '0.07847', 'true']);
    expect(bar).toEqual({
      time: 1791455040000,
      open: 82986.5,
      high: 82987.5,
      low: 82962.8,
      close: 82962.9,
      volume: 0.07847,
    });
  });

  it('脏行防护：字段不足 / 时间戳非数返回 null', () => {
    expect(parseCandle(['1791455040', '1', '2'])).toBeNull();
    expect(parseCandle(['abc', '1', '2', '3', '4', '5', '6'])).toBeNull();
  });
});

describe('周期计划：原生直取 / 非原生聚合 / 自定义', () => {
  it('原生周期不聚合', () => {
    expect(planFor('1m')).toEqual({ kind: 'bars', interval: '1m', baseSeconds: 60, aggregate: false });
    expect(planFor('1H')).toEqual({ kind: 'bars', interval: '1h', baseSeconds: 3600, aggregate: false });
    expect(planFor('2H')).toEqual({ kind: 'bars', interval: '2h', baseSeconds: 7200, aggregate: false });
    expect(planFor('1D')).toEqual({ kind: 'bars', interval: '1d', baseSeconds: 86_400, aggregate: false });
    expect(planFor('1W')).toEqual({ kind: 'bars', interval: '1d', baseSeconds: 86_400, aggregate: true }); // 周线为日历分桶，按日聚合（与 sina 同口径）
  });

  it('非原生周期取最大可整除基期后聚合', () => {
    expect(planFor('2m')).toEqual({ kind: 'bars', interval: '1m', baseSeconds: 60, aggregate: true });
    expect(planFor('45m')).toEqual({ kind: 'bars', interval: '15m', baseSeconds: 900, aggregate: true });
    expect(planFor('3H')).toEqual({ kind: 'bars', interval: '1h', baseSeconds: 3600, aggregate: true });
    expect(planFor('3D')).toEqual({ kind: 'bars', interval: '1d', baseSeconds: 86_400, aggregate: true });
    expect(planFor('1M')).toEqual({ kind: 'bars', interval: '1d', baseSeconds: 86_400, aggregate: true }); // 日历月按日聚合
    expect(planFor('1s')).toEqual({ kind: 'none' }); // Gate 无秒级，1s 留给 Binance
  });

  it('自定义周期归一化与 sina/tencent 同口径', () => {
    expect(planFor('custom:45' as TimeframeId)).toEqual({ kind: 'bars', interval: '15m', baseSeconds: 900, aggregate: true });
    expect(planFor('custom:30' as TimeframeId)).toEqual({ kind: 'bars', interval: '30m', baseSeconds: 1800, aggregate: false });
    expect(planFor('custom:7' as TimeframeId)).toEqual({ kind: 'bars', interval: '1m', baseSeconds: 60, aggregate: true });
    expect(planFor('custom:37' as TimeframeId)).toEqual({ kind: 'none' });
  });
});

describe('URL 构造：barsBefore 的 from/to 按基期回推', () => {
  it('普通请求', () => {
    expect(candlesUrl('BTC_USDT', '1m', 500)).toBe(
      'https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1m&limit=500',
    );
  });

  it('翻页请求：to 指定终点，from 回推 limit 个基期', () => {
    const url = candlesUrl('BTC_USDT', '5m', 100, 1_700_000_000);
    expect(url).toContain('currency_pair=BTC_USDT');
    expect(url).toContain('interval=5m');
    expect(url).toContain('limit=100');
    expect(url).toContain('to=1700000000');
    expect(url).toContain(`from=${1_700_000_000 - 100 * 300}`);
  });
});

describe('报价映射：change_percentage 推回涨跌额与前收', () => {
  it('正常行情', () => {
    const q = tickerToQuote('crypto:BTCUSDT', {
      currency_pair: 'BTC_USDT',
      last: '105.0',
      change_percentage: '5',
      high_24h: '106',
      low_24h: '99',
      base_volume: '1000',
      quote_volume: '105000',
    });
    expect(q).not.toBeNull();
    expect(q!.price).toBe(105);
    expect(q!.changePct).toBe(5);
    expect(q!.prevClose).toBeCloseTo(100, 10);
    expect(q!.change).toBeCloseTo(5, 10);
    expect(q!.volume).toBe(1000);
    expect(q!.amount).toBe(105000);
  });

  it('无效价格返回 null', () => {
    expect(
      tickerToQuote('crypto:BTCUSDT', {
        currency_pair: 'BTC_USDT',
        last: '0',
        change_percentage: '0',
        high_24h: '0',
        low_24h: '0',
        base_volume: '0',
        quote_volume: '0',
      }),
    ).toBeNull();
  });
});
