// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useGroupHold, ACTIVATE_MS, OPEN_MS } from '@/features/drawings/useGroupHold';
import { GROUPS, type ToolGroup } from '@/features/drawings/drawingToolGroups';

/**
 * useGroupHold 指针移出清理（第四轮审查低优先项）：
 * 长按双定时器在指针移出按钮（pointerleave/pointercancel）或窗口失焦（blur）后
 * 必须撤销——移出后 pointerup 不再到达按钮，不清理会在松手落点之外误激活变体
 * 并在 300ms 弹出 flyout。
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** GROUPS[1] = 趋势线组（多变体，长按路径生效） */
const GROUP: ToolGroup = GROUPS[1];
const GI = 1;

const activated: string[] = [];

function Harness() {
  const { flyout, onGroupPointerDown, onGroupPointerUp, onGroupPointerLeave } = useGroupHold(null, (item) =>
    activated.push(item),
  );
  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        'data-testid': 'main',
        onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => onGroupPointerDown(GI, GROUP, e),
        onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => onGroupPointerUp(GI, GROUP, e),
        onPointerLeave: onGroupPointerLeave,
        onPointerCancel: onGroupPointerLeave,
      },
      'main',
    ),
    createElement('span', { 'data-testid': 'flyout' }, flyout ? `open:${flyout.group}` : 'closed'),
  );
}

let container: HTMLDivElement;
let root: Root;
let btn: HTMLButtonElement;
let flyoutText: () => string;

function fire(el: Element | Window, type: string, init: EventInit = {}) {
  act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true, ...init }));
  });
}

function firePointer(el: Element, type: string, init: PointerEventInit = {}) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
  });
}

beforeEach(() => {
  activated.length = 0;
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });
  btn = container.querySelector('button')!;
  flyoutText = () => container.querySelector('[data-testid="flyout"]')!.textContent!;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useGroupHold 长按双定时器（回归基线）', () => {
  it('按住 175ms 激活当前变体', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    act(() => vi.advanceTimersByTime(ACTIVATE_MS));
    expect(activated).toEqual(['trendline']);
  });

  it('按住 300ms 展开 flyout（openedByHold）', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    act(() => vi.advanceTimersByTime(OPEN_MS));
    expect(flyoutText()).toBe(`open:${GI}`);
  });

  it('短按（<175ms）松开：补一次激活，不开 flyout', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    act(() => vi.advanceTimersByTime(ACTIVATE_MS - 20));
    firePointer(btn, 'pointerup', { button: 0 });
    act(() => vi.advanceTimersByTime(OPEN_MS * 2));
    expect(activated).toEqual(['trendline']);
    expect(flyoutText()).toBe('closed');
  });
});

describe('useGroupHold 指针移出/取消/失焦清理', () => {
  it('pointerleave 于定时器触发前移出：不激活、不开 flyout', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    act(() => vi.advanceTimersByTime(ACTIVATE_MS - 20));
    firePointer(btn, 'pointerout', { relatedTarget: document.body }); // React 合成 pointerleave
    act(() => vi.advanceTimersByTime(OPEN_MS * 2));
    expect(activated).toEqual([]);
    expect(flyoutText()).toBe('closed');
  });

  it('pointercancel（触屏被系统接管）撤销两个定时器', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    firePointer(btn, 'pointercancel');
    act(() => vi.advanceTimersByTime(OPEN_MS * 2));
    expect(activated).toEqual([]);
    expect(flyoutText()).toBe('closed');
  });

  it('窗口 blur（alt-tab）撤销未决定时器', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    fire(window, 'blur');
    act(() => vi.advanceTimersByTime(OPEN_MS * 2));
    expect(activated).toEqual([]);
    expect(flyoutText()).toBe('closed');
  });

  it('移出清理后回到按钮松开：按普通点击补激活（不静默丢失操作）', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    firePointer(btn, 'pointerout', { relatedTarget: document.body });
    firePointer(btn, 'pointerup', { button: 0 });
    expect(activated).toEqual(['trendline']);
    expect(flyoutText()).toBe('closed');
  });

  it('flyout 已由按住展开后移出：flyout 保持打开，仅定时器已无', () => {
    firePointer(btn, 'pointerdown', { button: 0 });
    act(() => vi.advanceTimersByTime(OPEN_MS));
    expect(flyoutText()).toBe(`open:${GI}`);
    firePointer(btn, 'pointerout', { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(OPEN_MS * 2));
    expect(flyoutText()).toBe(`open:${GI}`); // TV 观察行为：按住展开的松开/移出不关闭
  });
});
