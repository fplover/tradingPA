import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, X } from 'lucide-react';
import { filterCommands } from './fuzzyMatch';
import type { CommandItem } from './commandRegistry';
import { fontSize, icon, radius, shadow, zIndex } from '@/ui/tokens';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
}

/** 全局命令面板（P1-E）：模糊匹配浮层 + 键盘导航 ↑/↓/Enter/Esc（AC-E1）。
 *  Radix Dialog 提供焦点陷阱与 Esc；↑/↓/Enter 在输入框上接管。 */
export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  // 每次打开重置查询与选中；查询变化时选中回落第一项
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  // 键盘选中项滚入可视区
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, filtered.length]);

  const execute = (cmd: CommandItem | undefined) => {
    if (!cmd) return;
    onOpenChange(false);
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(filtered[active]);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} aria-label="命令面板" onKeyDown={onKeyDown}>
          <Dialog.Title style={visuallyHidden}>命令面板</Dialog.Title>
          <Dialog.Description style={visuallyHidden} />
          <div style={inputRowStyle}>
            <Search size={icon.md} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入命令…（↑/↓ 选择，Enter 执行，Esc 关闭）"
              aria-label="搜索命令"
              style={inputStyle}
            />
            <Dialog.Close asChild>
              <button style={closeStyle} aria-label="关闭命令面板">
                <X size={icon.md} />
              </button>
            </Dialog.Close>
          </div>
          <div ref={listRef} role="listbox" aria-label="命令列表" className="tv-scroll" style={listStyle}>
            {filtered.length === 0 && <div style={emptyStyle}>没有匹配的命令</div>}
            {filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              return (
                <div
                  key={cmd.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => execute(cmd)}
                  style={{ ...itemStyle, ...(i === active ? activeItemStyle : null) }}
                >
                  {Icon ? (
                    <Icon size={icon.lg} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: icon.lg }} />
                  )}
                  <span
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {cmd.title}
                  </span>
                  {cmd.hint && <kbd style={hintStyle}>{cmd.hint}</kbd>}
                  <span style={groupStyle}>{cmd.group}</span>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay)',
  zIndex: zIndex.modal,
};

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 460,
  maxWidth: 'calc(100vw - 32px)',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.lg,
  boxShadow: shadow.modal,
  zIndex: zIndex.modal + 1,
  overflow: 'hidden',
  padding: 0,
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
};

const closeStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  display: 'flex',
  padding: 2,
};

const listStyle: React.CSSProperties = {
  maxHeight: 320,
  overflowY: 'auto',
  padding: 4,
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  fontSize: fontSize.sm,
  color: 'var(--text)',
  cursor: 'pointer',
  borderRadius: radius.sm,
};

const activeItemStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-faint)',
  border: '1px solid var(--border)',
  borderRadius: radius.xs,
  padding: '0 4px',
};

const groupStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-faint)',
  flexShrink: 0,
};

const emptyStyle: React.CSSProperties = {
  padding: '16px 8px',
  textAlign: 'center',
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};
