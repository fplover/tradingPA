import { describe, expect, it } from 'vitest';
import { dateStrToTime, inRange, monthMatrix, parseDateStr, toDateStr } from '@/ui/calendar';

/** 日期选择器纯函数：日历矩阵 / 解析 / 范围（弹层交互本身由 e2e 覆盖） */

describe('parseDateStr / toDateStr', () => {
  it('round-trip', () => {
    expect(toDateStr(2026, 9, 8)).toBe('2026-10-08');
    expect(parseDateStr('2026-10-08')).toEqual({ y: 2026, m: 9, d: 8 });
    expect(parseDateStr(toDateStr(2026, 0, 1))).toEqual({ y: 2026, m: 0, d: 1 });
  });

  it('非法返回 null', () => {
    expect(parseDateStr('')).toBeNull();
    expect(parseDateStr('2026-10-8')).toBeNull(); // 定长约束
    expect(parseDateStr('2026-13-01')).toBeNull();
    expect(parseDateStr('2026-02-30')).toBeNull(); // round-trip 挡不存在日期
  });
});

describe('dateStrToTime', () => {
  it('当地零点（非 UTC）', () => {
    expect(dateStrToTime('2026-10-08')).toBe(new Date(2026, 9, 8).getTime());
    expect(dateStrToTime('bad')).toBeNull();
  });
});

describe('monthMatrix', () => {
  it('2026-10：周四起月，42 格固定，周一首行补上月底', () => {
    const cells = monthMatrix(2026, 9);
    expect(cells).toHaveLength(42);
    // 2026-10-01 是周四 → 周一行头需补 9/28（一）~9/30（三）
    expect(cells[0]).toEqual({ y: 2026, m: 8, d: 28, inMonth: false });
    expect(cells[3]).toEqual({ y: 2026, m: 9, d: 1, inMonth: true });
    // 10 月 31 日是周六 → 第 6 格位置 (3 + 30)
    expect(cells[33]).toEqual({ y: 2026, m: 9, d: 31, inMonth: true });
    // 其后补 11 月
    expect(cells[34]).toEqual({ y: 2026, m: 10, d: 1, inMonth: false });
    expect(cells[41]).toEqual({ y: 2026, m: 10, d: 8, inMonth: false });
  });

  it('2026-02：平年 28 天，矩阵仍 42 格', () => {
    const cells = monthMatrix(2026, 1);
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(cells).toHaveLength(42);
  });

  it('2024-02：闰年 29 天', () => {
    const inMonth = monthMatrix(2024, 1).filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(29);
  });
});

describe('inRange', () => {
  it('缺界不限制；界外禁用（ISO 定长可直比较）', () => {
    expect(inRange('2026-10-08')).toBe(true);
    expect(inRange('2026-10-08', '2026-10-01', '2026-10-08')).toBe(true);
    expect(inRange('2026-09-30', '2026-10-01')).toBe(false);
    expect(inRange('2026-10-09', undefined, '2026-10-08')).toBe(false);
  });
});
