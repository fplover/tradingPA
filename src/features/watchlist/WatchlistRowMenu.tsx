import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Flag, LineChart, X } from 'lucide-react';
import type { Instrument } from '@/types/instrument';
import { leadingIconSlot, menuItemStyle, menuLabelStyle, menuStyle } from './watchlistShared';

export interface WatchlistRowMenuState {
  x: number;
  y: number;
  inst: Instrument;
}

interface WatchlistRowMenuProps {
  state: WatchlistRowMenuState | null;
  isFlagged: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenInChart: (inst: Instrument) => void;
  onToggleFlag: (instrumentId: string) => void;
  onRemove: (instrumentId: string) => void;
}

/** 行右键菜单：触发器是光标处的 1px 占位元素，菜单就地弹出 */
export function WatchlistRowMenu({
  state,
  isFlagged,
  onOpenChange,
  onOpenInChart,
  onToggleFlag,
  onRemove,
}: WatchlistRowMenuProps) {
  return (
    <DropdownMenu.Root open={state !== null} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden
          style={{ position: 'fixed', left: state?.x ?? 0, top: state?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={2} style={menuStyle}>
          <DropdownMenu.Label style={menuLabelStyle}>{state?.inst.name}</DropdownMenu.Label>
          <DropdownMenu.Item
            className="tv-menu-item"
            style={menuItemStyle}
            onSelect={() => {
              if (state) onOpenInChart(state.inst);
            }}
          >
            <span style={leadingIconSlot}>
              <LineChart size={14} />
            </span>
            在图表中打开
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="tv-menu-item"
            style={menuItemStyle}
            onSelect={() => {
              if (state) onToggleFlag(state.inst.id);
            }}
          >
            <span style={leadingIconSlot}>
              <Flag size={14} />
            </span>
            {isFlagged ? '取消标记' : '标记'}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="tv-menu-item"
            style={{ ...menuItemStyle, color: 'var(--down)' }}
            onSelect={() => {
              if (state) onRemove(state.inst.id);
            }}
          >
            <span style={leadingIconSlot}>
              <X size={14} />
            </span>
            从列表移除
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
