import { TvCaret } from './tvIcons';
import { ICONS, isGroupActive, shownOf, TOOL_LABELS, type ToolGroup, type ToolbarItem } from './drawingToolGroups';
import { caretStyle, cellStyle, controlStyle, mainBtnStyle } from './drawingToolbarStyles';
import { icon } from '@/ui/tokens';

interface DrawingToolButtonProps {
  group: ToolGroup;
  activeTool: string | null;
  hovered: boolean;
  open: boolean;
  onHover: (hovered: boolean) => void;
  onActivate: (item: ToolbarItem) => void;
  onMainPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onMainPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** 指针移出/取消：撤销长按定时器（useGroupHold.onGroupPointerLeave） */
  onMainPointerLeave: () => void;
  onOpenFlyout: (rect: DOMRect) => void;
  onCloseFlyout: () => void;
}

/** 单个工具组控件：主按钮显示当前变体，caret 即时开关 flyout（DOM 与 TV 逐字一致） */
export function DrawingToolButton({
  group,
  activeTool,
  hovered,
  open,
  onHover,
  onActivate,
  onMainPointerDown,
  onMainPointerUp,
  onMainPointerLeave,
  onOpenFlyout,
  onCloseFlyout,
}: DrawingToolButtonProps) {
  const shown = shownOf(group, activeTool);
  const Icon = ICONS[shown];
  const active = isGroupActive(group, activeTool);
  const hasFlyout = group.items.length > 1;
  return (
    <div data-tool-control style={controlStyle} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button
        style={mainBtnStyle}
        title={TOOL_LABELS[shown]}
        aria-label={TOOL_LABELS[shown]}
        aria-pressed={active}
        aria-haspopup={hasFlyout ? 'menu' : undefined}
        onPointerDown={onMainPointerDown}
        onPointerUp={onMainPointerUp}
        onPointerLeave={onMainPointerLeave}
        onPointerCancel={onMainPointerLeave}
        onClick={(e) => {
          // 键盘激活（Enter/Space，detail=0）与单变体组走 click
          if (!hasFlyout || e.detail === 0) onActivate(shown);
        }}
      >
        <span
          style={{
            ...cellStyle,
            background: active ? 'var(--accent)' : hovered ? 'var(--panel-2)' : 'transparent',
          }}
        >
          <Icon
            size={icon.xl}
            strokeWidth={1.5}
            style={{ color: active ? 'var(--text-on-accent)' : hovered ? 'var(--text)' : undefined }}
          />
        </span>
      </button>
      {hasFlyout && (
        <button
          style={{ ...caretStyle, opacity: hovered || open ? 1 : 0 }}
          title={group.title}
          aria-label={group.title}
          aria-haspopup="menu"
          aria-expanded={open}
          data-role="menu-handle"
          onClick={(e) => {
            if (open) {
              onCloseFlyout();
              return;
            }
            const main = e.currentTarget.parentElement?.firstElementChild as HTMLElement | undefined;
            const rect = main?.getBoundingClientRect();
            if (rect) onOpenFlyout(rect);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              const main = e.currentTarget.parentElement?.firstElementChild as HTMLElement | undefined;
              const rect = main?.getBoundingClientRect();
              if (rect) onOpenFlyout(rect);
            } else if (e.key === 'Escape') {
              onCloseFlyout();
            }
          }}
        >
          <TvCaret
            size={icon.sm}
            style={{
              transform: open ? 'rotate(180deg)' : undefined,
              transition: 'transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          />
        </button>
      )}
    </div>
  );
}
