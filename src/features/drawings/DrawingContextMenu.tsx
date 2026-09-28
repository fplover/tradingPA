import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, Settings, Trash2, Copy } from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { useDrawingStore } from '@/store/drawingStore';
import { fontSize, shadow, space, zIndex } from '@/ui/tokens';

export interface DrawingMenuState {
  id: string;
  x: number;
  y: number;
}

interface DrawingContextMenuProps {
  state: DrawingMenuState | null;
  renderer: ChartRenderer | null;
  onClose: () => void;
}

/** 画线右键菜单（TV）：设置 / 移除 / 克隆 / 视觉顺序子菜单 */
export function DrawingContextMenu({ state, renderer, onClose }: DrawingContextMenuProps) {
  const order = (action: 'front' | 'forward' | 'backward' | 'back') => {
    if (state) renderer?.setDrawingOrder(state.id, action);
    onClose();
  };

  return (
    <DropdownMenu.Root
      open={state !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DropdownMenu.Trigger asChild>
        <span aria-hidden style={{ position: 'fixed', left: state?.x ?? 0, top: state?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={2} className="tv-scroll" style={menuStyle}>
          <DropdownMenu.Item
            className="tv-menu-item"
            style={itemStyle}
            onSelect={() => {
              if (state) useDrawingStore.getState().setSettingsFor(state.id);
              onClose();
            }}
          >
            <span style={slot}>
              <Settings size={13} />
            </span>
            设置
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="tv-menu-item"
            style={itemStyle}
            onSelect={() => {
              if (state) renderer?.removeDrawing(state.id);
              onClose();
            }}
          >
            <span style={slot}>
              <Trash2 size={13} />
            </span>
            移除
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="tv-menu-item"
            style={itemStyle}
            onSelect={() => {
              if (state) renderer?.duplicateDrawing(state.id);
              onClose();
            }}
          >
            <span style={slot}>
              <Copy size={13} />
            </span>
            克隆
          </DropdownMenu.Item>
          <DropdownMenu.Separator style={sepStyle} />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="tv-menu-item" style={itemStyle}>
              <span style={slot}>
                <ChevronRight size={13} />
              </span>
              视觉顺序
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="tv-scroll" style={menuStyle}>
                {(
                  [
                    ['front', '置于顶层'],
                    ['forward', '上移一层'],
                    ['backward', '下移一层'],
                    ['back', '置于底层'],
                  ] as const
                ).map(([action, label]) => (
                  <DropdownMenu.Item key={action} className="tv-menu-item" style={itemStyle} onSelect={() => order(action)}>
                    {label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const menuStyle: React.CSSProperties = {
  minWidth: 150,
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

const slot: React.CSSProperties = { width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' };

const sepStyle: React.CSSProperties = { height: 1, background: 'var(--border)', margin: `${space.xs}px 0` };
