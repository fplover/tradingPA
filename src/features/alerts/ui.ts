/** 警报面板共享样式（颜色全部 CSS 变量 token） */
export const panelStyle: React.CSSProperties = {
  color: 'var(--text)',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: 10,
};

export const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 6px',
  fontSize: 11,
};

export const btnStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
};

export const miniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  fontSize: 12,
  display: 'flex',
  alignItems: 'center',
  padding: 2,
};

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px',
  fontSize: 11,
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
};

export const tagStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-faint)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  padding: '0 3px',
  flexShrink: 0,
};
