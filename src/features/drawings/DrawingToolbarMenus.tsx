import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { GROUPS, HOTKEYS, ICONS, TOOL_LABELS, type ToolbarItem } from './drawingToolGroups';
import { hotkeyStyle, iconSlot, itemStyle, menuStyle } from './drawingToolbarStyles';
import type { FlyoutState } from './useGroupHold';

/** 底部 caret 菜单锚点：kind 区分磁吸档位/清空范围，x/y 为触发按钮右侧偏上 6px */
export interface BottomMenuState {
  kind: 'magnet' | 'remove';
  x: number;
  y: number;
}

/** 底部菜单：磁吸档位 / 清空模式 */
export function BottomMenu({
  menu,
  magnetMode,
  setMagnetMode,
  onRemoveAll,
  onOpenChange,
}: {
  menu: BottomMenuState | null;
  magnetMode: 'weak' | 'strong';
  setMagnetMode: (m: 'weak' | 'strong') => void;
  onRemoveAll: (scope: 'drawings' | 'studies' | 'all') => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DropdownMenu.Root
      open={menu !== null}
      modal={false}
      onOpenChange={onOpenChange}
    >
      <DropdownMenu.Trigger asChild>
        <span aria-hidden style={{ position: 'fixed', left: menu?.x ?? 0, top: menu?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" side="right" sideOffset={0} className="tv-scroll" style={menuStyle}>
          {menu?.kind === 'magnet' && (
            <>
              {(['weak', 'strong'] as const).map((m) => (
                <DropdownMenu.Item
                  key={m}
                  className="tv-menu-item"
                  style={{ ...itemStyle, background: magnetMode === m ? 'var(--accent)' : undefined, color: magnetMode === m ? 'var(--text-on-accent)' : undefined }}
                  onSelect={() => setMagnetMode(m)}
                >
                  {m === 'weak' ? '弱磁铁（50px 内吸附）' : '强磁铁（始终吸附）'}
                </DropdownMenu.Item>
              ))}
            </>
          )}
          {menu?.kind === 'remove' && (
            <>
              <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={() => onRemoveAll('drawings')}>
                移除画线
              </DropdownMenu.Item>
              <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={() => onRemoveAll('studies')}>
                移除指标
              </DropdownMenu.Item>
              <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={() => onRemoveAll('all')}>
                移除画线和指标
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** flyout：锚在按钮右侧偏上 6px；选中行实心强调色 + 白字，行尾快捷键提示 */
export function ToolFlyoutMenu({
  flyout,
  activeTool,
  onSelect,
  onOpenChange,
}: {
  flyout: FlyoutState | null;
  activeTool: string | null;
  onSelect: (item: ToolbarItem) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DropdownMenu.Root
      open={flyout !== null}
      // 非模态：TV 的 flyout 不锁焦点、不屏蔽工具栏指针事件（caret 需可点）
      modal={false}
      onOpenChange={onOpenChange}
    >
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden
          style={{ position: 'fixed', left: flyout?.x ?? 0, top: flyout?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="right"
          sideOffset={0}
          className="tv-scroll"
          style={menuStyle}
          // caret/组按钮不算「外部」：否则关闭与自身 onClick 叠加会变成重开
          onPointerDownOutside={(e) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest?.('[data-tool-control]')) e.preventDefault();
          }}
        >
          {flyout &&
            GROUPS[flyout.group].items.map((id) => {
              const ItemIcon = ICONS[id];
              const selected = id === 'cursor' ? activeTool === null : activeTool === id;
              return (
                <DropdownMenu.Item
                  key={id}
                  className="tv-menu-item"
                  style={{ ...itemStyle, background: selected ? 'var(--accent)' : undefined, color: selected ? 'var(--text-on-accent)' : undefined }}
                  onSelect={() => onSelect(id)}
                >
                  <span style={iconSlot}>
                    <ItemIcon size={14} />
                  </span>
                  {TOOL_LABELS[id]}
                  {HOTKEYS[id] && <span style={hotkeyStyle}>{HOTKEYS[id]}</span>}
                </DropdownMenu.Item>
              );
            })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
