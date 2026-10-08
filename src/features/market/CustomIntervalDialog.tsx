import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '@/ui/primitives';
import { fontSize, icon, radius, space } from '@/ui/tokens';
import type { Timeframe } from '@/types/market';
import {
  CUSTOM_HOUR_RANGE,
  CUSTOM_MINUTE_RANGE,
  forgetCustomInterval,
  loadCustomIntervals,
  resolveCustomInterval,
  selectCustomInterval,
  validateCustomInterval,
  type CustomIntervalUnit,
} from './customInterval';

const UNITS: Array<{ id: CustomIntervalUnit; label: string }> = [
  { id: 'm', label: '分钟' },
  { id: 'H', label: '小时' },
];

/** 自定义间隔浮层（TV Supercharts 卖点）：数字 + 单位（分钟/小时）→ Timeframe 定义 → 既有聚合器。
 *  命中内置档位（按秒数）直接套用；否则创建自定义周期并写入 localStorage 最近列表。
 *  已保存项可一键再应用或删除，下次进入自动复用。 */
export function CustomIntervalDialog({
  open,
  onOpenChange,
  currentLabel,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前周期标签（hint 展示，如「当前 1分」） */
  currentLabel: string;
  onApply: (tf: Timeframe) => void;
}) {
  const [text, setText] = useState('');
  const [unit, setUnit] = useState<CustomIntervalUnit>('m');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Timeframe[]>([]);

  // 每次打开重置，避免上次输入残留
  useEffect(() => {
    if (!open) return;
    setText('');
    setError('');
    setSaved(loadCustomIntervals());
  }, [open]);

  const range = unit === 'H' ? CUSTOM_HOUR_RANGE : CUSTOM_MINUTE_RANGE;

  const submit = () => {
    const value = Number(text.trim());
    if (text.trim() === '' || !Number.isFinite(value)) {
      setError('请输入间隔数量');
      return;
    }
    const invalid = validateCustomInterval(value, unit);
    if (invalid) {
      setError(invalid);
      return;
    }
    onApply(resolveCustomInterval(value, unit));
    onOpenChange(false);
  };

  const remove = (id: string) => {
    forgetCustomInterval(id);
    setSaved(loadCustomIntervals());
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="自定义间隔" width={320}>
      <div style={inputRowStyle}>
        <input
          style={inputStyle}
          value={text}
          placeholder="7"
          aria-label="间隔数量"
          inputMode="numeric"
          autoComplete="off"
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
        <div style={unitRowStyle} role="group" aria-label="单位">
          {UNITS.map((u) => (
            <button
              key={u.id}
              aria-pressed={unit === u.id}
              onClick={() => {
                setUnit(u.id);
                setError('');
              }}
              style={{
                ...unitBtnStyle,
                background: unit === u.id ? 'var(--accent)' : 'var(--input-bg)',
                color: unit === u.id ? 'var(--text-on-accent)' : 'var(--text-dim)',
                border: `1px solid ${unit === u.id ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>
      <div style={hintStyle}>
        当前 {currentLabel}，{unit === 'H' ? '小时' : '分钟'} {range.min}-{range.max}，回车确认
      </div>
      {error && <div style={errorStyle}>{error}</div>}
      {saved.length > 0 && (
        <div style={savedBoxStyle}>
          <div style={savedTitleStyle}>最近使用</div>
          {saved.map((t) => (
            <div key={t.id} style={savedRowStyle}>
              <button
                style={savedItemStyle}
                onClick={() => {
                  onApply(selectCustomInterval(t));
                  onOpenChange(false);
                }}
              >
                {t.label}
                <span style={savedMetaStyle}>{t.seconds / 60} 分钟</span>
              </button>
              <button
                style={savedDelStyle}
                aria-label={`删除 ${t.label}`}
                title={`删除 ${t.label}`}
                onClick={() => remove(t.id)}
              >
                <X size={icon.sm} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={btnRowStyle}>
        <button style={ghostBtnStyle} onClick={() => onOpenChange(false)}>
          取消
        </button>
        <button style={primaryBtnStyle} onClick={submit}>
          应用
        </button>
      </div>
    </Modal>
  );
}

const inputRowStyle: React.CSSProperties = { display: 'flex', gap: space.sm };

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: fontSize.lg,
  outline: 'none',
};

const unitRowStyle: React.CSSProperties = { display: 'flex', gap: space.xs, flexShrink: 0 };

const unitBtnStyle: React.CSSProperties = {
  padding: `6px ${space.sm}px`,
  borderRadius: radius.sm,
  fontSize: fontSize.md,
  cursor: 'pointer',
};

const hintStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: fontSize.sm, marginTop: space.xs };

const errorStyle: React.CSSProperties = { color: 'var(--down)', fontSize: fontSize.sm, marginTop: space.xs };

const savedBoxStyle: React.CSSProperties = { marginTop: space.md };

const savedTitleStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  marginBottom: space.xs,
};

const savedRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: space.xs };

const savedItemStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'baseline',
  gap: space.sm,
  textAlign: 'left',
  background: 'var(--panel-2)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: '4px 8px',
};

const savedMetaStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: fontSize.sm };

const savedDelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  flexShrink: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: radius.xs,
  color: 'var(--text-faint)',
  cursor: 'pointer',
};

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
