import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, History, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useLayoutStore } from '@/store/layoutStore';
import { icon, space } from '@/ui/tokens';
import { Modal } from '@/ui/primitives';
import {
  btnStyle,
  checkSlot,
  footerStyle,
  groupLabelStyle,
  inputStyle,
  itemStyle,
  menuStyle,
  nameLineStyle,
  rowBtnStyle,
  sepStyle,
  timeLineStyle,
  triggerStyle,
} from './layoutSaveMenuStyles';

/** 存档时间格式化：本地时区 YYYY-MM-DD HH:mm（不用 toLocaleString，避免各环境格式漂移） */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 布局保存 / 加载菜单（TradingView 顶栏布局入口，对齐 Ctrl+S / . 工作流）。
 * 结构复用 ToolbarSelect 的 Radix DropdownMenu 模式，不新建设计语言。
 */
export function LayoutSaveMenu() {
  const open = useLayoutStore((s) => s.saveMenuOpen);
  const setOpen = useLayoutStore((s) => s.setSaveMenuOpen);
  const layouts = useLayoutStore((s) => s.savedLayouts);
  const activeId = useLayoutStore((s) => s.activeLayoutId);
  const lastSavedAt = useLayoutStore((s) => s.lastSavedAt);
  const saveCurrent = useLayoutStore((s) => s.saveCurrentLayout);
  const saveAs = useLayoutStore((s) => s.saveAsLayout);
  const loadLayout = useLayoutStore((s) => s.loadLayout);
  const deleteLayout = useLayoutStore((s) => s.deleteLayout);
  const renameLayout = useLayoutStore((s) => s.renameLayout);
  const resetToDefault = useLayoutStore((s) => s.resetToDefault);

  /** 命名弹窗：renameId != null 为重命名，否则为另存为 */
  const [renameId, setRenameId] = useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const nameDialogOpen = saveAsOpen || renameId !== null;
  const closeNameDialog = () => {
    setSaveAsOpen(false);
    setRenameId(null);
    setNameDraft('');
  };
  const submitName = () => {
    const name = nameDraft.trim();
    if (!name) return;
    if (renameId) renameLayout(renameId, name);
    else saveAs(name);
    closeNameDialog();
  };

  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <button className="tv-icon-btn" style={triggerStyle} aria-label="布局保存与加载">
            <Save size={icon.lg} />
            <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              布局
            </span>
            <ChevronDown size={icon.sm} style={{ opacity: 0.6, flexShrink: 0 }} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className="tv-scroll" style={menuStyle}>
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                saveCurrent();
                setOpen(false);
              }}
            >
              <Save size={icon.md} />
              保存当前布局（Ctrl+S）
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                setNameDraft('');
                setSaveAsOpen(true);
              }}
            >
              <Save size={icon.md} />
              另存为新布局…
            </DropdownMenu.Item>

            <DropdownMenu.Separator style={sepStyle} />
            <DropdownMenu.Label style={groupLabelStyle}>已存布局</DropdownMenu.Label>
            {layouts.length === 0 && (
              <DropdownMenu.Item className="tv-menu-item" style={{ ...itemStyle, color: 'var(--text-faint)' }} disabled>
                暂无已存布局
              </DropdownMenu.Item>
            )}
            {layouts.map((l) => (
              <DropdownMenu.Item
                key={l.id}
                className="tv-menu-item"
                style={itemStyle}
                onSelect={() => {
                  loadLayout(l.id);
                  setOpen(false);
                }}
              >
                <span style={checkSlot}>{l.id === activeId ? <Check size={icon.md} /> : null}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={nameLineStyle}>{l.name}</span>
                  <span style={timeLineStyle}>{formatTime(l.savedAt)}</span>
                </span>
                <button
                  aria-label={`重命名布局 ${l.name}`}
                  title="重命名"
                  style={rowBtnStyle}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setNameDraft(l.name);
                    setRenameId(l.id);
                  }}
                >
                  <Pencil size={icon.sm} />
                </button>
                <button
                  aria-label={`删除布局 ${l.name}`}
                  title="删除"
                  style={rowBtnStyle}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteLayout(l.id);
                  }}
                >
                  <Trash2 size={icon.sm} />
                </button>
              </DropdownMenu.Item>
            ))}

            <DropdownMenu.Separator style={sepStyle} />
            <DropdownMenu.Item
              className="tv-menu-item"
              style={{ ...itemStyle, opacity: activeId ? 1 : 0.5 }}
              disabled={!activeId}
              onSelect={() => {
                if (activeId) loadLayout(activeId);
                setOpen(false);
              }}
            >
              <History size={icon.md} />
              恢复上次布局
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                resetToDefault();
                setOpen(false);
              }}
            >
              <RotateCcw size={icon.md} />
              重置为默认布局
            </DropdownMenu.Item>
            <DropdownMenu.Label style={footerStyle}>
              {lastSavedAt ? `已保存 ${formatTime(lastSavedAt)}` : 'Ctrl+S 保存 · . 打开本菜单'}
            </DropdownMenu.Label>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Modal
        open={nameDialogOpen}
        onOpenChange={(o) => {
          if (!o) closeNameDialog();
        }}
        title={renameId ? '重命名布局' : '另存为新布局'}
        width={280}
      >
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitName();
          }}
          maxLength={60}
          autoFocus
          aria-label="布局名称"
          placeholder="输入布局名称"
          style={inputStyle}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space.sm, marginTop: space.md }}>
          <button style={btnStyle} onClick={closeNameDialog}>
            取消
          </button>
          <button
            style={{ ...btnStyle, background: 'var(--accent)', color: 'var(--text-on-accent)' }}
            onClick={submitName}
          >
            确定
          </button>
        </div>
      </Modal>
    </>
  );
}
