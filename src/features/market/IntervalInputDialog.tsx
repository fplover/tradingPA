import { useEffect, useState } from 'react';
import { Modal } from '@/ui/primitives';
import { TIMEFRAMES, type TimeframeId } from '@/types/market';
import { fontSize, radius, space } from '@/ui/tokens';

/** 解析 TV 式周期输入：纯数字 = 分钟（60 的倍数折合小时）；数字 + 单位 s/m/h/d/w
 *  （大写 M = 月）；裸单位字母 = 1 个单位。按秒数/日历匹配档位表（内置 + 运行时注册的
 *  自定义周期一并命中，如已存 custom:7 时输 7 即命中）；不在表内返回 null。 */
export function parseIntervalInput(raw: string): TimeframeId | null {
  const m = /^\s*(\d*)\s*([smhdwSMHDW]?)\s*$/.exec(raw);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 1;
  if (!Number.isInteger(n) || n < 1) return null;
  const unit = m[2];
  // 周/月秒数为 0 走日历分桶，按 calendar 匹配；其余按秒数匹配
  if (unit === 'w' || unit === 'W') {
    const hit = TIMEFRAMES.find((t) => t.calendar === 'week');
    return hit ? hit.id : null;
  }
  if (unit === 'M') {
    const hit = TIMEFRAMES.find((t) => t.calendar === 'month');
    return hit ? hit.id : null;
  }
  const sec = !unit ? n * 60 : unit === 's' ? n : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : n * 86400;
  const hit = TIMEFRAMES.find((t) => t.seconds === sec && !t.calendar);
  return hit ? hit.id : null;
}

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

  useEffect(() => {
    if (open) {
      setText(initial);
      setError('');
    }
  }, [open, initial]);

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
