/** 复盘控制条样式。
 *  自 ReplayBar.tsx 外提（该文件曾超 300 行红线）。
 *  纯样式常量外提，零行为变化；取值与迁移前逐字符一致。 */

export const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 38,
  padding: '0 10px',
  background: 'var(--panel)',
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
};

export const dateBadgeStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--text-on-accent)',
  fontSize: 11,
  borderRadius: 4,
  padding: '3px 8px',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

export const centerGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

export const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  height: 26,
  padding: '0 7px',
  background: 'transparent',
  color: 'var(--text-dim)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};

export const orderBtn: React.CSSProperties = {
  height: 24,
  padding: '0 12px',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  fontSize: 12,
  cursor: 'pointer',
};

export const qtyInput: React.CSSProperties = {
  width: 48,
  height: 24,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
  textAlign: 'center',
  padding: '0 4px',
};

export const sepStyle: React.CSSProperties = {
  width: 1,
  height: 18,
  background: 'var(--border)',
};

export const selectStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 12,
};

export const datePopStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: 6,
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 8,
  zIndex: 30,
};

export const dateInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 6px',
  fontSize: 12,
};

export const hintStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: 'var(--accent)',
  color: 'var(--text-on-accent)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 11,
};
