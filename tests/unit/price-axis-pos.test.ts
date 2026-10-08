// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { ChartState } from '@/engine/renderer/ChartState';
import { Viewport } from '@/engine/viewport/Viewport';
import { Crosshair } from '@/engine/crosshair/Crosshair';
import { CloseCountdown } from '@/engine/countdown';
import { PriceScale } from '@/engine/scale/PriceScale';
import { BarSeries } from '@/data/BarSeries';
import { chartAreaOffsetX, chartAreaWidth } from '@/engine/renderer/chartPanes';
import { decideCursor } from '@/engine/renderer/cursor';
import { drawCrosshair } from '@/engine/renderer/crosshairOverlay';
import { drawPriceAxis, drawTimeAxis } from '@/engine/renderer/drawAxes';
import type { LegendInfo } from '@/engine/renderer/legendTypes';
import type { Bar } from '@/types/market';
import { asCtx, callsOf, createMockCtx, fillTexts, propSets, type MockCtx } from './helpers/mock-ctx';

/**
 * 价格坐标位置（TV Scales 页 left/none）+ ChartController 几何接线。
 * jsdom 无 canvas 2D 实现：mock getContext 返回记录式 ctx（translate/fillRect 等
 * 调用与入参按序记录，不含变换合成——轴条几何按 translate 前的面板局部坐标断言）。
 * 默认 right 的全部既有路径必须零像素变化（黄金截图基线）。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CANVAS_W = 1280;
const CANVAS_H = 800;
const AXIS_W = 64;
const CHART_W = CANVAS_W - AXIS_W; // 1216（right/left 图表区宽）
const CHART_H = CANVAS_H - 24; // 776（主面板高）
const BAR_COUNT = 600;

/** 600 根确定性 K 线（与视觉回归 harness 同构的固定序列） */
function makeBars(n = BAR_COUNT): Bar[] {
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
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    asCtx(ctx),
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
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRenderer(): ChartRenderer {
  const r = new ChartRenderer(canvas, BARS, { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw(); // 同步首帧（不经 rAF）
  return r;
}

function pointer(type: string, x: number, y: number, button = 0): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, button, pointerId: 1, bubbles: true, cancelable: true }),
  );
}

function dblclick(x: number, y: number): void {
  canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

/** 价格轴条填充（面板局部坐标；mock 不含 translate 合成） */
function axisStripRects(): number[][] {
  return callsOf(ctx, 'fillRect')
    .map((a) => a as number[])
    .filter((a) => a[2] === AXIS_W && a[3] === CHART_H);
}

/** 是否含 translate(offsetX, 0)（PaneRenderer 按价格轴侧偏移图表区） */
function hasPaneTranslate(offsetX: number): boolean {
  return callsOf(ctx, 'translate').some((a) => a[0] === offsetX && a[1] === 0);
}

describe('图表区几何：三态纯函数', () => {
  it('chartAreaWidth/chartAreaOffsetX：right 轴在右、left 轴在左、none 无轴全宽', () => {
    // right：轴在右，图表区 x∈[0, chartW]
    expect(chartAreaWidth(CANVAS_W, 'right')).toBe(CHART_W);
    expect(chartAreaOffsetX('right')).toBe(0);
    // left：轴在左，图表区 x∈[AXIS_WIDTH, width]（宽与 right 相同，仅左边界偏移）
    expect(chartAreaWidth(CANVAS_W, 'left')).toBe(CHART_W);
    expect(chartAreaOffsetX('left')).toBe(AXIS_W);
    // none：无轴，图表区全宽
    expect(chartAreaWidth(CANVAS_W, 'none')).toBe(CANVAS_W);
    expect(chartAreaOffsetX('none')).toBe(0);
  });
});

describe('ChartState：价格轴位置 setter 委派', () => {
  it('setPriceAxisPos 落状态并请求重绘（几何换算在宿主）', () => {
    const invalidate = vi.fn();
    const state = new ChartState(
      new Viewport(CHART_W),
      new Crosshair(),
      new CloseCountdown(),
      () => CHART_W,
      invalidate,
    );
    state.initData(BARS);
    expect(state.priceAxisPos).toBe('right');
    invalidate.mockClear();
    state.setPriceAxisPos('left');
    expect(state.priceAxisPos).toBe('left');
    expect(invalidate).toHaveBeenCalledTimes(1);
    state.setPriceAxisPos('none');
    expect(state.priceAxisPos).toBe('none');
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe('ChartController：价格轴位置 → 渲染几何', () => {
  /** 切位后清空调用记录再重绘，只断言当帧产出 */
  function redrawAt(r: ChartRenderer, pos: 'right' | 'left' | 'none'): void {
    r.setPriceAxisPos(pos);
    ctx.calls.length = 0;
    r.redraw();
  }

  it('默认 right：轴条在图表区右缘、面板无偏移（零像素变化）', () => {
    makeRenderer();
    expect(axisStripRects()).toContainEqual([CHART_W, 0, AXIS_W, CHART_H]);
    expect(callsOf(ctx, 'translate').some((a) => a[0] === AXIS_W)).toBe(false);
  });

  it('left：面板整体右移一个轴宽，轴条画到图表区左边界外侧', () => {
    const r = makeRenderer();
    redrawAt(r, 'left');
    expect(hasPaneTranslate(AXIS_W)).toBe(true);
    expect(axisStripRects()).toContainEqual([-AXIS_W, 0, AXIS_W, CHART_H]); // 本地 -64 + translate 64 = 画布 0
  });

  it('none：无价格轴（不绘轴条），图表区全宽', () => {
    const r = makeRenderer();
    redrawAt(r, 'none');
    expect(hasPaneTranslate(AXIS_W)).toBe(false);
    expect(axisStripRects()).toHaveLength(0);
  });

  it('none：视口宽随图表区全宽重算（可见 bar 数增加），切回即恢复', () => {
    const r = makeRenderer();
    const firstAt = (w: number) => BAR_COUNT - w / 8 + 5; // scrollToRealtime：贴右缘
    r.scrollToRealtime();
    expect(r.getViewport().first).toBeCloseTo(firstAt(CHART_W), 6);
    r.setPriceAxisPos('none');
    r.scrollToRealtime();
    expect(r.getViewport().first).toBeCloseTo(firstAt(CANVAS_W), 6);
    r.setPriceAxisPos('left'); // left↔right 图表区宽不变
    r.scrollToRealtime();
    expect(r.getViewport().first).toBeCloseTo(firstAt(CHART_W), 6);
  });
});

describe('drawPriceAxis：轴侧几何', () => {
  const geo = { chartW: CHART_W, chartH: CHART_H };
  const scale = () => {
    const ps = new PriceScale();
    ps.setSize(400);
    ps.setRange(29_000, 31_000);
    return ps;
  };

  it('right：轴条贴图表区右缘、标签右对齐（与原实现逐像素一致）', () => {
    const c = createMockCtx();
    drawPriceAxis(asCtx(c), scale(), 2, geo, false, 'right');
    expect(callsOf(c, 'fillRect')).toContainEqual([CHART_W, 0, AXIS_W, CHART_H]);
    expect(propSets(c, 'textAlign')).toContain('right');
    expect(fillTexts(c).length).toBeGreaterThan(0);
  });

  it('left：轴条画在图表区左边界外侧（本地 -AXIS_WIDTH）、标签左对齐贴轴左缘', () => {
    const c = createMockCtx();
    drawPriceAxis(asCtx(c), scale(), 2, geo, false, 'left');
    expect(callsOf(c, 'fillRect')).toContainEqual([-AXIS_W, 0, AXIS_W, CHART_H]);
    expect(propSets(c, 'textAlign')).toContain('left');
    // 标签 x = 轴条左缘 + 6（右轴则为轴条左缘 + 58 且右对齐）
    const xs = callsOf(c, 'fillText').map((a) => a[1]);
    expect(xs.every((x) => x === -AXIS_W + 6)).toBe(true);
  });

  it('none：不绘轴条/分隔线/标签', () => {
    const c = createMockCtx();
    drawPriceAxis(asCtx(c), scale(), 2, { chartW: CANVAS_W, chartH: CHART_H }, false, 'none');
    expect(callsOf(c, 'fillRect')).toHaveLength(0);
    expect(fillTexts(c)).toHaveLength(0);
  });
});

describe('drawTimeAxis：轴侧与 12 小时制接线', () => {
  const series = () => {
    const s = new BarSeries();
    s.replace(BARS);
    return s;
  };
  const viewport = () => {
    const v = new Viewport(CHART_W);
    v.setBarCount(BAR_COUNT);
    v.setFirstPublic(450);
    return v;
  };

  it('left：时间轴条右移一个轴宽（画布坐标）；right 保持原几何', () => {
    const c = createMockCtx();
    drawTimeAxis(asCtx(c), series(), viewport(), { chartW: CHART_W, chartH: CHART_H }, 'left');
    expect(callsOf(c, 'fillRect')).toContainEqual([AXIS_W, CHART_H, CHART_W, 24]);
    const c2 = createMockCtx();
    drawTimeAxis(asCtx(c2), series(), viewport(), { chartW: CHART_W, chartH: CHART_H });
    expect(callsOf(c2, 'fillRect')).toContainEqual([0, CHART_H, CHART_W, 24]);
  });

  it('hour12：日内标签透传为 H:mm AM/PM', () => {
    const c = createMockCtx();
    drawTimeAxis(asCtx(c), series(), viewport(), { chartW: CHART_W, chartH: CHART_H }, 'right', true);
    const labels = fillTexts(c);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((t) => /^\d{1,2}:\d{2} (AM|PM)$/.test(t))).toBe(true);
    const c2 = createMockCtx();
    drawTimeAxis(asCtx(c2), series(), viewport(), { chartW: CHART_W, chartH: CHART_H });
    expect(fillTexts(c2).every((t) => /^\d{2}:\d{2}$/.test(t))).toBe(true); // 默认 24 小时制
  });
});

describe('drawCrosshair：价格轴标签随侧', () => {
  const legend: LegendInfo = { symbol: 'BTC/USDT', interval: '1m', decimals: 2 };
  const geo = { chartW: CHART_W, chartH: CHART_H };
  const crosshair = () => {
    const c = new Crosshair();
    c.set(500, 300, 10, T0 + 10 * IV, 30_000);
    return c;
  };
  const viewport = () => {
    const v = new Viewport(CHART_W);
    v.setBarCount(BAR_COUNT);
    v.setFirstPublic(0); // snapX = (10 - 0) * 8 = 80
    return v;
  };
  const scale = () => {
    const ps = new PriceScale();
    ps.setSize(CHART_H);
    ps.setRange(29_000, 31_000);
    return ps;
  };
  /** 轴标签底框（h=18）的 x 列表：价格标签 + 时间标签 */
  const labelRects = (c: MockCtx): number[] =>
    callsOf(c, 'fillRect')
      .filter((a) => a[3] === 18)
      .map((a) => a[0] as number);

  it('right：价格标签贴轴左缘（chartW+3），与既有行为一致', () => {
    const c = createMockCtx();
    drawCrosshair(asCtx(c), crosshair(), viewport(), scale(), geo, legend);
    expect(labelRects(c)).toContain(CHART_W + 3);
  });

  it('left：价格标签贴画布左缘（x=3），时间标签随图表区右移 64px', () => {
    const c = createMockCtx();
    drawCrosshair(asCtx(c), crosshair(), viewport(), scale(), geo, legend, 0, geo.chartH, 'left');
    expect(labelRects(c)).toContain(3);
    expect(labelRects(c)).toContain(80 - 21 + AXIS_W); // 时间标签：snapX - w/2 + offsetX（w=42）
  });

  it('none：不绘价格标签，仅剩时间标签', () => {
    const c = createMockCtx();
    drawCrosshair(asCtx(c), crosshair(), viewport(), scale(), geo, legend, 0, geo.chartH, 'none');
    expect(labelRects(c)).toHaveLength(1);
    expect(labelRects(c)).toContain(80 - 21);
  });

  it('hour12：时间标签透传 12 小时制', () => {
    const c = createMockCtx();
    drawCrosshair(asCtx(c), crosshair(), viewport(), scale(), geo, legend, 0, geo.chartH, 'right', true);
    expect(fillTexts(c).some((t) => / (AM|PM)$/.test(t))).toBe(true);
  });
});

describe('InputController：价格轴命中区左右两态', () => {
  it('right（默认）：轴区按下进价格拖拽（视口不动），图表区按下进平移', () => {
    const r = makeRenderer();
    const first0 = r.getViewport().first;
    pointer('pointerdown', CANVAS_W - 10, 300); // 右轴条内
    pointer('pointermove', CANVAS_W - 10, 400);
    expect(r.getViewport().first).toBe(first0); // 价格拖拽：视口不平移
    pointer('pointerup', CANVAS_W - 10, 400);
    pointer('pointerdown', 300, 300); // 图表区
    pointer('pointermove', 200, 300); // dx = -100
    expect(r.getViewport().first - first0).toBeCloseTo(100 / 8, 6);
    pointer('pointerup', 200, 300);
  });

  it('left：左缘 64px 按下进价格拖拽；原右轴区落属图表区（平移）', () => {
    const r = makeRenderer();
    r.setPriceAxisPos('left');
    r.redraw();
    const first0 = r.getViewport().first;
    pointer('pointerdown', 30, 300); // 左轴条内
    pointer('pointermove', 30, 400);
    expect(r.getViewport().first).toBe(first0); // 价格拖拽：视口不平移
    pointer('pointerup', 30, 400);
    pointer('pointerdown', CANVAS_W - 10, 300); // 原右轴区 → 左轴态下属图表区
    pointer('pointermove', CANVAS_W - 20, 300); // dx = -10
    expect(r.getViewport().first - first0).toBeCloseTo(10 / 8, 6);
    pointer('pointerup', CANVAS_W - 20, 300);
  });

  it('none：原轴区也属图表区（平移），价格拖拽不再触发', () => {
    const r = makeRenderer();
    r.setPriceAxisPos('none');
    r.redraw();
    const first0 = r.getViewport().first;
    pointer('pointerdown', CANVAS_W - 10, 300);
    pointer('pointermove', CANVAS_W - 20, 300);
    expect(r.getViewport().first - first0).toBeCloseTo(10 / 8, 6);
    pointer('pointerup', CANVAS_W - 20, 300);
  });

  it('双击价格轴恢复自动适配：右轴双击右缘、左轴双击左缘均命中', () => {
    const r = makeRenderer();
    const lockManual = () => {
      pointer('pointerdown', 300, 300);
      pointer('pointermove', 300, 400); // 纵向拖动 → manual
      pointer('pointerup', 300, 400);
    };
    const hasAutoBtn = () => {
      ctx.calls.length = 0;
      r.redraw();
      return fillTexts(ctx).includes('自动');
    };
    lockManual();
    expect(hasAutoBtn()).toBe(true);
    dblclick(CANVAS_W - 10, 300); // 右轴
    expect(hasAutoBtn()).toBe(false);
    r.setPriceAxisPos('left');
    r.redraw();
    lockManual();
    expect(hasAutoBtn()).toBe(true);
    dblclick(30, 300); // 左轴
    expect(hasAutoBtn()).toBe(false);
  });
});

// ---------- 图表区输入坐标：left 态换算（收口批次） ----------

describe('图表区输入坐标：left 态换算（chrome 层偏移 + InputController/HoverController 局部坐标）', () => {
  /** 独立画布 + 渲染器（同一 canvas 上多个渲染器会串听事件） */
  function fresh(): { r: ChartRenderer; c: HTMLCanvasElement } {
    const c = document.createElement('canvas');
    document.body.appendChild(c);
    c.getBoundingClientRect = () =>
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
    const r = new ChartRenderer(c, BARS, { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
    r.redraw();
    return { r, c };
  }

  function fire(c: HTMLCanvasElement, type: string, x: number, y: number): void {
    c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true }));
  }

  function fireWheel(c: HTMLCanvasElement, x: number, y: number, deltaY: number): void {
    c.dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, deltaY, bubbles: true, cancelable: true }));
  }

  it('decideCursor：chartLeft 左轴区 ns-resize；缺省 = 0 保持旧行为', () => {
    const base = {
      y: 300,
      chartRight: CHART_W,
      chartBottom: CHART_H,
      separatorIndex: null,
      studyHoverBtn: null,
      drawingHoverCursor: '',
      tradeHover: false,
    };
    expect(decideCursor({ ...base, x: 30, chartLeft: AXIS_W })).toBe('ns-resize'); // 左轴条内
    expect(decideCursor({ ...base, x: 200, chartLeft: AXIS_W })).toBe(''); // 图表区内
    expect(decideCursor({ ...base, x: CHART_W + 10, chartLeft: AXIS_W })).toBe('ns-resize'); // 右轴态旧区（left 下属图表区外空白）
    expect(decideCursor({ ...base, x: 30 })).toBe(''); // 缺省 chartLeft = 0：旧判定不回退
  });

  it('left：滚轮缩放锚点按图表区局部坐标（canvas 464 ≡ right 态 400）', () => {
    const a = fresh();
    const b = fresh();
    b.r.setPriceAxisPos('left');
    b.r.redraw();
    fireWheel(a.c, 400, 300, -120); // right 态：画布 400 = 局部 400
    fireWheel(b.c, AXIS_W + 400, 300, -120); // left 态：画布 464 = 局部 400
    const va = a.r.getViewport();
    const vb = b.r.getViewport();
    expect(vb.first).toBeCloseTo(va.first, 6);
    expect(vb.spacing).toBeCloseTo(va.spacing, 6);
    // 判别力：left 态若不做换算（锚点落在画布 464），first 会不同
    const c = fresh();
    c.r.setPriceAxisPos('left');
    c.r.redraw();
    fireWheel(c.c, 400 + AXIS_W * 2, 300, -120); // 画布 528 = 局部 464（错误锚点）
    expect(c.r.getViewport().first).not.toBeCloseTo(va.first, 3);
  });

  it('left：十字光标时间标签与 right 态同局部坐标一致（pointermove 经 chartX 换算）', () => {
    const { r, c } = fresh();
    ctx.calls.length = 0; // 去掉 fresh() 首帧，只留本次 pointermove + redraw 一次绘制
    fire(c, 'pointermove', 400, 300); // right 态基线
    r.redraw();
    const rightLabels = fillTexts(ctx).filter((t) => /^\d{2}:\d{2}$/.test(t));
    r.setPriceAxisPos('left');
    r.redraw();
    ctx.calls.length = 0;
    fire(c, 'pointermove', AXIS_W + 400, 300); // left 态：画布 464 = 局部 400
    r.redraw();
    const leftLabels = fillTexts(ctx).filter((t) => /^\d{2}:\d{2}$/.test(t));
    expect(leftLabels).toEqual(rightLabels);
    expect(leftLabels.length).toBeGreaterThan(0);
  });

  it('left：右键落点时间按局部坐标；左轴区内右键不弹菜单', () => {
    const { r, c } = fresh();
    r.setPriceAxisPos('left');
    r.redraw();
    const seen: number[] = [];
    r.setContextMenuCallback((_price, time) => seen.push(time));
    const vp = r.getViewport();
    const idx = Math.round(400 / vp.spacing + vp.first);
    c.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: AXIS_W + 400, clientY: 300, bubbles: true, cancelable: true }),
    );
    expect(seen).toEqual([BARS[idx].time]);
    seen.length = 0;
    c.dispatchEvent(new MouseEvent('contextmenu', { clientX: 30, clientY: 300, bubbles: true, cancelable: true })); // 左轴区内
    expect(seen).toEqual([]);
  });
});
