import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

/** 指标设置对话框样式。
 *  自 IndicatorSettingsDialog.tsx 外提（该文件曾超 300 行红线）。
 *  纯样式常量外提，零行为变化；取值与迁移前逐字符一致。 */

export const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay)',
  zIndex: zIndex.modal,
};

export const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 600,
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.lg,
  boxShadow: shadow.modal,
  zIndex: zIndex.modal,
  outline: 'none',
};

export const navStyle: React.CSSProperties = {
  width: 180,
  flexShrink: 0,
  borderRight: '1px solid var(--border)',
  padding: `${space.sm}px 0`,
};

export const navItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 34,
  padding: `0 ${space.lg}px`,
  border: 'none',
  textAlign: 'left',
  fontSize: fontSize.lg,
  cursor: 'pointer',
};

export const paneStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: `${space.xl}px ${space.xl}px`,
};

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 32,
  marginBottom: space.sm,
};

export const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: fontSize.md,
};

export const swatchStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  padding: 0,
  border: '1px solid var(--border)',
  borderRadius: 3,
  background: 'none',
  cursor: 'pointer',
};

export const checkLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
};

export const groupLabelStyle: React.CSSProperties = { marginBottom: space.xs };

export const emptyStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: fontSize.md };

export const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  height: 44,
  padding: `0 ${space.lg}px`,
  borderTop: '1px solid var(--border)',
  alignItems: 'center',
  flexShrink: 0,
};

export const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: `${space.xs}px ${space.sm}px`,
  borderRadius: 4,
};
