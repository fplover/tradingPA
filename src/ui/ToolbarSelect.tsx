import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { fontSize, radius, shadow, space, zIndex } from './tokens';

export interface ToolbarOption {
  value: string;
  label: string;
  group?: string;
}

interface ToolbarSelectProps {
  value: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** 触发器图标 */
  icon?: React.ReactNode;
  /** 触发器文案；缺省显示当前选项 */
  label?: string;
  align?: 'start' | 'end';
  minWidth?: number;
}

/** 顶栏下拉按钮：替代原生 select，视觉与 TradingView 工具栏一致（分组 + 勾选当前项） */
export function ToolbarSelect({ value, options, onChange, ariaLabel, icon, label, align = 'start', minWidth = 132 }: ToolbarSelectProps) {
  const current = options.find((o) => o.value === value);

  const groups: Array<{ name?: string; items: ToolbarOption[] }> = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last.name === o.group) last.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="tv-icon-btn" style={triggerStyle} aria-label={ariaLabel}>
          {icon}
          <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label ?? current?.label ?? value}
          </span>
          <ChevronDown size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className="tv-scroll" style={{ ...menuStyle, minWidth }}>
          {groups.map((g, gi) => (
            <div key={g.name ?? gi}>
              {g.name && <DropdownMenu.Label style={groupLabelStyle}>{g.name}</DropdownMenu.Label>}
              {g.items.map((o) => (
                <DropdownMenu.Item key={o.value} className="tv-menu-item" style={itemStyle} onSelect={() => onChange(o.value)}>
                  <span style={checkSlot}>{o.value === value ? <Check size={14} /> : null}</span>
                  {o.label}
                </DropdownMenu.Item>
              ))}
              {gi < groups.length - 1 && <DropdownMenu.Separator style={sepStyle} />}
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const triggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  height: 26,
  padding: `0 ${space.sm}px`,
  border: 'none',
  borderRadius: radius.sm,
  fontSize: fontSize.md,
  cursor: 'pointer',
  flexShrink: 0,
};

const menuStyle: React.CSSProperties = {
  maxHeight: 420,
  overflowY: 'auto',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.md,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

const groupLabelStyle: React.CSSProperties = {
  padding: `4px 8px 2px`,
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: '5px 8px',
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  outline: 'none',
  whiteSpace: 'nowrap',
};

const checkSlot: React.CSSProperties = { width: 14, flexShrink: 0, display: 'flex', alignItems: 'center' };

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: `${space.xs}px 0`,
};
