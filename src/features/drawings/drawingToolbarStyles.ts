import type { CSSProperties } from 'react';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

/** 独立列而非浮层：TV 的工具栏占据图表左侧一列，不遮挡画布与图例 */
export const toolbarStyle: CSSProperties = {
  width: 52,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '6px 0',
  background: 'var(--panel)',
  borderRight: '1px solid var(--border)',
  overflowY: 'auto',
};

export const controlStyle: CSSProperties = { position: 'relative', width: 38, height: 38, flexShrink: 0 };

export const mainBtnStyle: CSSProperties = {
  width: 38,
  height: 38,
  border: 'none',
  background: 'transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-dim)',
  borderRadius: 4,
  padding: 0,
};

/** 激活态：TV 为强调色实心圆角方块 + 白色图标 */
export const cellStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** caret：独立命中目标，悬停或展开时才可见 */
export const caretStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 1,
  bottom: 1,
  width: 11,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  cursor: 'pointer',
  padding: 0,
  borderRadius: '4px 0 0 4px',
  transition: 'opacity 120ms ease-out',
};

export const bottomBtnStyle: CSSProperties = {
  width: 38,
  height: 38,
  border: 'none',
  flexShrink: 0,
};

export const menuStyle: CSSProperties = {
  minWidth: 168,
  maxWidth: 340,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.md,
  padding: 0,
  zIndex: zIndex.dropdown,
  boxShadow: shadow.popover,
};

export const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: '2px 10px 2px 8px',
  minHeight: 28,
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.lg,
  cursor: 'default',
  textAlign: 'left',
  outline: 'none',
  whiteSpace: 'nowrap',
};

export const hotkeyStyle: CSSProperties = {
  marginLeft: 'auto',
  paddingLeft: space.md,
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

export const iconSlot: CSSProperties = { width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' };

export const sepStyle: CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '3px 8px',
  flexShrink: 0,
};
