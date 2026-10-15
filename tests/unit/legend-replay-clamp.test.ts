// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { createMockCtx, asCtx, fillTexts, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';

/**
 * 三期-D5（用户裁决「悬停分支也钳到游标」）：回放中把十字光标移到游标**之右**，
 * 主图图例读的是那根未来 bar 的 OHLC——`RenderPipeline` 只钳了回落分支
 * （`st.currentIndex`），悬停分支直取 `crosshair.barIndex`，而数据窗口链路早已
 * `Math.min(raw, replayIndex)`。两条读数链路口径不一致即为泄露，现统一钳到游标。
 *
 * 断言不写死价格格式：用「游标=150 无悬停」与「游标=100 无悬停」两次转写之差
 * 得到 bar150 专有读数，再要求这些读数不出现在「游标=100 + 悬停到 150」的转写里。
 * 两次基线的视口只由游标决定（setReplayIndex 会居中），所以坐标轴刻度等观感项自动抵消。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const N = 300;
const CANVAS_W = 1280;
const CANVAS_H = 800;
const CUR = 100;
const FUTURE = 150;

let canvas: HTMLCanvasElement;
let mock: MockCtx & Record<string, unknown>;

function makeBars(): Bar[] {
  return Array.from({ length: N }, (_, i) => {
    const p = 100 + Math.sin(i / 5) * 8;
    return { time: T0 + i * IV, open: p, high: p + 2, low: p - 2, close: p + (i % 3) - 1, volume: 1000 + i };
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
  vi.stubGlobal('requestAnimationFrame', () => 1);
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

/** 每次转写用**新的画布元素**：ChartRenderer 在 canvas 上挂 pointermove 监听，
 *  复用同一元素会让上一轮的 renderer 也响应同一事件、把文字写进同一个 mock。 */
function freshCanvas(): HTMLCanvasElement {
  const el = document.createElement('canvas');
  document.body.appendChild(el);
  el.getBoundingClientRect = () =>
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
  return el;
}

/** 画布相对 x：让 HoverController 的 round(xToIndex(cx)) 精确落在 index 上 */
function xOf(r: ChartRenderer, index: number): number {
  const { first, spacing } = r.getViewport();
  return (index - first) * spacing;
}

/** 一次转写：配置回放游标（可空）、可选叠加指标、可选把光标移到某 bar，再整帧重绘并取所有文字 */
function transcript(opts: { replay: number | null; hoverAt?: number; study?: boolean }): string[] {
  mock.calls.length = 0; // 每次转写只看这一帧
  const el = freshCanvas();
  const r = new ChartRenderer(el, makeBars(), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  if (opts.study) r.addIndicator('sma');
  r.redraw();
  r.setReplayIndex(opts.replay);
  if (opts.hoverAt !== undefined) {
    el.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: xOf(r, opts.hoverAt),
        clientY: 120,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  r.redraw();
  const texts = fillTexts(mock);
  r.dispose();
  return texts;
}

const onlyIn = (a: string[], b: string[]): string[] => a.filter((t) => !b.includes(t));

describe('回放中图例悬停分支钳到游标', () => {
  it('游标之右的未来 bar 读数不出现在图例里，图例保持游标值', () => {
    const atCur = transcript({ replay: CUR });
    const atFuture = transcript({ replay: FUTURE });
    const futureOnly = onlyIn(atFuture, atCur);
    const curOnly = onlyIn(atCur, atFuture);
    // 前提核查：两次基线确实只差在游标那根 bar 的读数上（否则本节的断言是空转）
    expect(futureOnly.length).toBeGreaterThan(0);
    expect(curOnly.length).toBeGreaterThan(0);

    const hoverFuture = transcript({ replay: CUR, hoverAt: FUTURE });
    // 前提核查：光标确实落进了图（十字光标会给坐标轴加读数标签），否则「没泄露」是空断言
    expect(onlyIn(hoverFuture, atCur).length, '悬停未注册：十字光标没出现').toBeGreaterThan(0);
    const leaked = futureOnly.filter((t) => hoverFuture.includes(t));
    expect(leaked, `图例泄露了游标之右的读数：${leaked.join(' / ')}`).toEqual([]);
    // 图例仍显示游标（100）那根的读数
    expect(hoverFuture.filter((t) => curOnly.includes(t))).toEqual(expect.arrayContaining(curOnly));
  });

  it('非回放时悬停仍读悬停那根（钳制对正常态是恒等）', () => {
    // 取实时视口内可见的下标：非回放时视口贴右，150 号在屏幕之左、光标打不到它
    const ctrl = N - 20;
    const noHover = transcript({ replay: null });
    const atCtrl = transcript({ replay: ctrl });
    const barLabels = onlyIn(atCtrl, noHover);
    expect(barLabels.length, '基线差应非空').toBeGreaterThan(0);
    const hoverCtrl = transcript({ replay: null, hoverAt: ctrl });
    const shown = barLabels.filter((t) => hoverCtrl.includes(t));
    expect(shown.length, `非回放悬停到 ${ctrl} 号 bar 时图例应显示该 bar 的读数`).toBeGreaterThan(0);
    // 且这读数不是末柱（299）的：noHover 里没有
    expect(onlyIn(hoverCtrl, noHover).length).toBeGreaterThan(0);
  });

  it('回放中悬停到游标之左照旧读悬停 bar（钳制只挡未来侧）', () => {
    const atCur = transcript({ replay: CUR });
    const past = transcript({ replay: CUR, hoverAt: CUR - 6 });
    const pastOnly = onlyIn(past, atCur);
    expect(pastOnly.length, '游标之左的悬停应改变图例读数').toBeGreaterThan(0);
  });

  it('叠加指标（SMA）的图例值同样钳到游标', () => {
    // legendIndex 还有第二个消费者：主图叠加指标在图例上的取值（indicatorValuesAt 的 to 位）
    const atCur = transcript({ replay: CUR, study: true });
    const atFuture = transcript({ replay: FUTURE, study: true });
    const futureOnly = onlyIn(atFuture, atCur);
    expect(futureOnly.length, '基线差应非空（SMA 读数随游标变化）').toBeGreaterThan(0);
    const hoverFuture = transcript({ replay: CUR, study: true, hoverAt: FUTURE });
    const leaked = futureOnly.filter((t) => hoverFuture.includes(t));
    expect(leaked, `图例指标值泄露了游标之右的读数：${leaked.join(' / ')}`).toEqual([]);
  });
});
