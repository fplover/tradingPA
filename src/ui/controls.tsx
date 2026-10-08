import { Check } from 'lucide-react';
import { fontSize, icon, radius, space } from './tokens';

/** 表单控件原语（TV 化）：分段单选 / 数字步进 / 复选框。
 *  从 primitives.tsx 拆出（单文件行数约束）；视觉语言与 primitives 一致。 */

// ---------- 表单控件 ----------

/** 分段单选控件（TV 设置对话框风格）：role=radiogroup，键盘可达，禁用项带 title 说明 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean; title?: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => !o.disabled && onChange(o.value)}
            style={{
              height: 24,
              padding: `0 ${space.sm}px`,
              background: active ? 'var(--accent)' : 'var(--panel-2)',
              color: active ? 'var(--text-on-accent)' : o.disabled ? 'var(--text-faint)' : 'var(--text-dim)',
              border: 'none',
              borderRadius: radius.xs,
              fontSize: fontSize.md,
              cursor: o.disabled ? 'not-allowed' : 'pointer',
              opacity: o.disabled ? 0.5 : 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 数字步进器（TV 指标对话框输入规格）：− 输入框 +，替代深色主题下不可见的原生 spinner */
export function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const clamp = (v: number) => {
    let n = v;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return n;
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      <button
        type="button"
        aria-label={`${ariaLabel} 减少`}
        disabled={min !== undefined && value <= min}
        onClick={() => onChange(clamp(value - step))}
        style={stepperBtnStyle}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        style={{
          width: 64,
          background: 'var(--input-bg)',
          border: '1px solid var(--border)',
          borderRadius: radius.sm,
          color: 'var(--text)',
          padding: '4px 6px',
          fontSize: fontSize.md,
          textAlign: 'right',
        }}
      />
      <button
        type="button"
        aria-label={`${ariaLabel} 增加`}
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(clamp(value + step))}
        style={stepperBtnStyle}
      >
        +
      </button>
    </div>
  );
}

const stepperBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--panel-2)',
  border: 'none',
  borderRadius: radius.xs,
  color: 'var(--text-dim)',
  fontSize: fontSize.lg,
  cursor: 'pointer',
  padding: 0,
};

/** TV 化复选框（裸）：16px 方块，选中强调色底白勾；role="checkbox" 键盘可达 */
export function Checkbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        width: icon.lg,
        height: icon.lg,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: checked ? 'var(--accent)' : 'var(--input-bg)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: radius.xs,
        color: 'var(--text-on-accent)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {checked && <Check size={icon.sm} strokeWidth={2.5} />}
    </button>
  );
}

/** TV 化复选框行：整行可点 + role="checkbox" 键盘可达；aria-label 与可见文案一致（getByLabel 可定位） */
export function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: 32,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        color: 'var(--text)',
        fontSize: fontSize.lg,
        textAlign: 'left',
      }}
    >
      <span>{label}</span>
      <Checkbox checked={checked} onChange={onChange} />
    </button>
  );
}
