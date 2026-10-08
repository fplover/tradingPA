import { describe, expect, it } from 'vitest';
import { formatTime } from '@/engine/renderer/drawAxes';

/** TV 中文界面时间轴标签：日内 HH:mm / 日线 M月D日 / 周月以上 M月 / 跨年带年 */

// 2024-03-05 14:30 本地时间
const T = new Date(2024, 2, 5, 14, 30).getTime();
// 2024-12-31 与 2025-01-02（跨年相邻）
const YEAR_START = new Date(2025, 0, 2, 9, 30).getTime();
// 2024-01-15（周/月视图的 1 月）
const JANUARY = new Date(2024, 0, 15, 10, 0).getTime();
// 2024-06-10（周/月视图的非 1 月）
const JUNE = new Date(2024, 5, 10, 10, 0).getTime();
// 12 小时制用例：0 点 / 12 点 / 上午 / 下午
const MIDNIGHT = new Date(2024, 0, 8, 0, 30).getTime();
const NOON = new Date(2024, 0, 8, 12, 0).getTime();
const MORNING = new Date(2024, 0, 8, 9, 5).getTime();
const AFTERNOON = new Date(2024, 0, 8, 15, 45).getTime();

describe('formatTime', () => {
  it('日内（间距 <60px）：HH:mm', () => {
    expect(formatTime(T, 10)).toBe('14:30');
    expect(formatTime(T, 59)).toBe('14:30');
  });

  it('日线（60-300px）：M月D日', () => {
    expect(formatTime(T, 60)).toBe('3月5日');
    expect(formatTime(T, 299)).toBe('3月5日');
  });

  it('日线跨年标签：带 YYYY 年', () => {
    expect(formatTime(YEAR_START, 120, true)).toBe('2025年1月2日');
    // showYear=false 时不带年（与上一标签同年）
    expect(formatTime(YEAR_START, 120, false)).toBe('1月2日');
  });

  it('周/月以上（≥300px）：M月，1 月带年', () => {
    expect(formatTime(JUNE, 400)).toBe('6月');
    expect(formatTime(JANUARY, 400)).toBe('2024年1月');
    expect(formatTime(JANUARY, 400, true)).toBe('2024年1月');
  });

  it('边界：间距正好 60/300 归入对应档', () => {
    expect(formatTime(T, 300)).toBe('3月');
    expect(formatTime(T, 60)).toBe('3月5日');
  });
});

/** 12 小时制（TV 坐标轴页）：默认 24 小时制零变化，hour12 仅作用于日内段 */
describe('formatTime：12 小时制（AM/PM）', () => {
  it('日内：H:mm AM/PM，小时不零填充', () => {
    expect(formatTime(MORNING, 10, false, true)).toBe('9:05 AM');
    expect(formatTime(AFTERNOON, 10, false, true)).toBe('3:45 PM');
  });

  it('0 点 → 12 AM，12 点 → 12 PM（不折半）', () => {
    expect(formatTime(MIDNIGHT, 10, false, true)).toBe('12:30 AM');
    expect(formatTime(NOON, 10, false, true)).toBe('12:00 PM');
  });

  it('日/月跨度不受 hour12 影响（保持中文日期）', () => {
    expect(formatTime(T, 60, false, true)).toBe('3月5日');
    expect(formatTime(T, 400, false, true)).toBe('3月');
  });
});
