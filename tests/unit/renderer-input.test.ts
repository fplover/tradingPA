// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Bar } from '@/types/market';
import { createMockCtx, asCtx, fillTexts, hasCall, type MockCtx } from './helpers/mock-ctx';

/**
 * ChartRenderer 输入 → 状态集成测试（A3-3）。
 * jsdom 无 canvas 2D 实现：mock getContext 返回第 2 层同款记录式 ctx；
 * jsdom 无指针捕获/ResizeObserver：打桩（只补环境，不改被测逻辑）。
 * 目标：pointer/wheel 输入 → viewport/priceScale/画线/十字光标状态链路有回归保护。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CANVAS_W = 1280;
const CANVAS_H = 800;
const AXIS_W = 64;
const AXIS_H = 24;

/** 600 根确定性 K 线（与视觉回归 harness 同构的固定序列） */
function makeBars(n = 600): Bar[] {
  const out: Bar[] = [];
  let price = 30_000;
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(0.01, open + (rand() - 0.5) * open * 0.004);
    const high = Math.max(open, close) + rand() * open * 0.003;
    const low = Math.min(open, close) - rand() * open * 0.003;
    out.push({ time: T0 + i * IV, open, high, low, close, volume: 100 + rand() * 900 });
    price = close;
  }
  return out;
}

const BARS = makeBars();

let ctx: MockCtx;
let canvas: HTMLCanvasElement;

beforeEach(() => {
  ctx = createMockCtx();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => asCtx(ctx)) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  // jsdom 缺失的指针捕获 API：打桩为无害空实现（被测逻辑只调用不依赖其效果）
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  // jsdom 无 ResizeObserver
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
    ({ left: 0, top: 0, right: CANVAS_W, bottom: CANVAS_H, width: CANVAS_W, height: CANVAS_H, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRenderer(bars: Bar[] = BARS): ChartRenderer {
  const r = new ChartRenderer(canvas, bars, { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw(); // 同步首帧（不经 rAF），保证 priceScale 已自动适配
  return r;
}

function pointer(type: string, x: number, y: number, button = 0): void {
  canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button, pointerId: 1, bubbles: true, cancelable: true }));
}

function wheel(x: number, y: number, deltaY: number, mods: { ctrl?: boolean } = {}): WheelEvent {
  const ev = new WheelEvent('wheel', { clientX: x, clientY: y, deltaY, ctrlKey: mods.ctrl ?? false, bubbles: true, cancelable: true });
  canvas.dispatchEvent(ev);
  return ev;
}

/** 重绘并取当帧全部 fillText（价格轴标签等） */
function axisLabels(r: ChartRenderer): string[] {
  ctx.calls.length = 0;
  r.redraw();
  return fillTexts(ctx);
}

/** 初始视口：600 根贴右 → first = 600 - 1216/8 + 5 = 453，spacing = 8 */
const FIRST0 = 600 - (CANVAS_W - AXIS_W) / 8 + 5;

describe('ChartRenderer 输入：拖拽平移', () => {
  it('pointerdown+move 平移视口：first 变化量 = -dx/spacing', () => {
    const r = makeRenderer();
    expect(r.getViewport().first).toBeCloseTo(FIRST0, 6);
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 200, 300); // dx = -100
    expect(r.getViewport().first - FIRST0).toBeCloseTo(100 / 8, 6);
    pointer('pointerup', 200, 300);
  });

  it('松柄（pointerup）后继续移动不再平移', () => {
    const r = makeRenderer();
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 200, 300);
    pointer('pointerup', 200, 300);
    const settled = r.getViewport().first;
    pointer('pointermove', 100, 300);
    expect(r.getViewport().first).toBe(settled);
  });

  it('上下拖动锁定价格域（manual），轴标签随之变化', () => {
    const r = makeRenderer();
    const before = axisLabels(r);
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 300, 400); // dy = +100 → 价格域平移
    const after = axisLabels(r);
    expect(after).not.toEqual(before);
    pointer('pointerup', 300, 400);
  });
});

describe('ChartRenderer 输入：滚轮缩放', () => {
  it('滚轮缩放视口：spacing 按 0.9/1.1 因子变化', () => {
    const r = makeRenderer();
    expect(r.getViewport().spacing).toBe(8);
    const ev = wheel(400, 300, -100); // 放大
    expect(ev.defaultPrevented).toBe(true); // preventDefault 生效（禁页面滚动）
    expect(r.getViewport().spacing).toBeCloseTo(8 * 0.9, 6);
    wheel(400, 300, 100); // 缩小
    expect(r.getViewport().spacing).toBeCloseTo(8 * 0.9 * 1.1, 6);
  });

  it('Ctrl+滚轮 = 价格轴缩放：spacing 不变，价格域变化', () => {
    const r = makeRenderer();
    const before = axisLabels(r);
    wheel(400, 300, 100, { ctrl: true });
    expect(r.getViewport().spacing).toBe(8); // 视口间距不变
    expect(axisLabels(r)).not.toEqual(before); // 价格域被放大
  });
});

describe('ChartRenderer 输入：价格轴拖拽', () => {
  it('价格轴 pointerdown+move 改价格域，轴标签变化', () => {
    const r = makeRenderer();
    const before = axisLabels(r);
    pointer('pointerdown', CANVAS_W - 10, 300); // 价格轴区域
    pointer('pointermove', CANVAS_W - 10, 400);
    expect(axisLabels(r)).not.toEqual(before);
    pointer('pointerup', CANVAS_W - 10, 400);
  });
});

describe('ChartRenderer 输入：画线工具落点', () => {
  it('趋势线：两次点击产生 2 点画线，世界坐标与落点对应', () => {
    const r = makeRenderer();
    r.setActiveTool('trendline');
    pointer('pointerdown', 200, 200);
    pointer('pointerup', 200, 200);
    pointer('pointerdown', 400, 300);
    pointer('pointerup', 400, 300);
    const ds = r.listDrawings();
    expect(ds).toHaveLength(1);
    expect(ds[0].type).toBe('trendline');
    expect(ds[0].points).toHaveLength(2);
    // 落点 → 世界坐标：index = x/spacing + first；磁吸 off 时保留小数时间精度
    const first = r.getViewport().first;
    const idx0 = 200 / 8 + first;
    const round0 = Math.round(idx0);
    expect(ds[0].points[0].time).toBeCloseTo(BARS[round0].time + (idx0 - round0) * IV, 6);
    const idx1 = 400 / 8 + first;
    expect(ds[0].points[1].time).toBeGreaterThan(ds[0].points[0].time);
    // 价格落在数据价格区间内
    const lo = Math.min(...BARS.map((b) => b.low));
    const hi = Math.max(...BARS.map((b) => b.high));
    for (const p of ds[0].points) {
      expect(p.price).toBeGreaterThanOrEqual(lo);
      expect(p.price).toBeLessThanOrEqual(hi);
    }
  });

  it('水平线：单次点击即落成 1 点画线', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    pointer('pointerdown', 500, 300);
    pointer('pointerup', 500, 300);
    const ds = r.listDrawings();
    expect(ds).toHaveLength(1);
    expect(ds[0].type).toBe('hline');
    expect(ds[0].points).toHaveLength(1);
  });
});

describe('ChartRenderer 输入：十字光标与回调', () => {
  it('pointermove 过图表 → onCrosshairTime 收到所在 bar 时间；移出图表区 → null', () => {
    const r = makeRenderer();
    const times: Array<number | null> = [];
    r.onCrosshairTime((t) => times.push(t));
    pointer('pointermove', 500, 300);
    const idx = Math.round(500 / 8 + r.getViewport().first);
    expect(times.at(-1)).toBe(BARS[idx].time);
    pointer('pointermove', CANVAS_W + 20, 300); // x 越出 chartW
    expect(times.at(-1)).toBeNull();
  });

  it('pointerleave 隐藏十字光标（重绘无虚线调用）', () => {
    const r = makeRenderer();
    pointer('pointermove', 500, 300);
    canvas.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    ctx.calls.length = 0;
    r.redraw();
    expect(hasCall(ctx, 'setLineDash', [[4, 4]])).toBe(false);
  });
});

describe('ChartRenderer 输入：视口提交与右键', () => {
  it('拖拽松柄与滚轮缩放都触发 onViewportCommit', () => {
    const r = makeRenderer();
    const commits: Array<{ first: number; spacing: number }> = [];
    r.onViewportCommit((v) => commits.push(v));
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 250, 300);
    pointer('pointerup', 250, 300);
    expect(commits).toHaveLength(1);
    wheel(300, 300, -100);
    expect(commits).toHaveLength(2);
  });

  it('右键：阻止默认菜单，回调带上价格/时间/屏幕坐标', () => {
    const r = makeRenderer();
    let seen: { price: number; time: number; x: number; y: number } | null = null;
    r.setContextMenuCallback((price, time, x, y) => {
      seen = { price, time, x, y };
    });
    const ev = new MouseEvent('contextmenu', { clientX: 400, clientY: 300, bubbles: true, cancelable: true });
    canvas.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(seen).not.toBeNull();
    const idx = Math.round(400 / 8 + r.getViewport().first);
    expect(seen!.time).toBe(BARS[idx].time);
    expect(seen!.x).toBe(400);
    expect(seen!.y).toBe(300);
    expect(Number.isFinite(seen!.price)).toBe(true);
  });
});

describe('ChartRenderer 输入 → 渲染链路', () => {
  it('混合交互后 redraw 不抛错且确有绘制产出', () => {
    const r = makeRenderer();
    r.setActiveTool('hline');
    pointer('pointerdown', 300, 300);
    pointer('pointerup', 300, 300);
    r.setActiveTool(null);
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 200, 250);
    pointer('pointerup', 200, 250);
    pointer('pointermove', 500, 300);
    wheel(500, 300, -100);
    ctx.calls.length = 0;
    expect(() => r.redraw()).not.toThrow();
    expect(ctx.calls.length).toBeGreaterThan(50);
    expect(fillTexts(ctx)).toContain('BTC/USDT'); // 图例商品行
    r.dispose();
  });

  it('dispose 后解绑输入：事件不再改变状态', () => {
    const r = makeRenderer();
    r.dispose();
    const before = r.getViewport().first;
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 200, 300);
    expect(r.getViewport().first).toBe(before);
  });
});
