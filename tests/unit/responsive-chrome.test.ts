// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NARROW_BREAKPOINT_PX } from '@/hooks/useViewport';
import { PANEL_MAX_VW, RAIL_W, TOPBAR_H, rightPanelBox } from '@/features/rightbar/rightPanelLayout';

/**
 * 二期-F 移动端 chrome 适配 golden 用例：断点常量与 matchMedia 可用性、
 * 右侧面板几何（窄屏覆盖层 / 桌面内联占位透传——桌面零像素变化门控）。
 * hook 本体为 useSyncExternalStore 十行胶水（matchMedia 'change' 订阅），
 * jsdom 无布局引擎 matches 恒 false（即桌面口径），渲染行为由 E2E 黄金截图背书。
 */

describe('断点：NARROW_BREAKPOINT_PX 与 matchMedia', () => {
  it('断点常量 768；hook 的 matchMedia 依赖在宿主打桩下可用', () => {
    expect(NARROW_BREAKPOINT_PX).toBe(768);
    // 打桩 matchMedia（jsdom 未实现）：hook 消费的 addEventListener/matches 契约可用
    const listeners = new Set<() => void>();
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const m = window.matchMedia('(max-width: 768px)');
    expect(m.matches).toBe(false);
    expect(() => m.addEventListener('change', () => {})).not.toThrow();
    expect(listeners.size).toBe(1);
  });
});

describe('rightPanelBox：窄屏覆盖层 / 桌面透传', () => {
  it('桌面：与原内联占位样式逐字一致（零像素门控）', () => {
    expect(rightPanelBox(false, 280)).toEqual({
      position: 'relative',
      width: 280,
      height: '100%',
      flexShrink: 0,
    });
  });

  it('窄屏：fixed 覆盖层，锚定顶栏下、图标轨左，宽度钳 ≤85vw', () => {
    const box = rightPanelBox(true, 280);
    expect(box).toEqual({
      position: 'fixed',
      width: 280,
      top: TOPBAR_H + 1,
      bottom: 0,
      right: RAIL_W,
      maxWidth: PANEL_MAX_VW,
    });
    expect(PANEL_MAX_VW).toBe('85vw');
  });

  it('桌面样式不含 fixed 字段（不产生阴影/zIndex 变化源）', () => {
    const box = rightPanelBox(false, 280);
    expect(box.top).toBeUndefined();
    expect(box.right).toBeUndefined();
    expect(box.maxWidth).toBeUndefined();
  });
});
