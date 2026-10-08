/** 日期选择器纯函数层（与组件分离，同 goToDate.ts 惯例，可独立单测）。
 *  值口径 'YYYY-MM-DD'（当地时区语义）。 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** 'YYYY-MM-DD' → {y,m(0-based),d}；非法返回 null */
export function parseDateStr(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

/** 目标日的当地零点毫秒（日期选择器是日粒度语义） */
export function dateStrToTime(s: string): number | null {
  const p = parseDateStr(s);
  return p ? new Date(p.y, p.m, p.d).getTime() : null;
}

/** 周六=0 … 周五=5；周一=0 的行序（TV 中文日历周一为首） */
function mondayIndex(dow: number): number {
  return (dow + 6) % 7;
}

/** 月份日历矩阵：6 行 × 7 列，周一起始；含上/下月补位（inMonth=false）。
 *  42 格固定（TV 同形态：行高稳定，不随月份跳号） */
export function monthMatrix(y: number, m: number): Array<{ y: number; m: number; d: number; inMonth: boolean }> {
  const first = new Date(y, m, 1);
  const lead = mondayIndex(first.getDay());
  const start = new Date(y, m, 1 - lead);
  const out: Array<{ y: number; m: number; d: number; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({
      y: d.getFullYear(),
      m: d.getMonth(),
      d: d.getDate(),
      inMonth: d.getMonth() === m && d.getFullYear() === y,
    });
  }
  return out;
}

/** 日期字符串是否在 [min, max] 内（缺界 = 不限制）；字符串可直比较（定长 ISO） */
export function inRange(s: string, min?: string, max?: string): boolean {
  if (min && s < min) return false;
  if (max && s > max) return false;
  return true;
}
