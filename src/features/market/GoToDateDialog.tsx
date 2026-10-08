import { useState } from 'react';
import { Modal } from '@/ui/primitives';
import type { Bar } from '@/types/market';
import { fmtDate, parseDateInput, resolveGoToDate } from './goToDate';
import { fontSize, radius, space } from '@/ui/tokens';

/** 前往日期（Alt+G）：日期选择器选日 → 范围裁决（goToDate.ts 纯函数）→ 居中显示。
 *  日期按当地时区解释（与时间轴标签一致）；越界时浮层内提示。 */
export function GoToDateDialog({
  open,
  onClose,
  bars,
  onGoToDate,
}: {
  open: boolean;
  onClose: () => void;
  bars: Bar[];
  onGoToDate: (index: number) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [lastOpen, setLastOpen] = useState(open);

  // 开屏重置：React 官方的「prop 变化时渲染期调整状态」模式——open 翻转时同步
  // 预填末日与清错。不用 useEffect+ref：effect 版要么把 bars 写进依赖（每拍行情
  // 重跑、冲掉用户输入），要么读 ref（渲染期写 ref 触发 react(refs) 警告）
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setText(bars.length > 0 ? fmtDate(bars[bars.length - 1].time) : '');
      setError('');
    }
  }

  const submit = () => {
    const t = parseDateInput(text);
    if (t === null) {
      setError('日期格式不正确，请使用 YYYY-MM-DD');
      return;
    }
    const r = resolveGoToDate(bars, t);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    onGoToDate(r.index);
    onClose();
  };

  // 渲染期数据取 bars prop（当前帧的数据，随行情自然更新）；barsRef 只服务于
  // 提交时的事件处理器（拿最新 bars 而不受开屏 effect 重置输入的影响）——
  // 渲染期读 ref 会触发 react(refs) 警告，属基线纪律
  const b = bars;
  const rangeHint = b.length > 0 ? `数据范围：${fmtDate(b[0].time)} 至 ${fmtDate(b[b.length - 1].time)}` : '暂无数据';

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="前往日期" width={320}>
      <label style={fieldStyle}>
        <span style={labelStyle}>日期</span>
        {/* 原生日期控件：点击弹出浏览器日历选择器（color-scheme 已随主题设置，
            深浅色自动适配，零依赖）；min/max 收敛到数据范围，选择器内不可点越界日期 */}
        <input
          type="date"
          style={inputStyle}
          value={text}
          min={b.length > 0 ? fmtDate(b[0].time) : undefined}
          max={b.length > 0 ? fmtDate(b[b.length - 1].time) : undefined}
          aria-label="日期"
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
      </label>
      <div style={hintStyle}>{rangeHint}</div>
      {error && <div style={errorStyle}>{error}</div>}
      <div style={btnRowStyle}>
        <button style={ghostBtnStyle} onClick={onClose}>
          取消
        </button>
        <button style={primaryBtnStyle} onClick={submit}>
          前往
        </button>
      </div>
    </Modal>
  );
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space.sm,
  marginBottom: space.sm,
};

const labelStyle: React.CSSProperties = { color: 'var(--text)', fontSize: fontSize.md };

const inputStyle: React.CSSProperties = {
  width: 150,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: fontSize.md,
};

const hintStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: fontSize.sm };

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
