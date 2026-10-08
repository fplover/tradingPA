import type { Bar } from '@/types/market';

/** 前往日期（Alt+G）的纯函数层：解析 / 二分 / 裁决。
 *  与组件分离（同 drawing 家族 math/render 分离惯例），可独立单测。 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 解析 YYYY-MM-DD（兼容 - / . 分隔与单位数），返回当地零点的毫秒时间；非法返回 null */
export function parseDateInput(raw: string): number | null {
  const m = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  //  round-trip 校验，挡掉 2026-02-30 这类非法日期
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt.getTime();
}

/** 二分查找第一个 >= time 的 bar 下标（调用方保证 time 在数据范围内） */
export function firstBarAtOrAfter(bars: Bar[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time >= time) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

/** 当地日零点（日期选择器是日粒度语义：选中首日应能到达该日第一根 bar） */
function localDayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 前往日期裁决（纯函数）：时间 → 目标 bar index，或越界错误文案。
 *  日粒度对齐：日期选择器选中的是「日」——首日 00:00 合法（落到该日第一根 bar），
 *  末日零点合法；仅当选日整天都早于/晚于数据范围才报错。 */
export function resolveGoToDate(bars: Bar[], time: number): { index: number } | { error: string } {
  if (bars.length === 0) return { error: '暂无 K 线数据' };
  const first = bars[0].time;
  const last = bars[bars.length - 1].time;
  if (time < localDayStart(first)) return { error: `超出数据范围：早于第一根 K 线（${fmtDate(first)}）` };
  if (time > last) return { error: `超出数据范围：晚于最后一根 K 线（${fmtDate(last)}）` };
  return { index: firstBarAtOrAfter(bars, time) };
}
