import { useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Crosshair,
  TrendingUp,
  MoveUpRight,
  Minus,
  SeparatorVertical,
  ArrowUpRight,
  Info,
  Rows3,
  RectangleHorizontal,
  Circle,
  PenLine,
  Type,
  Percent,
  Magnet,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  ChevronRight,
  MousePointer2,
  type LucideIcon,
} from 'lucide-react';
import type { DrawingTypeId } from '@/engine/drawing/types';
import { useDrawingStore } from '@/store/drawingStore';
import { fontSize, space, zIndex } from '@/ui/tokens';

type ToolbarItem = DrawingTypeId | 'cursor' | 'magnet';

const ICONS: Record<ToolbarItem, LucideIcon> = {
  cursor: Crosshair,
  trendline: TrendingUp,
  ray: MoveUpRight,
  hline: Minus,
  vline: SeparatorVertical,
  arrow: ArrowUpRight,
  'info-line': Info,
  channel: Rows3,
  rect: RectangleHorizontal,
  ellipse: Circle,
  path: PenLine,
  text: Type,
  fib: Percent,
  magnet: Magnet,
};

interface ToolGroup {
  items: ToolbarItem[];
  /** caret 的 tooltip，TV zh 文案 */
  title: string;
}

/** 工具分组：多变体组只显示当前变体，flyout 列出全部变体 */
const GROUPS: ToolGroup[] = [
  { items: ['cursor'], title: '游标' },
  { items: ['trendline', 'ray', 'info-line', 'hline', 'vline', 'arrow'], title: '趋势线工具' },
  { items: ['channel'], title: '通道工具' },
  { items: ['fib'], title: '江恩和斐波那契工具' },
  { items: ['rect', 'ellipse', 'path'], title: '几何形状' },
  { items: ['text'], title: '文本工具' },
];

const TOOL_LABELS: Record<ToolbarItem, string> = {
  cursor: '光标',
  trendline: '趋势线',
  ray: '射线',
  hline: '水平线',
  vline: '垂直线',
  arrow: '箭头',
  'info-line': '信息线',
  channel: '平行通道',
  fib: '斐波那契回撤',
  rect: '矩形',
  ellipse: '椭圆',
  path: '路径',
  text: '文本',
  magnet: '磁吸（吸附 OHLC）',
};

/** TV 的 flyout 行内快捷键提示（仅这七个工具有 selectHotkey） */
const HOTKEYS: Partial<Record<ToolbarItem, string>> = {
  trendline: 'Alt + T',
  hline: 'Alt + H',
  ray: 'Alt + J',
  vline: 'Alt + V',
  fib: 'Alt + F',
  rect: 'Alt + Shift + R',
};

/** TV 实测时序：按住 175ms 激活当前变体，300ms 展开 flyout */
const ACTIVATE_MS = 175;
const OPEN_MS = 300;

interface FlyoutState {
  group: number;
  x: number;
  y: number;
}

/** 左侧画线工具栏：TV 为 52px 宽；底部依次 磁吸/锁定/隐藏/清空 */
export function DrawingToolbar({
  locked,
  onToggleLock,
  hideDrawings,
  onToggleHide,
}: {
  locked: boolean;
  onToggleLock: () => void;
  hideDrawings: boolean;
  onToggleHide: () => void;
}) {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const magnet = useDrawingStore((s) => s.magnet);
  const setMagnet = useDrawingStore((s) => s.setMagnet);
  const stayMode = useDrawingStore((s) => s.stayMode);
  const setStayMode = useDrawingStore((s) => s.setStayMode);

  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const activateTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);
  const activatedWhileHeld = useRef(false);
  /** 本次 flyout 是否由按住展开：是则松开不关闭（TV 观察行为） */
  const openedByHold = useRef(false);

  const clearTimers = () => {
    if (activateTimer.current !== null) window.clearTimeout(activateTimer.current);
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    activateTimer.current = null;
    openTimer.current = null;
  };

  useEffect(() => clearTimers, []);

  // TV 热键：Alt+T/H/J/V/F、Alt+Shift+R 直接选工具
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const key = e.key.toLowerCase();
      const pick: Record<string, DrawingTypeId> = {
        t: 'trendline',
        h: 'hline',
        j: 'ray',
        v: 'vline',
        f: 'fib',
      };
      if (e.shiftKey && key === 'r') {
        e.preventDefault();
        setActiveTool('rect');
        return;
      }
      const tool = pick[key];
      if (tool) {
        e.preventDefault();
        setActiveTool(tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTool]);

  const activate = (item: ToolbarItem) => setActiveTool(item === 'cursor' ? null : (item as DrawingTypeId));

  const shownOf = (group: ToolGroup): ToolbarItem =>
    group.items.includes('cursor') ? 'cursor' : (group.items.find((t) => t === activeTool) ?? group.items[0]);

  const isActive = (group: ToolGroup): boolean => {
    const shown = shownOf(group);
    return shown === 'cursor' ? activeTool === null : activeTool === shown;
  };

  const openFlyout = (gi: number, rect: DOMRect) => {
    setFlyout({ group: gi, x: rect.right + 1, y: rect.top - 6 });
  };

  /** 按住：175ms 激活当前变体、300ms 展开 flyout（TV 双定时器） */
  const onGroupPointerDown = (gi: number, group: ToolGroup, e: React.PointerEvent<HTMLButtonElement>) => {
    if (group.items.length < 2 || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    activatedWhileHeld.current = false;
    clearTimers();
    activateTimer.current = window.setTimeout(() => {
      activateTimer.current = null;
      activatedWhileHeld.current = true;
      activate(shownOf(group));
    }, ACTIVATE_MS);
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      openedByHold.current = true;
      openFlyout(gi, rect);
    }, OPEN_MS);
  };

  /** 松开：flyout 已开则保持；组已激活则展开；否则补一次激活 */
  const onGroupPointerUp = (gi: number, group: ToolGroup, e: React.PointerEvent<HTMLButtonElement>) => {
    if (group.items.length < 2 || e.button !== 0) return;
    const pendingOpen = openTimer.current !== null;
    if (pendingOpen) {
      window.clearTimeout(openTimer.current!);
      openTimer.current = null;
    }
    if (activateTimer.current !== null) {
      window.clearTimeout(activateTimer.current);
      activateTimer.current = null;
    }
    if (flyout !== null) {
      // TV：flyout 由点击/caret 打开时再按下本组按钮 = 关闭；按住展开的松开不关闭
      if (flyout.group === gi && !openedByHold.current) setFlyout(null);
      return;
    }
    if (isActive(group)) {
      openFlyout(gi, e.currentTarget.getBoundingClientRect());
      return;
    }
    if (!activatedWhileHeld.current) activate(shownOf(group));
  };

  return (
    <div style={toolbarStyle} aria-label="画线工具">
      {GROUPS.map((group, gi) => {
        const shown = shownOf(group);
        const Icon = ICONS[shown];
        const active = isActive(group);
        const hasFlyout = group.items.length > 1;
        const open = flyout?.group === gi;
        return (
          <div
            key={gi}
            data-tool-control
            style={controlStyle}
            onMouseEnter={() => setHovered(gi)}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              style={mainBtnStyle}
              title={TOOL_LABELS[shown]}
              aria-label={TOOL_LABELS[shown]}
              aria-pressed={active}
              aria-haspopup={hasFlyout ? 'menu' : undefined}
              onPointerDown={(e) => onGroupPointerDown(gi, group, e)}
              onPointerUp={(e) => onGroupPointerUp(gi, group, e)}
              onClick={(e) => {
                // 键盘激活（Enter/Space，detail=0）与单变体组走 click
                if (!hasFlyout || e.detail === 0) activate(shown);
              }}
            >
              <span
                style={{
                  ...cellStyle,
                  background: active ? 'var(--accent)' : hovered === gi ? 'var(--panel-2)' : 'transparent',
                }}
              >
                <Icon
                  size={17}
                  strokeWidth={1.5}
                  style={{ color: active ? 'var(--text-on-accent)' : hovered === gi ? 'var(--text)' : undefined }}
                />
              </span>
            </button>
            {hasFlyout && (
              <button
                style={{ ...caretStyle, opacity: hovered === gi || open ? 1 : 0 }}
                title={group.title}
                aria-label={group.title}
                aria-haspopup="menu"
                aria-expanded={open}
                data-role="menu-handle"
                onClick={(e) => {
                  if (open) {
                    setFlyout(null);
                    return;
                  }
                  const main = e.currentTarget.parentElement?.firstElementChild as HTMLElement | undefined;
                  const rect = main?.getBoundingClientRect();
                  if (rect) openFlyout(gi, rect);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const main = e.currentTarget.parentElement?.firstElementChild as HTMLElement | undefined;
                    const rect = main?.getBoundingClientRect();
                    if (rect) openFlyout(gi, rect);
                  } else if (e.key === 'Escape') {
                    setFlyout(null);
                  }
                }}
              >
                <ChevronRight
                  size={11}
                  style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
                />
              </button>
            )}
          </div>
        );
      })}

      <div style={sepStyle} />
      <button
        className="rail-btn"
        data-active={magnet}
        title={TOOL_LABELS.magnet}
        aria-label={TOOL_LABELS.magnet}
        aria-pressed={magnet}
        onClick={() => setMagnet(!magnet)}
        style={bottomBtnStyle}
      >
        <Magnet size={17} strokeWidth={1.5} />
      </button>
      <button
        className="rail-btn"
        data-active={stayMode}
        title={stayMode ? '保持绘图模式：开' : '保持绘图模式：关（完成后退出工具）'}
        aria-label="保持绘图模式"
        aria-pressed={stayMode}
        onClick={() => setStayMode(!stayMode)}
        style={bottomBtnStyle}
      >
        <MousePointer2 size={17} strokeWidth={1.5} />
      </button>
      <button
        className="rail-btn"
        data-active={locked}
        title={locked ? '解锁所有绘图' : '锁定所有绘图'}
        aria-label={locked ? '解锁所有绘图' : '锁定所有绘图'}
        aria-pressed={locked}
        onClick={onToggleLock}
        style={bottomBtnStyle}
      >
        {locked ? <Lock size={17} /> : <Unlock size={17} />}
      </button>
      <button
        className="rail-btn"
        data-active={hideDrawings}
        title={hideDrawings ? '显示所有绘图' : '隐藏所有绘图'}
        aria-label={hideDrawings ? '显示所有绘图' : '隐藏所有绘图'}
        aria-pressed={hideDrawings}
        onClick={onToggleHide}
        style={bottomBtnStyle}
      >
        {hideDrawings ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
      <button
        className="rail-btn"
        title="删除选中画线（Delete）"
        aria-label="删除选中画线"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))}
        style={{ ...bottomBtnStyle, marginTop: 'auto' }}
      >
        <Trash2 size={17} strokeWidth={1.5} />
      </button>

      {/* flyout：锚在按钮右侧偏上 6px；选中行实心强调色 + 白字，行尾快捷键提示 */}
      <DropdownMenu.Root
        open={flyout !== null}
        // 非模态：TV 的 flyout 不锁焦点、不屏蔽工具栏指针事件（caret 需可点）
        modal={false}
        onOpenChange={(o) => {
          if (!o) {
            openedByHold.current = false;
            setFlyout(null);
          }
        }}
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
                    onSelect={() => activate(id)}
                  >
                    <span style={iconSlot}>
                      <ItemIcon size={15} />
                    </span>
                    {TOOL_LABELS[id]}
                    {HOTKEYS[id] && <span style={hotkeyStyle}>{HOTKEYS[id]}</span>}
                  </DropdownMenu.Item>
                );
              })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

/** 独立列而非浮层：TV 的工具栏占据图表左侧一列，不遮挡画布与图例 */
const toolbarStyle: React.CSSProperties = {
  width: 52,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '6px 0',
  background: 'var(--panel)',
  borderRight: '1px solid var(--border)',
  overflowY: 'auto',
};

const controlStyle: React.CSSProperties = { position: 'relative', width: 38, height: 38, flexShrink: 0 };

const mainBtnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  border: 'none',
  background: 'transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-dim)',
  borderRadius: 4,
  padding: 0,
};

/** 激活态：TV 为强调色实心圆角方块 + 白色图标 */
const cellStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** caret：独立命中目标，悬停或展开时才可见 */
const caretStyle: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 1,
  bottom: 1,
  width: 11,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  cursor: 'pointer',
  padding: 0,
  borderRadius: '4px 0 0 4px',
  transition: 'opacity 120ms ease-out',
};

const bottomBtnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  border: 'none',
  flexShrink: 0,
};

const menuStyle: React.CSSProperties = {
  minWidth: 168,
  maxWidth: 340,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 0,
  zIndex: zIndex.dropdown,
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: '2px 10px 2px 8px',
  minHeight: 28,
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.lg,
  cursor: 'default',
  textAlign: 'left',
  outline: 'none',
  whiteSpace: 'nowrap',
};

const hotkeyStyle: React.CSSProperties = {
  marginLeft: 'auto',
  paddingLeft: space.md,
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

const iconSlot: React.CSSProperties = { width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' };

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '3px 8px',
  flexShrink: 0,
};
