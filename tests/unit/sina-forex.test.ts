import { describe, expect, it } from 'vitest';
import { forexUrl, unwrapForexDaily } from '@/data/sources/sina';

describe('URL 构造：外汇服务名 / 主机 / 参数钉住', () => {
  it('日线 getDayKLine，无需 datalen', () => {
    expect(forexUrl('daily', 'USDCNH', 0)).toBe(
      'https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/{cb}/NewForexService.getDayKLine?symbol=USDCNH',
    );
  });

  it('分钟 getOldMinKline 必带 scale 与 datalen=1023', () => {
    expect(forexUrl('minute', 'EURUSD', 5)).toBe(
      'https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/{cb}/NewForexService.getOldMinKline?symbol=EURUSD&scale=5&datalen=1023',
    );
    expect(forexUrl('minute', 'DINIW', 60)).toBe(
      'https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/{cb}/NewForexService.getOldMinKline?symbol=DINIW&scale=60&datalen=1023',
    );
  });
});

describe('unwrapForexDaily：字符串负载解析（开、低、高、收）', () => {
  it('字段顺序 o,l,h,c 钉住——2026-10-08 USDCNH 全历史 3109 行校验定案', () => {
    const rows = unwrapForexDaily(
      '2014-11-07,6.13750,6.13030,6.13770,6.13410,|2026-10-08,6.70250,6.69900,6.70610,6.70340,',
    );
    expect(rows).toEqual([
      { d: '2014-11-07', o: '6.13750', h: '6.13770', l: '6.13030', c: '6.13410', v: '0' },
      { d: '2026-10-08', o: '6.70250', h: '6.70610', l: '6.69900', c: '6.70340', v: '0' },
    ]);
    // l ≤ min(o,c) ≤ max(o,c) ≤ h：字段序错则该不变式破坏
    for (const r of rows) {
      const o = Number(r.o),
        h = Number(r.h),
        l = Number(r.l),
        c = Number(r.c);
      expect(l).toBeLessThanOrEqual(Math.min(o, c));
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
    }
  });

  it('错误负载（{"msg":…} 对象 / null / 非字符串）过滤为空', () => {
    expect(unwrapForexDaily({ msg: 'data is empty' })).toEqual([]);
    expect(unwrapForexDaily(null)).toEqual([]);
    expect(unwrapForexDaily([{ d: '2026-10-08', o: '1', h: '1', l: '1', c: '1', v: '0' }])).toEqual([]);
  });

  it('脏行（字段不足 / 日期畸形 / 数值非法）逐行剔除，好行保留', () => {
    const payload = [
      '2014-11-07,6.13750,6.13030,6.13770,6.13410,', // 好
      '2026-10-08,6.70250,6.69900', // 字段不足
      'not-a-date,1,1,1,1,', // 日期畸形
      '2026-10-09,x,1,2,1.5,', // 数值非法
      '2026-10-10,6.70140,6.69970,6.70990,6.70250,', // 好
    ].join('|');
    const rows = unwrapForexDaily(payload);
    expect(rows.map((r) => r.d)).toEqual(['2014-11-07', '2026-10-10']);
  });
});
