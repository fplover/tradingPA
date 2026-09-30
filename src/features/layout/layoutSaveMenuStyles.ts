import type { CSSProperties } from 'react';
import { fontSize, icon, shadow, space, zIndex } from '@/ui/tokens';

// ---------- 样式（自 LayoutSaveMenu 拆出，与 ToolbarSelect / primitives 同源，颜色全部走 CSS 变量） ----------

export const triggerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  height: 26,
  padding: `0 ${space.sm}px`,
  border: 'none',
  borderRadius: 4,
  fontSize: fontSize.md,
  color: 'var(--text-dim)',
  cursor: 'pointer',
  flexShrink: 0,
};

export const menuStyle: CSSProperties = {
  minWidth: 240,
  maxHeight: 420,
  overflowY: 'auto',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

export const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: '5px 8px',
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  outline: 'none',
  whiteSpace: 'nowrap',
};

export const checkSlot: CSSProperties = { width: icon.md, flexShrink: 0, display: 'flex', alignItems: 'center' };

export const rowBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  flexShrink: 0,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  padding: 0,
};

export const nameLineStyle: CSSProperties = {
  display: 'block',
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const timeLineStyle: CSSProperties = {
  display: 'block',
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

export const groupLabelStyle: CSSProperties = {
  padding: '4px 8px 2px',
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

export const sepStyle: CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: `${space.xs}px 0`,
};

export const footerStyle: CSSProperties = {
  padding: '4px 8px 2px',
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 28,
  padding: `0 ${space.sm}px`,
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: fontSize.md,
  outline: 'none',
};

export const btnStyle: CSSProperties = {
  height: 26,
  padding: `0 ${space.md}px`,
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: fontSize.md,
  cursor: 'pointer',
};
