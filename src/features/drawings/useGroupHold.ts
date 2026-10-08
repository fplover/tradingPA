import { useEffect, useRef, useState } from 'react';
import { isGroupActive, shownOf, type ToolGroup, type ToolbarItem } from './drawingToolGroups';

/** TV 实测时序：按住 175ms 激活当前变体，300ms 展开 flyout */
export const ACTIVATE_MS = 175;
export const OPEN_MS = 300;

export interface FlyoutState {
  group: number;
  x: number;
  y: number;
}

/** 工具组按住双定时器状态机 + flyout 开关：与 TV 事件流逐字一致，父组件只装配 */
export function useGroupHold(activeTool: string | null, onActivate: (item: ToolbarItem) => void) {
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
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

  useEffect(() => {
    // 窗口失焦（alt-tab 等）后指针事件不再到达按钮，同样撤销未决定时器
    const onBlur = () => clearTimers();
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      clearTimers();
    };
  }, []);

  const openFlyout = (gi: number, rect: DOMRect) => {
    setFlyout({ group: gi, x: rect.right + 1, y: rect.top - 6 });
  };

  const closeFlyout = () => setFlyout(null);

  /** flyout Root 的 onOpenChange：仅 Radix 关闭时复位「按住展开」标记（caret/Esc 关闭不复位） */
  const onFlyoutOpenChange = (o: boolean) => {
    if (!o) {
      openedByHold.current = false;
      setFlyout(null);
    }
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
      onActivate(shownOf(group, activeTool));
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
    if (isGroupActive(group, activeTool)) {
      openFlyout(gi, e.currentTarget.getBoundingClientRect());
      return;
    }
    if (!activatedWhileHeld.current) onActivate(shownOf(group, activeTool));
  };

  /** 指针移出/被系统取消（pointerleave/pointercancel）：移出后 pointerup 不再到达
   *  按钮，不清理会在松手落点之外误激活变体，并在 300ms 弹出 flyout */
  const onGroupPointerLeave = () => clearTimers();

  return {
    flyout,
    openFlyout,
    closeFlyout,
    onFlyoutOpenChange,
    onGroupPointerDown,
    onGroupPointerUp,
    onGroupPointerLeave,
  };
}
