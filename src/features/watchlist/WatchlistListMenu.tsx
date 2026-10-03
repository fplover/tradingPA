import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { Watchlist } from '@/store/watchlistStore';
import { control, fontSize, space } from '@/ui/tokens';
import { leadingIconSlot, menuItemStyle, menuStyle, sepStyle } from './watchlistShared';

interface WatchlistListMenuProps {
  lists: Watchlist[];
  activeListId: string;
  /** 当前列表名（面板已按 activeListId 解析，含回退到首个列表） */
  activeName: string | undefined;
  onSwitch: (listId: string) => void;
  onCreate: () => void;
}

/** 头部列表选择器：切换 / 新建自选股列表 */
export function WatchlistListMenu({ lists, activeListId, activeName, onSwitch, onCreate }: WatchlistListMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="tv-icon-btn"
          style={{ ...listTriggerStyle, color: 'var(--text)' }}
          aria-label="切换自选股列表"
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeName}</span>
          <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} style={menuStyle}>
          {lists.map((l) => (
            <DropdownMenu.Item
              key={l.id}
              className="tv-menu-item"
              style={menuItemStyle}
              onSelect={() => onSwitch(l.id)}
            >
              <span style={leadingIconSlot}>{l.id === activeListId ? <Check size={14} /> : null}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.name}
              </span>
              <span style={{ color: 'var(--text-faint)', fontSize: fontSize.xs }}>{l.items.length}</span>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator style={sepStyle} />
          <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={() => onCreate()}>
            <span style={leadingIconSlot}>
              <Plus size={14} />
            </span>
            新建列表
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const listTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  maxWidth: 140,
  height: control.h,
  padding: `0 ${space.xs}px`,
  border: 'none',
  borderRadius: 4,
  fontSize: fontSize.lg,
  fontWeight: 600,
  cursor: 'pointer',
};
