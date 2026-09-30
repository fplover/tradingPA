import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Copy, Download, Pencil, Settings2, X } from 'lucide-react';
import { COLUMNS, type ColumnId } from '@/store/watchlistStore';
import { iconBtnStyle, leadingIconSlot, menuItemStyle, menuLabelStyle, menuStyle, sepStyle } from './watchlistShared';

interface WatchlistSettingsMenuProps {
  columns: ColumnId[];
  /** 多列表时才允许删除当前列表 */
  canDelete: boolean;
  onToggleColumn: (col: ColumnId) => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

/** 列表设置菜单：显示列 / 重命名 / 复制 / 导出 CSV / 删除 */
export function WatchlistSettingsMenu({
  columns,
  canDelete,
  onToggleColumn,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: WatchlistSettingsMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="tv-icon-btn" style={iconBtnStyle} aria-label="列表设置">
          <Settings2 size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} style={menuStyle}>
          <DropdownMenu.Label style={menuLabelStyle}>显示列</DropdownMenu.Label>
          {COLUMNS.map((c) => (
            <DropdownMenu.CheckboxItem
              key={c.id}
              className="tv-menu-item"
              style={menuItemStyle}
              checked={columns.includes(c.id)}
              // 勾选列不应关闭菜单，否则没法连续开多列
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggleColumn(c.id)}
            >
              <span style={leadingIconSlot}>{columns.includes(c.id) ? <Check size={14} /> : null}</span>
              {c.label}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Separator style={sepStyle} />
          <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={() => onRename()}>
            <span style={leadingIconSlot}>
              <Pencil size={14} />
            </span>
            重命名列表
          </DropdownMenu.Item>
          <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={() => onDuplicate()}>
            <span style={leadingIconSlot}>
              <Copy size={14} />
            </span>
            复制列表
          </DropdownMenu.Item>
          <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={() => onExport()}>
            <span style={leadingIconSlot}>
              <Download size={14} />
            </span>
            导出 CSV
          </DropdownMenu.Item>
          {canDelete && (
            <>
              <DropdownMenu.Separator style={sepStyle} />
              <DropdownMenu.Item className="tv-menu-item" style={{ ...menuItemStyle, color: 'var(--down)' }} onSelect={() => onDelete()}>
                <span style={leadingIconSlot}>
                  <X size={14} />
                </span>
                删除列表
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
