import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/ui/primitives';
import type { Bar } from '@/types/market';
import { fontSize, radius, space } from '@/ui/tokens';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 解析 YYYY-MM-DD（兼容 - / . 分隔与单位数），返回当地零点的毫秒时间；非法返回 null */
export function parseDateInput(raw: string): number | null {
  const m = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  //  round-trip 校验，挡掉 2026-02-30 这类非法日期
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt.getTime();
}

/** 二分查找第一个 >= time 的 bar 下标（调用方保证 time 在数据范围内） */
export function firstBarAtOrAfter(bars: Bar[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time >= time) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

/** 前往日期（Alt+G）：输入日期 → 范围校验 → 二分定位 → onGoToDate 居中显示。
 *  日期按当地时区解释（与时间轴标签一致）；超出数据范围时浮层内提示。 */
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
  // bars 每次行情更新都是新数组，只应在开/关时重置，避免冲掉用户输入
  const barsRef = useRef(bars);
  barsRef.current = bars;

  useEffect(() => {
    if (!open) return;
    const b = barsRef.current;
    setText(b.length > 0 ? fmtDate(b[b.length - 1].time) : '');
    setError('');
  }, [open]);

  const submit = () => {
    const t = parseDateInput(text);
    if (t === null) {
      setError('日期格式不正确，请使用 YYYY-MM-DD');
      return;
    }
    const b = barsRef.current;
    if (b.length === 0) {
      setError('暂无 K 线数据');
      return;
    }
    const first = b[0].time;
    const last = b[b.length - 1].time;
    if (t > last) {
      setError(`超出数据范围：晚于最后一根 K 线（${fmtDate(last)}）`);
      return;
    }
    if (t < first) {
      setError(`超出数据范围：早于第一根 K 线（${fmtDate(first)}）`);
      return;
    }
    onGoToDate(firstBarAtOrAfter(b, t));
    onClose();
  };

  const b = barsRef.current;
  const rangeHint = b.length > 0 ? `数据范围：${fmtDate(b[0].time)} 至 ${fmtDate(b[b.length - 1].time)}` : '暂无数据';

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="前往日期" width={320}>
      <label style={fieldStyle}>
        <span style={labelStyle}>日期</span>
        <input
          style={inputStyle}
          value={text}
          placeholder="YYYY-MM-DD"
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
