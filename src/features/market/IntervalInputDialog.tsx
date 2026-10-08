import { useState } from 'react';
import { Modal } from '@/ui/primitives';
import type { TimeframeId } from '@/types/market';
import { parseIntervalInput } from './intervalInput';
import { fontSize, radius, space } from '@/ui/tokens';

/** 变更周期浮层：TV featureset show_interval_dialog_on_key_press（数字键 / 逗号即开，回车确认） */
export function IntervalInputDialog({
  open,
  initial,
  currentLabel,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  /** 打开时预填（触发键是数字时带入该数字） */
  initial: string;
  currentLabel: string;
  onOpenChange: (open: boolean) => void;
  onApply: (tf: TimeframeId) => void;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState('');
  const [lastOpen, setLastOpen] = useState(open);

  // 每次打开重置：渲染期按 prev open 调整状态（initial 只随 open false→true 一并
  // 变化——openInterval 两者同设，且快捷键对对话框内输入有 early-return 守卫）
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setText(initial);
      setError('');
    }
  }

  const submit = () => {
    const tf = parseIntervalInput(text);
    if (!tf) {
      setError('无法识别，示例：15 / 1H / 1D / 1W；其他分钟数请用顶栏周期下拉「自定义间隔…」');
      return;
    }
    onApply(tf);
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="变更周期" width={300}>
      <input
        style={inputStyle}
        value={text}
        placeholder="15 / 1H / 1D / 1W"
        aria-label="周期"
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div style={hintStyle}>当前 {currentLabel}，回车确认</div>
      {error && <div style={errorStyle}>{error}</div>}
      <div style={btnRowStyle}>
        <button style={ghostBtnStyle} onClick={() => onOpenChange(false)}>
          取消
        </button>
        <button style={primaryBtnStyle} onClick={submit}>
          确认
        </button>
      </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: fontSize.lg,
  outline: 'none',
};

const hintStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: fontSize.sm, marginTop: space.xs };

const errorStyle: React.CSSProperties = { color: 'var(--down)', fontSize: fontSize.sm, marginTop: space.xs };

const btnRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space.sm,
  marginTop: space.md,
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: `${space.xs}px ${space.sm}px`,
  borderRadius: radius.sm,
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  color: 'var(--text-on-accent)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: `${space.xs}px ${space.md}px`,
  borderRadius: radius.sm,
};
