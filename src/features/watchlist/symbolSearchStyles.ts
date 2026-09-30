import type { CSSProperties } from 'react';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

// ---------- 样式（自 SymbolSearchDialog 拆出，颜色全部走 CSS 变量 token） ----------

export const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay)',
  zIndex: zIndex.modal,
};

/** 顶部锚定而非垂直居中：结果向下生长，视线不用来回跳 */
export const contentStyle: CSSProperties = {
  position: 'fixed',
  top: 72,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(820px, 92vw)',
  maxHeight: 'min(620px, calc(100vh - 120px))',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.lg,
  boxShadow: shadow.modal,
  zIndex: zIndex.modal,
  overflow: 'hidden',
  outline: 'none',
};

export const inputRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.md,
  height: 56,
  padding: `0 ${space.md}px`,
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

export const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
  fontSize: 19,
  fontWeight: 400,
};

export const clearBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'var(--text-faint)',
  cursor: 'pointer',
  flexShrink: 0,
};

export const tabRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 2,
  padding: `0 ${space.sm}px`,
  borderBottom: '1px solid var(--border)',
  overflowX: 'auto',
  flexShrink: 0,
};

export const tabStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: `0 ${space.md}px`,
  height: 36,
  fontSize: fontSize.md,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export const listStyle: CSSProperties = {
  overflowY: 'auto',
  padding: `${space.xs}px 0`,
};

export const sectionLabelStyle: CSSProperties = {
  padding: `${space.xs}px ${space.md}px`,
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

export const emptyStyle: CSSProperties = {
  padding: `${space.xl}px ${space.md}px`,
  textAlign: 'center',
  color: 'var(--text-faint)',
  fontSize: fontSize.md,
  lineHeight: 1.9,
};

export const badgeStyle: CSSProperties = {
  padding: '1px 6px',
  borderRadius: 3,
  background: 'var(--panel-2)',
  color: 'var(--text-faint)',
  fontSize: fontSize.xs,
  whiteSpace: 'nowrap',
};

export const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.lg,
  height: 30,
  padding: `0 ${space.md}px`,
  borderTop: '1px solid var(--border)',
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  flexShrink: 0,
};
