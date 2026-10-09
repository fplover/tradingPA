// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { createMockCtx, asCtx, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';

/**
 * rAF 帧循环抗异常回归（二期-C1 事故）：谐波比率标签越界抛错时，原实现把
 * `requestAnimationFrame(loop)` 放在帧体之后，异常一逃就再也不挂帧 → 整张画布冻结，
 * 用户侧表现为「所有画线工具没效果」，须刷新页面。现改为「先挂下一帧再干活」，
 * 单帧绘制异常只丢这一帧，循环与后续绘制存活。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CANVAS_W = 1280;
const CANVAS_H = 800;

let canvas: HTMLCanvasElement;
let mock: MockCtx & Record<string, unknown>;
let frames: Array<(t: number) => void>;

function makeBars(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const p = 100 + Math.sin(i / 5) * 8;
    return {
      time: T0 + i * IV,
      open: p,
      high: p + 2,
      low: p - 2,
      close: p + (i % 3) - 1,
      volume: 1000 + i,
    };
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  mock = createMockCtx();
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    asCtx(mock),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // 手动帧队列：不依赖 jsdom 的 rAF 实现，可逐帧驱动并观察是否持续重挂
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: CANVAS_W,
      bottom: CANVAS_H,
      width: CANVAS_W,
      height: CANVAS_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRenderer(): ChartRenderer {
  return new ChartRenderer(canvas, makeBars(300), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
}

/** 驱动一帧：断言异常逃出帧体后队列仍持有下一帧（循环存活） */
function runFrame(r: ChartRenderer): void {
  const pending = frames.shift();
  if (!pending) throw new Error('帧循环已断：没有待执行的回调');
  r.invalidate();
  pending(0);
}

describe('ChartController rAF 循环：绘制异常不得打死帧循环', () => {
  it('启动即挂帧，且首帧绘制出图', () => {
    const r = makeRenderer();
    r.start();
    expect(frames.length).toBe(1);
    runFrame(r);
    expect(mock.calls.some((c) => c.m === 'fillRect')).toBe(true);
    r.dispose();
  });

  it('帧体抛错：异常照常上抛（不静默吞），但下一帧已登记', () => {
    const r = makeRenderer();
    r.start();
    runFrame(r); // 正常帧
    (mock as Record<string, unknown>).fillRect = () => {
      throw new TypeError('boom: 绘制越界');
    };
    expect(() => runFrame(r)).toThrow(TypeError);
    // runFrame 消费掉一帧，帧体在抛错前已挂回一帧 → 队列仍有待执行帧
    expect(frames.length).toBe(1);
    r.dispose();
  });

  it('抛错后恢复：后续帧继续绘制（画布不冻结）', () => {
    const r = makeRenderer();
    r.start();
    runFrame(r);
    const realFillRect = mock.fillRect;
    let armed = true;
    (mock as Record<string, unknown>).fillRect = (...a: unknown[]) => {
      if (armed) throw new TypeError('boom');
      return (realFillRect as (...args: unknown[]) => void)(...a);
    };
    expect(() => runFrame(r)).toThrow(TypeError);
    armed = false;
    const callsBefore = mock.calls.length;
    runFrame(r); // 修复态：应当照常画出
    expect(mock.calls.length).toBeGreaterThan(callsBefore);
    expect(mock.calls.some((c) => c.m === 'fillRect')).toBe(true);
    r.dispose();
  });

  it('连续多帧异常也不终止循环（回归旧行为：第二帧即死）', () => {
    const r = makeRenderer();
    r.start();
    (mock as Record<string, unknown>).fillRect = () => {
      throw new Error('每帧都抛');
    };
    for (let i = 0; i < 5; i++) expect(() => runFrame(r)).toThrow();
    expect(frames.length).toBe(1);
    r.dispose();
  });

  it('dispose 后不再挂帧（stop 与先挂帧的配合）', () => {
    const r = makeRenderer();
    r.start();
    runFrame(r);
    r.dispose();
    // dispose 已置 disposed：队列里残留的那帧执行时直接 return，不再重挂
    const pending = frames.shift();
    expect(pending).toBeDefined();
    pending?.(0);
    expect(frames.length).toBe(0);
  });

  it('重复 start 不叠加循环', () => {
    const r = makeRenderer();
    r.start();
    r.start();
    expect(frames.length).toBe(1);
    r.dispose();
  });
});
