import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

/** 图表右键菜单样式。
 *  自 ChartContextMenu.tsx 外提（该文件曾超 300 行红线）。
 *  纯样式常量外提，零行为变化；取值与迁移前逐字符一致。 */

export const menuStyle: React.CSSProperties = {
  minWidth: 210,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.md,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

export const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: `6px ${space.sm + 2}px`,
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  outline: 'none',
  whiteSpace: 'nowrap',
};

export const iconSlot: React.CSSProperties = { width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' };

export const hintStyle: React.CSSProperties = {
  marginLeft: 'auto',
  paddingLeft: space.md,
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
};

export const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: `${space.xs}px 0`,
};

export const fieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space.sm,
  marginBottom: space.sm,
};

export const fieldLabelStyle: React.CSSProperties = { color: 'var(--text)', fontSize: fontSize.md };

export const inputStyle: React.CSSProperties = {
  width: 140,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: fontSize.md,
};

export const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: `${space.xs}px ${space.sm}px`,
  borderRadius: radius.sm,
};

export const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  color: 'var(--text-on-accent)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: `${space.xs}px ${space.md}px`,
  borderRadius: radius.sm,
};
