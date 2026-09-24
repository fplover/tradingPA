import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import { control, fontSize, radius, shadow, space, zIndex } from './tokens';

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
        <Dialog.Content style={{ ...contentStyle, width }} aria-label={title}>
          <div style={headerStyle}>
            <Dialog.Title style={titleStyle}>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button style={closeBtnStyle} aria-label="关闭">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    <button
      onClick={onClick}
      title={title}
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
  );
}

// ---------- 样式 ----------

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
  padding: space.lg,
  zIndex: zIndex.modal,
  boxShadow: shadow.menu,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: space.md,
};

const titleStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontSize: fontSize.lg,
  fontWeight: 600,
};

const closeBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  borderRadius: radius.sm,
  padding: 2,
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
  borderRadius: 4,
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
