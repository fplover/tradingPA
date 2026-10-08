import { describe, expect, it } from 'vitest';
import {
  globalMinuteUrl,
  globalDailyUrl,
  globalSinaSymbol,
  innerUrl,
  planFor,
  unwrapBars,
  usUrl,
} from '@/data/sources/sina';

describe('外盘代码映射：东财 dm → 新浪 symbol', () => {
  it('主连 XX00Y → 新浪主连 XX', () => {
    expect(globalSinaSymbol('GC00Y')).toBe('GC');
    expect(globalSinaSymbol('CL00Y')).toBe('CL');
    expect(globalSinaSymbol('hg00y')).toBe('HG');
  });

  it('字母月合约 XXYYM → XXYYmm（F=1 … Z=12）', () => {
    expect(globalSinaSymbol('HG27F')).toBe('HG2701');
    expect(globalSinaSymbol('CL26V')).toBe('CL2610');
    expect(globalSinaSymbol('GC26Z')).toBe('GC2612');
    // 小写输入归一
    expect(globalSinaSymbol('cl27q')).toBe('CL2708');
  });

  it('新浪原生数字月合约原样透传', () => {
    expect(globalSinaSymbol('CL2612')).toBe('CL2612');
    expect(globalSinaSymbol('HG2701')).toBe('HG2701');
  });

  it('识别不了的代码返回 null（内盘主连 rbm、畸形代码等）', () => {
    expect(globalSinaSymbol('rbm')).toBeNull();
    expect(globalSinaSymbol('GC')).toBeNull();
    expect(globalSinaSymbol('123ABC')).toBeNull();
    expect(globalSinaSymbol('GC27F2')).toBeNull();
    expect(globalSinaSymbol('GC2F')).toBeNull();
  });
});

describe('URL 构造：服务名 / 主机 / 参数钉住', () => {
  it('内盘：日 / 分钟两个服务', () => {
    expect(innerUrl('daily', 'RB2701', 0)).toBe(
      'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/{cb}/InnerFuturesNewService.getDailyKLine?symbol=RB2701',
    );
    expect(innerUrl('minute', 'RB2701', 5)).toBe(
      'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/{cb}/InnerFuturesNewService.getFewMinLine?symbol=RB2701&type=5',
    );
  });

  it('美股：getDailyK / getMinK', () => {
    expect(usUrl('daily', 'AAPL', 0)).toBe(
      'https://stock.finance.sina.com.cn/usstock/api/jsonp_v2.php/{cb}/US_MinKService.getDailyK?symbol=AAPL',
    );
    expect(usUrl('minute', 'AAPL', 15)).toBe(
      'https://stock.finance.sina.com.cn/usstock/api/jsonp_v2.php/{cb}/US_MinKService.getMinK?symbol=AAPL&type=15',
    );
  });

  it('外盘：stock2 日线 + gu.sina.cn 分钟，均含 {cb} 占位', () => {
    expect(globalDailyUrl('CL')).toBe(
      'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/{cb}/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=CL',
    );
    expect(globalMinuteUrl('CL', 60)).toBe(
      'https://gu.sina.cn/ft/api/jsonp.php/{cb}/GlobalService.getMinK?symbol=CL&type=60',
    );
  });
});

describe('unwrapBars：三类负载归一', () => {
  it('分钟/内盘形态 {d,o,h,l,c,v}', () => {
    const rows = unwrapBars([{ d: '2026-10-08 09:50:00', o: '3160', h: '3161', l: '3155', c: '3156', v: '13540' }]);
    expect(rows).toEqual([{ d: '2026-10-08 09:50:00', o: '3160', h: '3161', l: '3155', c: '3156', v: '13540' }]);
  });

  it('外盘日线形态 {date,open,…} 字段名兼容，v 缺省补 0', () => {
    const rows = unwrapBars([{ date: '2026-10-02', open: '4204.6', high: '4259.0', low: '4153.8', close: '4172.1', volume: '164881' }]);
    expect(rows).toEqual([{ d: '2026-10-02', o: '4204.6', h: '4259.0', l: '4153.8', c: '4172.1', v: '164881' }]);
  });

  it('null（服务端空）与 {__ERROR} 对象 → 空数组', () => {
    expect(unwrapBars(null)).toEqual([]);
    expect(unwrapBars({ __ERROR: 3, __ERRORMSG: 'Service not valid' })).toEqual([]);
    expect(unwrapBars(undefined)).toEqual([]);
  });

  it('脏行过滤：缺字段的对象跳过，非对象成员跳过', () => {
    const rows = unwrapBars([
      null,
      42,
      { d: '2026-10-08', o: '1', h: '2', l: '0.5' }, // 缺 c
      { d: '2026-10-08', o: '1', h: '2', l: '0.5', c: '1.5' }, // 缺 v → 补 0
    ]);
    expect(rows).toEqual([{ d: '2026-10-08', o: '1', h: '2', l: '0.5', c: '1.5', v: '0' }]);
  });
});

describe('planFor：外盘与内盘共用同一套周期归一（回归钉住）', () => {
  it('分钟档位与聚合规则不变', () => {
    expect(planFor('1m')).toEqual({ kind: 'minute', type: 1 });
    expect(planFor('2H')).toEqual({ kind: 'minute', type: 60 });
    expect(planFor('1D')).toEqual({ kind: 'daily' });
    expect(planFor('1s')).toEqual({ kind: 'none' });
  });
});
