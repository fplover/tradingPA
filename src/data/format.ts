/** 数值格式化：画布轴与 UI 共用一套，避免同一个价格两处显示不一致 */

/** 紧凑数字格式（副图数值轴/图例/成交量列）：1.2K / 3.4M / 5.6B */
export function formatCompact(v: number): string {
  const a = Math.abs(v);
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  if (a >= 1 || v === 0) return String(Number(v.toFixed(2)));
  return String(Number(v.toPrecision(3)));
}

/** 价格：千分位 + 固定小数。无有效价格时显示占位符而不是 0.00 */
export function formatPrice(value: number, decimals: number, placeholder = '—'): string {
  if (!Number.isFinite(value) || value === 0) return placeholder;
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 带符号数值：+1.23 / -0.45 */
export function formatSigned(value: number, decimals: number, placeholder = '—'): string {
  if (!Number.isFinite(value)) return placeholder;
  const s = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${s}`;
}

/** 涨跌幅：+1.23% */
export function formatPct(value: number, placeholder = '—'): string {
  if (!Number.isFinite(value)) return placeholder;
  const s = Math.abs(value).toFixed(2);
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${s}%`;
}

/**
 * 实际小数位：品种的静态小数位可能小于行情给出的位数
 * （如螺纹钢主连标记 0 位，但报价 3053.5），取两者较大值避免截断真实精度。
 */
export function decimalsFor(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value === 0) return fallback;
  const s = String(value);
  const dot = s.indexOf('.');
  const actual = dot < 0 ? 0 : Math.min(4, s.length - dot - 1);
  return Math.max(fallback, actual);
}

export type Direction = 'up' | 'down' | 'flat';

export function directionOf(value: number): Direction {
  if (!Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/** 涨跌对应的 CSS 变量；平盘用暗灰 */
export function directionVar(dir: Direction): string {
  return dir === 'up' ? 'var(--up)' : dir === 'down' ? 'var(--down)' : 'var(--text-faint)';
}
