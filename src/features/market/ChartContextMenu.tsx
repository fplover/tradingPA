import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BarChart3, BellRing, RotateCcw, Star } from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Instrument } from '@/types/instrument';
import { useAlertStore } from '@/store/alertStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useRightDockStore } from '@/features/rightbar/rightPanelStore';
import { fontSize, shadow, space, zIndex } from '@/ui/tokens';

export interface ChartMenuState {
  price: number;
  x: number;
  y: number;
}

interface ChartContextMenuProps {
  state: ChartMenuState | null;
  instrument: Instrument | null;
  renderer: ChartRenderer | null;
  onClose: () => void;
}

/** 图表右键菜单：TradingView 同位置的常用动作（警报/自选/指标/重置视图） */
export function ChartContextMenu({ state, instrument, renderer, onClose }: ChartContextMenuProps) {
  const addAlert = (direction: 'above' | 'below') => {
    if (!state || !instrument) return;
    useAlertStore.getState().add({ symbol: instrument.symbol, price: state.price, direction });
    useRightDockStore.getState().open('alerts');
  };

  return (
    <DropdownMenu.Root
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden
          style={{ position: 'fixed', left: state?.x ?? 0, top: state?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={2} style={menuStyle}>
          <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={() => addAlert('above')}>
            <span style={iconSlot}>
              <BellRing size={14} />
            </span>
            添加上穿警报
            <span style={hintStyle}>{state ? state.price.toFixed(2) : ''}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={() => addAlert('below')}>
            <span style={iconSlot}>
              <BellRing size={14} />
            </span>
            添加下穿警报
            <span style={hintStyle}>{state ? state.price.toFixed(2) : ''}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator style={sepStyle} />
          <DropdownMenu.Item
            className="tv-menu-item"
            style={itemStyle}
            onSelect={() => {
              if (instrument) useWatchlistStore.getState().add(instrument);
            }}
          >
            <span style={iconSlot}>
              <Star size={14} />
            </span>
            加入自选股
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="tv-menu-item"
            style={itemStyle}
            onSelect={() => useIndicatorStore.getState().setPanelOpen(true)}
          >
            <span style={iconSlot}>
              <BarChart3 size={14} />
            </span>
            指标…
          </DropdownMenu.Item>
          <DropdownMenu.Separator style={sepStyle} />
          <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={() => renderer?.resetView()}>
            <span style={iconSlot}>
              <RotateCcw size={14} />
            </span>
            重置图表
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const menuStyle: React.CSSProperties = {
  minWidth: 190,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: `6px ${space.sm + 2}px`,
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  outline: 'none',
  whiteSpace: 'nowrap',
};

const iconSlot: React.CSSProperties = { width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' };

const hintStyle: React.CSSProperties = {
  marginLeft: 'auto',
  paddingLeft: space.md,
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
};

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: `${space.xs}px 0`,
};
