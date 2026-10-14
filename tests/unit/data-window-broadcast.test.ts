// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { createMockCtx, asCtx, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';

/**
 * 数据窗口的 **控制器级** 接线单测（三期-C2）。
 * `data-window.test.ts` 用替身输入测纯函数 `buildDataWindowSnapshot`；本文件补的是它测不到的那一半：
 * ① `invalidate()` 这个唯一挂点真的会驱动合帧广播（rAF 未运行立即一次、运行中每帧至多一次），
 *    以及 `onDataWindowChanged` 返回的 off 生效——「漏挂某个变更源」的说法要靠这两条兜住；
 * ② getter 交出去的是**显示序列**的 bar 而不是 base 序列（index 空间 trap 的门面侧）。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CANVAS_W = 1280;
const CANVAS_H = 800;
const N = 60;

function makeBars(): Bar[] {
  let price = 100;
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: N }, (_, i) => {
    const open = price;
    const close = Math.max(0.01, open + (rand() - 0.5) * 2);
    const high = Math.max(open, close) + rand();
    const low = Math.min(open, close) - rand();
    price = close;
    return { time: T0 + i * IV, open, high, low, close, volume: 100 + rand() * 900 };
  });
}

const BASE = makeBars();

let canvas: HTMLCanvasElement;

beforeEach(() => {
  document.body.innerHTML = '';
  const mock: MockCtx = createMockCtx();
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
  vi.useRealTimers();
});

function makeRenderer(): ChartRenderer {
  const r = new ChartRenderer(canvas, makeBars(), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw();
  return r;
}

describe('数据窗口广播：invalidate 是唯一挂点', () => {
  it('rAF 未运行 → 每次 invalidate 立即广播一次；off 后停止', () => {
    const r = makeRenderer();
    let calls = 0;
    const off = r.onDataWindowChanged(() => calls++);
    r.invalidate();
    expect(calls).toBe(1);
    r.invalidate();
    expect(calls).toBe(2);
    off();
    r.invalidate();
    expect(calls).toBe(2); // 退订后不再收（off 必须真删除监听器）
  });

  it('rAF 运行中 → 同帧多次 invalidate 合为一次广播（表格不逐像素重渲）', () => {
    vi.useFakeTimers();
    const r = makeRenderer();
    r.start(); // rafId ≠ 0 → 走合帧分支
    let calls = 0;
    r.onDataWindowChanged(() => calls++);
    r.invalidate();
    r.invalidate();
    r.invalidate();
    expect(calls).toBe(0); // 冲刷前一次都不发
    vi.advanceTimersByTime(20); // 下一帧
    expect(calls).toBe(1); // 三次请求合为一次
  });

  it('鼠标移动经 HoverController → invalidate → 面板拿到吸附态（实时链的门面侧）', () => {
    const r = makeRenderer();
    expect(r.dataWindowSnapshot.fromCrosshair).toBe(false); // 未吸附：回落最新可见 bar
    expect(r.dataWindowSnapshot.cursorPrice).toBeNull();
    expect(r.dataWindowSnapshot.index).toBe(N - 1);
    expect(r.dataWindowSnapshot.bar?.time).toBe(T0 + (N - 1) * IV);

    let calls = 0;
    r.onDataWindowChanged(() => calls++);
    // 落点在实数据带内：60 根 × 默认间距贴右缘，x=400 会在首根之左（xToIndex 取到负 index → 十字光标清空）
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 300, bubbles: true }));
    expect(calls).toBe(1); // 光标移动是一个变更源，不需要面板自己监听指针
    const s = r.dataWindowSnapshot;
    expect(s.fromCrosshair).toBe(true);
    expect(s.index).toBeLessThan(N - 1); // 吸附到光标处的历史 bar，而不是末根
    expect(s.cursorPrice).not.toBeNull();
  });
});

describe('数据窗口快照：index 空间 = 显示序列（门面侧）', () => {
  it('平均K线（HA）下 bar 取显示序列值，不是 base 原值；时间仍对齐', () => {
    const r = makeRenderer();
    r.setChartType('heikin-ashi');
    r.redraw();
    const s = r.dataWindowSnapshot;
    const base = BASE[N - 1];
    // HA 收盘 = (o+h+l+c)/4（`transforms.ts:38`，与前序无关），若误取 base 序列这里必不成立
    expect(s.bar?.close).toBeCloseTo((base.open + base.high + base.low + base.close) / 4, 10);
    expect(s.bar?.close).not.toBe(base.close);
    expect(s.bar?.time).toBe(base.time);
  });
});
