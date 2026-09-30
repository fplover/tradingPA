import type { ColumnId } from '@/store/watchlistStore';
import type { Quote } from '@/data/sources/types';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

/** 列 → Quote 字段。代码/名称列不走报价。 */
export const QUOTE_FIELD: Record<ColumnId, keyof Quote> = {
  last: 'price',
  changePct: 'changePct',
  change: 'change',
  volume: 'volume',
  amount: 'amount',
  open: 'open',
  high: 'high',
  low: 'low',
  prevClose: 'prevClose',
};

export const COLUMN_WIDTH: Record<ColumnId, number> = {
  last: 74,
  changePct: 66,
  change: 64,
  volume: 58,
  amount: 62,
  open: 64,
  high: 64,
  low: 64,
  prevClose: 64,
};

// ---------- 样式（颜色全部 CSS 变量 token） ----------

export const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
};

export const menuStyle: React.CSSProperties = {
  minWidth: 180,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.md,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

export const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: '5px 8px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  outline: 'none',
};

export const menuLabelStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

export const leadingIconSlot: React.CSSProperties = { width: 14, flexShrink: 0, display: 'flex', alignItems: 'center' };

export const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: `${space.xs}px 0`,
};
