import { describe, expect, it } from 'vitest';
import type { Bar } from '@/types/market';
import { firstBarAtOrAfter, parseDateInput, resolveGoToDate } from '@/features/market/goToDate';

/** 前往日期：解析 / 二分 / 裁决纯函数（日期选择器日粒度语义） */

function bar(time: number, close = 100): Bar {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

/** 三根 bar：2026-10-01 09:30 / 10-02 14:00 / 10-05 15:00（当地时间） */
const BARS: Bar[] = [
  bar(new Date(2026, 9, 1, 9, 30).getTime()),
  bar(new Date(2026, 9, 2, 14, 0).getTime()),
  bar(new Date(2026, 9, 5, 15, 0).getTime()),
];

describe('parseDateInput', () => {
  it('合法日期解析为当地零点', () => {
    expect(parseDateInput('2026-10-01')).toBe(new Date(2026, 9, 1).getTime());
    expect(parseDateInput('2026-10-1')).toBe(new Date(2026, 9, 1).getTime()); // 单位数
    expect(parseDateInput(' 2026/10/01 ')).toBe(new Date(2026, 9, 1).getTime()); // 斜杠 + 空白
    expect(parseDateInput('2026.10.01')).toBe(new Date(2026, 9, 1).getTime()); // 点分隔
  });

  it('非法格式与不存在日期返回 null', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('2026-13-01')).toBeNull();
    expect(parseDateInput('2026-02-30')).toBeNull(); // round-trip 校验挡掉
    expect(parseDateInput('26-10-01')).toBeNull();
    expect(parseDateInput('2026-10')).toBeNull();
  });
});

describe('firstBarAtOrAfter', () => {
  it('精确命中取该根', () => {
    expect(firstBarAtOrAfter(BARS, BARS[1].time)).toBe(1);
  });

  it('bar 之间取下一根；首前取 0；尾后取末根', () => {
    const between = new Date(2026, 9, 2, 20, 0).getTime(); // 10-02 20:00（14:00 与 10-05 之间）
    expect(firstBarAtOrAfter(BARS, between)).toBe(2);
    expect(firstBarAtOrAfter(BARS, new Date(2026, 8, 1).getTime())).toBe(0);
    expect(firstBarAtOrAfter(BARS, new Date(2026, 9, 6).getTime())).toBe(2);
  });
});

describe('resolveGoToDate', () => {
  it('范围内日期 → 首个 >= 它的 bar', () => {
    const r = resolveGoToDate(BARS, new Date(2026, 9, 3).getTime());
    expect(r).toEqual({ index: 2 }); // 10-03 → 10-05 那根
  });

  it('首日 00:00 合法（日粒度对齐）→ 落到首根 bar', () => {
    // 首根 bar 在 09:30；日期选择器选中首日给的是当地 00:00——不得误判越界
    const r = resolveGoToDate(BARS, new Date(2026, 9, 1).getTime());
    expect(r).toEqual({ index: 0 });
  });

  it('末日零点合法；晚于末根 bar 才报错', () => {
    // 日期选择器只产生日粒度（00:00）：选末日 → 00:00 ≤ 15:00 末根 → 合法
    expect(resolveGoToDate(BARS, new Date(2026, 9, 5).getTime())).toEqual({ index: 2 });
    expect(resolveGoToDate(BARS, BARS[2].time)).toEqual({ index: 2 });
    // 手工键入更晚的时刻（date 输入允许键盘改值）仍被拦
    const after = resolveGoToDate(BARS, new Date(2026, 9, 5, 23, 59).getTime());
    expect('error' in after && after.error).toContain('晚于最后一根');
  });

  it('整天早于/晚于数据范围才报错', () => {
    const before = resolveGoToDate(BARS, new Date(2026, 8, 30).getTime());
    expect('error' in before && before.error).toContain('早于第一根');
    const after = resolveGoToDate(BARS, new Date(2026, 9, 6).getTime());
    expect('error' in after && after.error).toContain('晚于最后一根');
  });

  it('空数据报错', () => {
    expect(resolveGoToDate([], new Date(2026, 9, 1).getTime())).toEqual({ error: '暂无 K 线数据' });
  });
});
