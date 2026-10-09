import { useSyncExternalStore } from 'react';

/**
 * 视口断点（二期-F 移动端 chrome 适配）：≤768px 视为窄屏。
 * matchMedia 驱动的 useSyncExternalStore——断点跨越时触发重渲染；
 * 桌面宽度恒为 false（默认态零像素变化的门控开关）。
 * 宿主无 matchMedia（旧 jsdom/非浏览器环境）时按桌面口径处理（恒 false）。
 */

export const NARROW_BREAKPOINT_PX = 768;

const QUERY = `(max-width: ${NARROW_BREAKPOINT_PX}px)`;

function mq(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

function subscribe(cb: () => void): () => void {
  const m = mq();
  if (!m) return () => {};
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

function snapshot(): boolean {
  return mq()?.matches ?? false;
}

function serverSnapshot(): boolean {
  return false;
}

/** 是否窄屏（≤ NARROW_BREAKPOINT_PX） */
export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
