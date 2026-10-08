import { useEffect, useState } from 'react';
import type { DrawingTypeId } from '@/engine/drawing/types';
import { useDrawingStore } from '@/store/drawingStore';
import { BottomControls } from './DrawingToolbarBottomControls';
import { BottomMenu, ToolFlyoutMenu, type BottomMenuState } from './DrawingToolbarMenus';
import { DrawingToolButton } from './DrawingToolButton';
import { GROUPS, type HoverTarget, type ToolbarItem } from './drawingToolGroups';
import { sepStyle, toolbarStyle } from './drawingToolbarStyles';
import { useGroupHold } from './useGroupHold';

/** 左侧画线工具栏：TV 为 52px 宽；底部依次 磁吸/锁定/隐藏/清空 */
export function DrawingToolbar({
  locked,
  onToggleLock,
  hideDrawings,
  onToggleHide,
  onRemoveAll,
}: {
  locked: boolean;
  onToggleLock: () => void;
  hideDrawings: boolean;
  onToggleHide: () => void;
  /** 清空全部：drawings 仅画线 / studies 仅指标 / all 两者 */
  onRemoveAll: (scope: 'drawings' | 'studies' | 'all') => void;
}) {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const magnet = useDrawingStore((s) => s.magnet);
  const setMagnet = useDrawingStore((s) => s.setMagnet);
  const magnetMode = useDrawingStore((s) => s.magnetMode);
  const setMagnetMode = useDrawingStore((s) => s.setMagnetMode);
  const stayMode = useDrawingStore((s) => s.stayMode);
  const setStayMode = useDrawingStore((s) => s.setStayMode);

  const activate = (item: ToolbarItem) => setActiveTool(item === 'cursor' ? null : item);

  /** 底部磁吸/清空两个带 caret 的控件 */
  const [bottomMenu, setBottomMenu] = useState<BottomMenuState | null>(null);
  const [hovered, setHovered] = useState<HoverTarget | null>(null);

  const {
    flyout,
    openFlyout,
    closeFlyout,
    onFlyoutOpenChange,
    onGroupPointerDown,
    onGroupPointerUp,
    onGroupPointerLeave,
  } = useGroupHold(activeTool, activate);

  // TV 热键：Alt+T/H/J/V/F、Alt+Shift+R 直接选工具
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'))
        return;
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

  return (
    <div style={toolbarStyle} aria-label="画线工具">
      {GROUPS.map((group, gi) => (
        <DrawingToolButton
          key={gi}
          group={group}
          activeTool={activeTool}
          hovered={hovered === gi}
          open={flyout?.group === gi}
          onHover={(h) => setHovered(h ? gi : null)}
          onActivate={activate}
          onMainPointerDown={(e) => onGroupPointerDown(gi, group, e)}
          onMainPointerUp={(e) => onGroupPointerUp(gi, group, e)}
          onMainPointerLeave={onGroupPointerLeave}
          onOpenFlyout={(rect) => openFlyout(gi, rect)}
          onCloseFlyout={closeFlyout}
        />
      ))}

      <div style={sepStyle} />
      <BottomControls
        magnet={magnet}
        magnetMode={magnetMode}
        stayMode={stayMode}
        locked={locked}
        hideDrawings={hideDrawings}
        hovered={hovered}
        bottomMenu={bottomMenu}
        setMagnet={setMagnet}
        setStayMode={setStayMode}
        onToggleLock={onToggleLock}
        onToggleHide={onToggleHide}
        onRemoveAll={onRemoveAll}
        onHover={setHovered}
        onBottomMenu={setBottomMenu}
      />

      <BottomMenu
        menu={bottomMenu}
        magnetMode={magnetMode}
        setMagnetMode={setMagnetMode}
        onRemoveAll={onRemoveAll}
        onOpenChange={(o) => {
          if (!o) setBottomMenu(null);
        }}
      />
      <ToolFlyoutMenu flyout={flyout} activeTool={activeTool} onSelect={activate} onOpenChange={onFlyoutOpenChange} />
    </div>
  );
}
