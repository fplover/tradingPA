import { useRef, useState } from 'react';
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
  Check,
  type LucideIcon,
} from 'lucide-react';
import type { DrawingTypeId } from '@/engine/drawing/types';
import { useDrawingStore } from '@/store/drawingStore';
import { fontSize, shadow, space, zIndex } from '@/ui/tokens';

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

/** 工具分组：多变体的组只显示当前变体，长按弹出 flyout（TV 行为） */
const GROUPS: ToolbarItem[][] = [
  ['cursor'],
  ['trendline', 'ray', 'info-line', 'hline', 'vline', 'arrow'],
  ['channel'],
  ['fib'],
  ['rect', 'ellipse', 'path'],
  ['text'],
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

const HOLD_MS = 350;

interface FlyoutState {
  group: number;
  x: number;
  y: number;
}

/** 左侧画线工具栏：TV 为 52px 宽、38×38 按钮；底部依次 磁吸/锁定/隐藏/清空 */
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

  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const holdTimer = useRef<number | null>(null);
  const openedByHold = useRef(false);

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  /** 组内当前变体：激活工具属于该组则显示它，否则显示组首工具 */
  const shownOf = (group: ToolbarItem[]): ToolbarItem =>
    group.includes('cursor') ? 'cursor' : (group.find((t) => t === activeTool) ?? group[0]);

  const activate = (item: ToolbarItem) => setActiveTool(item === 'cursor' ? null : (item as DrawingTypeId));

  return (
    <div style={toolbarStyle} aria-label="画线工具">
      {GROUPS.map((group, gi) => {
        const shown = shownOf(group);
        const Icon = ICONS[shown];
        const active = shown === 'cursor' ? activeTool === null : activeTool === shown;
        const hasFlyout = group.length > 1;
        return (
          <button
            key={gi}
            className="rail-btn"
            data-active={active}
            title={hasFlyout ? `${TOOL_LABELS[shown]}（长按选择变体）` : TOOL_LABELS[shown]}
            aria-label={TOOL_LABELS[shown]}
            aria-pressed={active}
            aria-haspopup={hasFlyout ? 'menu' : undefined}
            onPointerDown={(e) => {
              if (!hasFlyout) return;
              const rect = e.currentTarget.getBoundingClientRect();
              openedByHold.current = false;
              clearHold();
              holdTimer.current = window.setTimeout(() => {
                openedByHold.current = true;
                setFlyout({ group: gi, x: rect.right + 2, y: rect.top });
              }, HOLD_MS);
            }}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            onClick={() => {
              if (openedByHold.current) {
                openedByHold.current = false;
                return;
              }
              activate(shown);
            }}
            style={btnStyle}
          >
            <Icon size={18} strokeWidth={active ? 2 : 1.5} />
            {hasFlyout && <span style={caretStyle} aria-hidden />}
          </button>
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
        style={btnStyle}
      >
        <Magnet size={17} strokeWidth={magnet ? 2 : 1.5} />
      </button>
      <button
        className="rail-btn"
        data-active={locked}
        title={locked ? '解锁所有绘图' : '锁定所有绘图'}
        aria-label={locked ? '解锁所有绘图' : '锁定所有绘图'}
        aria-pressed={locked}
        onClick={onToggleLock}
        style={btnStyle}
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
        style={btnStyle}
      >
        {hideDrawings ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
      <button
        className="rail-btn"
        title="删除选中画线（Delete）"
        aria-label="删除选中画线"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))}
        style={{ ...btnStyle, marginTop: 'auto' }}
      >
        <Trash2 size={17} strokeWidth={1.5} />
      </button>

      {/* flyout：锚在按钮右侧，列出组内变体 */}
      <DropdownMenu.Root
        open={flyout !== null}
        onOpenChange={(open) => {
          if (!open) setFlyout(null);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <span
            aria-hidden
            style={{ position: 'fixed', left: flyout?.x ?? 0, top: flyout?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" side="right" sideOffset={4} className="tv-scroll" style={menuStyle}>
            {flyout &&
              GROUPS[flyout.group].map((id) => {
                const ItemIcon = ICONS[id];
                const selected = id === 'cursor' ? activeTool === null : activeTool === id;
                return (
                  <DropdownMenu.Item
                    key={id}
                    className="tv-menu-item"
                    style={itemStyle}
                    onSelect={() => activate(id)}
                  >
                    <span style={iconSlot}>
                      <ItemIcon size={15} />
                    </span>
                    {TOOL_LABELS[id]}
                    {selected && (
                      <span style={{ marginLeft: 'auto', display: 'flex' }}>
                        <Check size={13} />
                      </span>
                    )}
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

const btnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  border: 'none',
  flexShrink: 0,
};

/** 组右下角小三角：提示存在变体 flyout */
const caretStyle: React.CSSProperties = {
  position: 'absolute',
  right: 4,
  bottom: 4,
  width: 0,
  height: 0,
  borderLeft: '4px solid transparent',
  borderTop: '4px solid currentColor',
  opacity: 0.65,
};

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

const iconSlot: React.CSSProperties = { width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' };

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '3px 2px',
  width: 26,
  flexShrink: 0,
};
