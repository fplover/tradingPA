import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { fontSize, icon, radius, shadow, space, zIndex } from './tokens';
import { inRange, monthMatrix, parseDateStr, toDateStr } from './calendar';

/** TV 式日期选择器：输入态按钮 + 日历弹层（不依赖浏览器原生 date picker——
 *  部分嵌入式浏览器不弹原生选择器；TV 的「前往日期」本就是自定义日历）。
 *  纯函数层在 datePicker.ts；值口径 'YYYY-MM-DD'（当地时区语义）。 */

export interface DatePickerProps {
  /** 'YYYY-MM-DD' 或 ''（未选） */
  value: string;
  onChange: (v: string) => void;
  /** 可选上下界（同 'YYYY-MM-DD'；界外日期在日历中禁用） */
  min?: string;
  max?: string;
  ariaLabel?: string;
  /** 紧凑模式：仅日历图标的触发按钮（配文本输入框用，TV「前往日期」形态）；
   *  默认 = 显示日期值的宽按钮 */
  compact?: boolean;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export function DatePicker({ value, onChange, min, max, ariaLabel = '选择日期', compact = false }: DatePickerProps) {
  const selected = parseDateStr(value);
  const [open, setOpen] = useState(false);
  // 今天（ useState 初始化器内取墙钟，不走渲染期 purity 分析）；仅用于加粗标记
  const [todayStr] = useState(() => {
    const n = new Date();
    return toDateStr(n.getFullYear(), n.getMonth(), n.getDate());
  });
  // 弹层展示的月份：打开时跳到选中月（或当月）
  const [view, setView] = useState(() => {
    const base = selected ?? { y: new Date().getFullYear(), m: new Date().getMonth(), d: 1 };
    return { y: base.y, m: base.m };
  });

  const cells = useMemo(() => monthMatrix(view.y, view.m), [view.y, view.m]);
  const monthLabel = `${view.y} 年 ${view.m + 1} 月`;

  // 整月是否完全在界外（决定翻页按钮禁用）：月初/月末各取一天代表
  const monthStart = toDateStr(view.y, view.m, 1);
  const monthEnd = toDateStr(view.y, view.m, new Date(view.y, view.m + 1, 0).getDate());
  const prevDisabled = max !== undefined && monthStart > max;
  const nextDisabled = min !== undefined && monthEnd < min;

  const pick = (y: number, m: number, d: number) => {
    onChange(toDateStr(y, m, d));
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          style={compact ? { ...triggerStyle, width: 'auto', padding: '4px 6px' } : triggerStyle}
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          {!compact && <span>{value || '选择日期'}</span>}
          <CalendarDays size={icon.md} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content style={popoverStyle} align="start" side="bottom" sideOffset={4}>
          {/* 月导航 */}
          <div style={headStyle}>
            <button
              type="button"
              style={navBtnStyle}
              aria-label="上个月"
              disabled={prevDisabled}
              onClick={() => setView({ y: view.m === 0 ? view.y - 1 : view.y, m: view.m === 0 ? 11 : view.m - 1 })}
            >
              <ChevronLeft size={icon.md} />
            </button>
            <span style={monthLabelStyle}>{monthLabel}</span>
            <button
              type="button"
              style={navBtnStyle}
              aria-label="下个月"
              disabled={nextDisabled}
              onClick={() => setView({ y: view.m === 11 ? view.y + 1 : view.y, m: view.m === 11 ? 0 : view.m + 1 })}
            >
              <ChevronRight size={icon.md} />
            </button>
          </div>
          {/* 周行头（周一起） */}
          <div style={gridStyle}>
            {WEEKDAYS.map((w) => (
              <span key={w} style={weekdayStyle}>
                {w}
              </span>
            ))}
          </div>
          {/* 日期格 */}
          <div style={gridStyle}>
            {cells.map((c) => {
              const s = toDateStr(c.y, c.m, c.d);
              const disabled = !inRange(s, min, max);
              const isSelected = value === s;
              const isToday = s === todayStr;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(c.y, c.m, c.d)}
                  style={{
                    ...dayStyle,
                    opacity: c.inMonth ? 1 : 0.35,
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? 'var(--text-on-accent)' : 'var(--text)',
                    fontWeight: isToday && !isSelected ? 600 : 400,
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                  aria-label={s}
                  aria-pressed={isSelected}
                >
                  {c.d}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const triggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space.sm,
  width: 150,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: fontSize.md,
  cursor: 'pointer',
};

const popoverStyle: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.md,
  boxShadow: shadow.menu,
  padding: space.sm,
  // 高于 Radix 模态对话框的 overlay/content（modal 60）——日期弹层会在对话框内
  // 触发（前往日期），body 级 portal 必须越过模态层才可交互
  zIndex: zIndex.toast,
};

const headStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: space.xs,
};

const navBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  cursor: 'pointer',
  padding: 2,
  borderRadius: radius.xs,
  display: 'flex',
};

const monthLabelStyle: React.CSSProperties = { color: 'var(--text)', fontSize: fontSize.md, fontWeight: 600 };

const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 30px)', gap: 2 };

const weekdayStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.xs,
  textAlign: 'center',
  height: 20,
  lineHeight: '20px',
};

const dayStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  height: 26,
  borderRadius: radius.xs,
  fontSize: fontSize.sm,
  padding: 0,
};
