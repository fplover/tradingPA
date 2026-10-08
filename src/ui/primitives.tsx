import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { control, fontSize, icon, radius, shadow, space, zIndex } from './tokens';

/** Radix 原语的 TradingView 风格封装：可访问性（焦点陷阱/Esc/ARIA/键盘导航）由 Radix 提供，
 *  视觉由这里统一收拢。颜色全部走 CSS 变量，自动适配深浅主题。 */

// ---------- Dialog ----------

export function Modal({
  open,
  onOpenChange,
  title,
  width = 320,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={{ ...contentStyle, width }} className="tv-dialog" aria-label={title}>
          <DialogHeader title={title} />
          <div style={modalBodyStyle}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** TV 对话框标题栏：44px 齐平条（标题左 + 关闭右）——Modal 与手写 Dialog 的对话框共用，
 *  头部不吃主体 padding，避免「上 padding + 标题 padding」堆叠出的大片空白。 */
export function DialogHeader({ title }: { title: React.ReactNode }) {
  return (
    <div style={dialogHeaderStyle}>
      <Dialog.Title style={dialogTitleStyle}>{title}</Dialog.Title>
      <Dialog.Close asChild>
        <button style={dialogCloseStyle} aria-label="关闭">
          <X size={icon.lg} />
        </button>
      </Dialog.Close>
    </div>
  );
}

// ---------- DropdownMenu ----------

export function Menu({
  trigger,
  label,
  children,
}: {
  trigger?: React.ReactNode;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? <button style={menuTriggerStyle}>{label}</button>}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content style={menuContentStyle} side="top" align="start" sideOffset={6}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={onSelect}>
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

// ---------- Tabs ----------

export function TabList({ children }: { children: React.ReactNode }) {
  return <Tabs.List style={tabListStyle}>{children}</Tabs.List>;
}

export function Tab({ value, active, children }: { value: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Tabs.Trigger value={value} style={tabTriggerStyle(active)}>
      {children}
    </Tabs.Trigger>
  );
}

// ---------- 共用按钮 ----------

export function IconButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          aria-label={title}
          aria-pressed={active}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: control.iconBtn,
            height: control.h,
            background: active ? 'var(--accent)' : 'transparent',
            color: active ? 'var(--text-on-accent)' : 'var(--text-dim)',
            border: 'none',
            borderRadius: radius.sm,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!active) e.currentTarget.style.background = 'var(--panel-2)';
          }}
          onMouseLeave={(e) => {
            if (!active) e.currentTarget.style.background = 'transparent';
          }}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="bottom" sideOffset={6} style={tooltipStyle}>
          {title}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// ---------- 样式 ----------

/** TV tooltip：反色实心矩形、无箭头、12px */
const tooltipStyle: React.CSSProperties = {
  background: 'var(--tooltip-bg)',
  color: 'var(--tooltip-text)',
  fontSize: fontSize.sm,
  lineHeight: '16px',
  padding: '5px 8px',
  borderRadius: radius.xs,
  maxWidth: 240,
  zIndex: zIndex.toast,
  boxShadow: shadow.tooltip,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay)',
  zIndex: zIndex.modal,
};

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.lg,
  zIndex: zIndex.modal,
  boxShadow: shadow.modal,
};

/** 对话框主体内边距（头部为齐平 44px 条，不叠主体 padding） */
const modalBodyStyle: React.CSSProperties = { padding: space.lg };

/** TV 对话框标题栏：44px 齐平条（Modal/ChartSettings/IndicatorSettings/Shortcuts 共用） */
const dialogHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 44,
  padding: `0 ${space.lg}px`,
  flexShrink: 0,
};

const dialogTitleStyle: React.CSSProperties = { color: 'var(--text)', fontSize: 16, fontWeight: 600 };

const dialogCloseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: 'transparent',
  border: 'none',
  borderRadius: radius.xs,
  color: 'var(--text-faint)',
  cursor: 'pointer',
};

const menuTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.xs,
  height: control.h,
  padding: `0 ${space.sm}px`,
  background: 'transparent',
  color: 'var(--text-dim)',
  border: 'none',
  borderRadius: radius.sm,
  cursor: 'pointer',
  fontSize: fontSize.md,
};

const menuContentStyle: React.CSSProperties = {
  minWidth: 200,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.md,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: `${space.xs + 1}px ${space.sm + 2}px`,
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  borderRadius: 0,
  outline: 'none',
};

const tabListStyle: React.CSSProperties = {
  display: 'flex',
  gap: space.xs,
  borderBottom: '1px solid var(--border)',
  marginBottom: space.xs,
};

const tabTriggerStyle = (active?: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
  color: active ? 'var(--accent)' : 'var(--text-faint)',
  fontSize: fontSize.sm,
  padding: `${space.xs}px ${space.xs + 2}px`,
  cursor: 'pointer',
});
