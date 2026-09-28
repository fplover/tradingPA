import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { Crosshair } from '@/engine/crosshair/Crosshair';
import { theme, TV_FONT } from '@/engine/theme';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import { drawCandles } from '@/engine/renderer/drawSeries';
import {
  drawGrid,
  drawPriceAxis,
  drawTimeAxis,
  drawBorders,
  drawPaneLegend,
  drawLastPrice,
  formatTime,
} from '@/engine/renderer/drawAxes';
import { drawCrosshair, drawLegendBlock, DEFAULT_LEGEND_OPTIONS } from '@/engine/renderer/drawCrosshair';
import { drawDrawings, hitTestDrawing, pixelToPoint, type DrawContext } from '@/engine/drawing/drawDrawings';
import { drawTrading, hitTestTrading, type TradeVisual } from '@/engine/renderer/drawTrading';
import {
  createMockCtx,
  asCtx,
  callsOf,
  propSets,
  hasCall,
  hasPair,
  fillTexts,
  type MockCtx,
} from './helpers/mock-ctx';

/** drawGrid 读 window.devicePixelRatio；node 环境下打桩（1 = 与视觉回归锁定的 DPR 一致） */
beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// ---------- 固定夹具（无随机，坐标可手算） ----------

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime(); // 本地时间构造，避免时区依赖
const IV = 60_000;

const BARS: Bar[] = [
  { time: T0, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: T0 + IV, open: 104, high: 108, low: 103, close: 101, volume: 900 },
  { time: T0 + 2 * IV, open: 101, high: 105, low: 100, close: 103, volume: 1500 },
  { time: T0 + 3 * IV, open: 103, high: 104, low: 99, close: 100, volume: 700 },
  { time: T0 + 4 * IV, open: 100, high: 107, low: 97, close: 105, volume: 2000 },
  { time: T0 + 5 * IV, open: 105, high: 106, low: 102, close: 102, volume: 800 },
];

function manyBars(n: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const open = 100 + (i % 5);
    const close = 100 + ((i + 2) % 5);
    out.push({ time: T0 + i * IV, open, high: Math.max(open, close) + 2, low: Math.min(open, close) - 2, volume: 500 + i });
  }
  return out;
}

const W = 460;
const H = 300;

function fixture(bars: Bar[] = BARS, spacing = 8) {
  const series = new BarSeries();
  series.replace(bars);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(spacing);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  const low = Math.min(...bars.map((b) => b.low));
  const high = Math.max(...bars.map((b) => b.high));
  priceScale.autoScale(low, high);
  const geo = { chartW: W, chartH: H };
  const ctx = createMockCtx();
  return { ctx, series, viewport, priceScale, geo };
}

/** 默认夹具：first ≈ -46.5（6 根贴右），spacing 8 */
function dctx(series: BarSeries, viewport: Viewport, priceScale: PriceScale, geo: { chartW: number; chartH: number }): DrawContext {
  return { viewport, priceScale, series, geo };
}

function drawing(d: Partial<Drawing> & { type: Drawing['type']; points: DrawingPoint[] }): Drawing {
  return {
    id: 'd1',
    locked: false,
    visible: true,
    style: { color: '#2962ff', lineWidth: 2 },
    ...d,
  } as Drawing;
}

// ---------- drawSeries.drawCandles ----------

describe('drawCandles', () => {
  it('标准蜡烛：影线落在 round(xCenter)+0.5 的 1px 竖线，y 取 priceToY(high/low)', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    drawCandles(asCtx(ctx), series, 0, series.length - 1, viewport, priceScale, geo);

    // 裁剪区：beginPath + rect(0,0,chartW,chartH) + clip，整体 save/restore 包裹
    expect(hasCall(ctx, 'rect', [0, 0, W, H])).toBe(true);
    expect(ctx.calls[0].m).toBe('save');
    expect(ctx.calls[ctx.calls.length - 1].m).toBe('restore');

    // bar0（阳线）：xCenter = (0-(-46.5))*8 = 372 → xc = 372.5
    const yHigh = priceScale.priceToY(106);
    const yLow = priceScale.priceToY(98);
    expect(hasPair(ctx, 'moveTo', [372.5, yHigh], 'lineTo', [372.5, yLow])).toBe(true);
  });

  it('阳线实体：背景填充 + 描边；阴线实体：实色填充且不描边', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    drawCandles(asCtx(ctx), series, 0, series.length - 1, viewport, priceScale, geo);

    const bodyW = Math.min(8 * 0.7, 30); // 5.6
    // bar0（阳）：x = 372 - 2.8 = 369.2
    const yOpen = priceScale.priceToY(100);
    const yClose = priceScale.priceToY(104);
    const top = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.max(yOpen, yClose) - top);
    expect(hasCall(ctx, 'fillRect', [369.2, top, bodyW, bodyH])).toBe(true);
    expect(hasCall(ctx, 'strokeRect', [369.5, Math.round(top) + 0.5, bodyW - 1, bodyH - 1])).toBe(true);
    // 3 阳 3 阴：fillRect 6 次（实体），strokeRect 仅 3 次（阳线描边）
    expect(callsOf(ctx, 'fillRect')).toHaveLength(6);
    expect(callsOf(ctx, 'strokeRect')).toHaveLength(3);
    // 阳线实体填充背景色；阴线实体填充跌色
    expect(propSets(ctx, 'fillStyle')).toContain(theme.background);
    expect(propSets(ctx, 'fillStyle')).toContain(theme.down);
    // 影线颜色：先全部阳线（涨色）后全部阴线（跌色）
    expect(propSets(ctx, 'strokeStyle')[0]).toBe(theme.up);
    expect(propSets(ctx, 'strokeStyle')[propSets(ctx, 'strokeStyle').length - 1]).toBe(theme.down);
  });

  it('spacing < 4 走细线模式：每像素列一次 moveTo/lineTo + 单次 stroke', () => {
    const bars = manyBars(230); // fitAll = 460/230 = 2，允许 spacing=2
    const { ctx, series, viewport, priceScale, geo } = fixture(bars, 2);
    expect(viewport.spacing).toBe(2);
    viewport.setFirstPublic(0); // bar0 落在 x=0，避开右缘贴齐导致的屏外偏移
    drawCandles(asCtx(ctx), series, 0, series.length - 1, viewport, priceScale, geo);

    // 230 根各自成列 → 230 次 stroke；无实体 fillRect
    expect(callsOf(ctx, 'stroke')).toHaveLength(230);
    expect(callsOf(ctx, 'fillRect')).toHaveLength(0);
    // 第一列：x = round(0*2) = 0 → px = 0.5；bar0 高 104 低 98
    expect(hasPair(ctx, 'moveTo', [0.5, priceScale.priceToY(104)], 'lineTo', [0.5, priceScale.priceToY(98)])).toBe(true);
  });

  it('to < from 直接返回，不产生任何绘制调用', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    drawCandles(asCtx(ctx), series, 5, 0, viewport, priceScale, geo);
    expect(ctx.calls).toHaveLength(0);
  });
});

// ---------- drawAxes ----------

describe('drawAxes', () => {
  it('drawPriceAxis：轴底色/轴线/右对齐刻度文本位置符合 TV 规格', () => {
    const { ctx, priceScale, geo } = fixture();
    drawPriceAxis(asCtx(ctx), priceScale, 2, geo);
    expect(hasCall(ctx, 'fillRect', [W, 0, 64, H])).toBe(true); // 轴背景
    expect(propSets(ctx, 'fillStyle')).toContain(theme.background);
    expect(hasPair(ctx, 'moveTo', [W + 0.5, 0], 'lineTo', [W + 0.5, H])).toBe(true);
    const tick = priceScale.ticks(6)[0];
    expect(hasCall(ctx, 'fillText', [priceScale.toLabel(tick, 2), W + 58, priceScale.priceToY(tick)])).toBe(true);
    expect(propSets(ctx, 'textAlign')).toContain('right');
    expect(propSets(ctx, 'font')).toContain(`11px ${TV_FONT}`);
  });

  it('drawPriceAxis compact：刻度走 formatCompact', () => {
    const { ctx, priceScale, geo } = fixture();
    drawPriceAxis(asCtx(ctx), priceScale, 2, geo, true);
    const tick = priceScale.ticks(6)[0];
    const compact = Math.abs(tick) >= 1e3 ? `${Number((tick / 1e3).toFixed(1))}K` : String(Number(tick.toFixed(2)));
    expect(hasCall(ctx, 'fillText', [compact, W + 58, priceScale.priceToY(tick)])).toBe(true);
  });

  it('drawTimeAxis：底栏 24px + 标签与垂直网格同一锚点，仅标注有 K 线处', () => {
    const { ctx, series, viewport, geo } = fixture();
    drawTimeAxis(asCtx(ctx), series, viewport, geo);
    expect(hasCall(ctx, 'fillRect', [0, H, W, 24])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [0, H + 0.5], 'lineTo', [W, H + 0.5])).toBe(true);
    // spacing=8 → step=10；first=-46.5 → 起点 -50；可见且 in [30,430] 的只有 bar0（x=372）
    expect(fillTexts(ctx)).toEqual(['09:30']);
    expect(hasCall(ctx, 'fillText', ['09:30', 372, H + 12])).toBe(true);
    expect(propSets(ctx, 'textAlign')).toContain('center');
  });

  it('drawGrid：横线用价格刻度，竖线按 step 倍数锚点对齐', () => {
    const { ctx, viewport, priceScale, geo } = fixture();
    drawGrid(asCtx(ctx), viewport, priceScale, geo);
    expect(propSets(ctx, 'strokeStyle')).toContain(theme.grid);
    const tick = priceScale.ticks(6).find((t) => {
      const y = Math.round(priceScale.priceToY(t)) + 0.5;
      return y >= 0 && y <= H;
    })!;
    expect(hasPair(ctx, 'moveTo', [0, Math.round(priceScale.priceToY(tick)) + 0.5], 'lineTo', [W, Math.round(priceScale.priceToY(tick)) + 0.5])).toBe(true);
    // step=10，startIdx=-50 → 首条可见竖线 i=-40，x=(−40+46.5)*8=52 → align=52.5
    expect(hasPair(ctx, 'moveTo', [52.5, 0], 'lineTo', [52.5, H])).toBe(true);
  });

  it('drawBorders：1px 内缩边框', () => {
    const { ctx, geo } = fixture();
    drawBorders(asCtx(ctx), geo);
    expect(hasCall(ctx, 'strokeRect', [0.5, 0.5, W - 1, H - 1])).toBe(true);
    expect(propSets(ctx, 'strokeStyle')).toContain(theme.border);
  });

  it('drawPaneLegend：指标名用传入色，数值紧随其后', () => {
    const { ctx } = fixture();
    drawPaneLegend(asCtx(ctx), 'VOL', '1.20K', theme.axisText);
    expect(hasCall(ctx, 'fillText', ['VOL', 8, 6])).toBe(true);
    // 名称宽 3*6=18 → 数值 x = 8+18+6 = 32
    expect(hasCall(ctx, 'fillText', ['1.20K', 32, 6])).toBe(true);
    expect(propSets(ctx, 'fillStyle')).toEqual([theme.axisText, theme.axisText]);
  });

  it('drawLastPrice：涨着涨色虚线 + 右轴徽章；越界不画', () => {
    const { ctx, priceScale, geo } = fixture();
    drawLastPrice(asCtx(ctx), priceScale, BARS[0], 100, 2, geo); // close 104 >= prevClose 100 → 涨
    const y = Math.round(priceScale.priceToY(104)) + 0.5;
    expect(hasCall(ctx, 'setLineDash', [[2, 2]])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [0, y], 'lineTo', [W, y])).toBe(true);
    expect(hasCall(ctx, 'setLineDash', [[]])).toBe(true);
    expect(propSets(ctx, 'fillStyle')).toContain(theme.up);
    expect(fillTexts(ctx)).toContain('104.00');
    const rr = callsOf(ctx, 'roundRect');
    expect(rr).toHaveLength(1);
    expect(rr[0][0]).toBe(W + 2);
    expect(rr[0][3]).toBe(18);
    expect(rr[0][4]).toBe(3);

    // 价格远离可视域 → 早退，零调用
    const far = new PriceScale();
    far.setSize(H);
    far.setRange(0, 1);
    const ctx2 = createMockCtx();
    drawLastPrice(asCtx(ctx2), far, BARS[0], 100, 2, geo);
    expect(ctx2.calls).toHaveLength(0);
  });

  it('formatTime：三档粒度（时:分 / 月-日 / 年-月）', () => {
    expect(formatTime(T0, 8)).toBe('09:30');
    expect(formatTime(T0, 120)).toBe('01-08');
    expect(formatTime(T0, 600)).toBe('2024-01');
  });
});

// ---------- drawCrosshair ----------

describe('drawCrosshair', () => {
  const legend = { symbol: 'BTC/USDT', interval: '1m', decimals: 2, exchange: 'Binance' };

  it('可见：水平虚线限面板内 + 垂直虚线吸附 bar 中心，轴标签齐全', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const ch = new Crosshair();
    ch.set(200, 150, 3, BARS[3].time, 100);
    drawCrosshair(asCtx(ctx), ch, viewport, priceScale, geo, legend);
    // snapX = indexToX(3) = 396 → 396.5
    expect(propSets(ctx, 'strokeStyle')).toContain(theme.crosshair);
    expect(hasCall(ctx, 'setLineDash', [[4, 4]])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [0, 150.5], 'lineTo', [W, 150.5])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [396.5, 0], 'lineTo', [396.5, H])).toBe(true);
    expect(hasCall(ctx, 'setLineDash', [[]])).toBe(true);
    // 价格标签：yToPrice(150) 的刻度文本
    expect(fillTexts(ctx)).toContain(priceScale.toLabel(priceScale.yToPrice(150), 2));
    // 时间标签：HH:MM
    expect(fillTexts(ctx)).toContain('09:33');
  });

  it('不可见：零调用', () => {
    const { ctx, viewport, priceScale, geo } = fixture();
    const ch = new Crosshair();
    drawCrosshair(asCtx(ctx), ch, viewport, priceScale, geo, legend);
    expect(ctx.calls).toHaveLength(0);
  });

  it('副图面板：垂直虚线限面板区间，价格按面板相对坐标换算', () => {
    const { ctx, viewport, priceScale, geo } = fixture();
    const ch = new Crosshair();
    ch.set(200, 150, 3, BARS[3].time, 100);
    drawCrosshair(asCtx(ctx), ch, viewport, priceScale, geo, legend, 100, 200);
    expect(hasPair(ctx, 'moveTo', [396.5, 100], 'lineTo', [396.5, 300])).toBe(true);
    // 面板内 y=150 → 世界坐标 y-paneY=50 → 与主图直接传 50 的标签一致
    const ctx2 = createMockCtx();
    const ch2 = new Crosshair();
    ch2.set(200, 50, 3, BARS[3].time, 100);
    drawCrosshair(asCtx(ctx2), ch2, viewport, priceScale, geo, legend);
    expect(fillTexts(ctx)).toEqual(fillTexts(ctx2));
  });
});

// ---------- drawCrosshair.drawLegendBlock ----------

describe('drawLegendBlock', () => {
  const legend = { symbol: 'BTC/USDT', interval: '1m', decimals: 2, exchange: 'Binance' };

  it('商品行 + OHLC + 涨跌 + 成交量，按 TV 字段格式', () => {
    const { ctx, geo } = fixture();
    drawLegendBlock(asCtx(ctx), BARS[0], legend, undefined, DEFAULT_LEGEND_OPTIONS, null, undefined, undefined, geo);
    const texts = fillTexts(ctx);
    expect(texts).toContain('BTC/USDT');
    expect(texts).toContain(' · 1m · Binance');
    expect(texts).toContain('开=');
    expect(texts).toContain('100.00');
    expect(texts).toContain('高=');
    expect(texts).toContain('106.00');
    expect(texts).toContain('低=');
    expect(texts).toContain('98.00');
    expect(texts).toContain('收=');
    expect(texts).toContain('104.00');
    expect(texts).toContain('+4.00 (+4.00%)');
    expect(texts).toContain('量');
    expect(texts).toContain('1.20K');
    // 阳线 → OHLC 用涨色
    expect(propSets(ctx, 'fillStyle')).toContain(theme.up);
  });

  it('指标行：精度优先 toFixed，超出高度折叠计数', () => {
    const { ctx, geo } = fixture();
    const rows = [
      { uid: 'u1', name: 'MA', precision: 2, values: [{ label: 'MA', value: 123.456 }] },
      { uid: 'u2', name: 'VOL', values: [{ label: 'VOL', value: 123.456 }] },
    ];
    const info = { collapsed: -1 };
    // 矮画布：iy=28 起始，28+16 > chartH-4 → 全部折叠
    drawLegendBlock(asCtx(ctx), BARS[0], legend, rows, DEFAULT_LEGEND_OPTIONS, null, undefined, info, { chartW: W, chartH: 40 });
    expect(info.collapsed).toBe(2);
    // 正常高度：u1 按 precision=2 → 123.46；u2 无精度 → formatIndicatorValue(123.456) = 123.456
    const ctx2 = createMockCtx();
    drawLegendBlock(asCtx(ctx2), BARS[0], legend, rows, DEFAULT_LEGEND_OPTIONS, null, undefined, undefined, geo);
    expect(fillTexts(ctx2)).toContain('123.46');
    expect(fillTexts(ctx2)).toContain('123.456');
  });

  it('图例开关：showOHLC=false 不画 OHLC 字段', () => {
    const { ctx, geo } = fixture();
    drawLegendBlock(asCtx(ctx), BARS[0], legend, undefined, { ...DEFAULT_LEGEND_OPTIONS, showOHLC: false, showChange: false, showVolume: false }, null, undefined, undefined, geo);
    const texts = fillTexts(ctx);
    expect(texts).toContain('BTC/USDT');
    expect(texts).not.toContain('开=');
    expect(texts).not.toContain('量');
  });
});

// ---------- drawDrawings ----------

describe('drawDrawings', () => {
  it('水平线：整幅横线 + 右端价格标签，虚线样式生效', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = drawing({ type: 'hline', points: [{ time: BARS[3].time, price: 104 }], style: { color: '#2962ff', lineWidth: 2, dash: true } });
    drawDrawings(asCtx(ctx), [d], null, dctx(series, viewport, priceScale, geo), 2);
    const yPix = priceScale.priceToY(104);
    const y = Math.round(yPix) + 0.5;
    expect(propSets(ctx, 'strokeStyle')).toContain('#2962ff');
    expect(propSets(ctx, 'lineWidth')).toContain(2);
    expect(hasCall(ctx, 'setLineDash', [[6, 4]])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [0, y], 'lineTo', [W, y])).toBe(true);
    // 标签：10px，右对齐贴 chartW-4
    expect(hasCall(ctx, 'fillText', ['104.00', W - 4, yPix])).toBe(true);
    expect(propSets(ctx, 'font')).toContain(`10px ${TV_FONT}`);
    expect(propSets(ctx, 'textAlign')).toContain('right');
  });

  it('趋势线：两点像素间连线', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = drawing({
      type: 'trendline',
      points: [
        { time: BARS[0].time, price: 100 },
        { time: BARS[3].time, price: 104 },
      ],
    });
    drawDrawings(asCtx(ctx), [d], null, dctx(series, viewport, priceScale, geo), 2);
    const p0 = { x: viewport.indexToX(0), y: priceScale.priceToY(100) };
    const p1 = { x: viewport.indexToX(3), y: priceScale.priceToY(104) };
    expect(hasPair(ctx, 'moveTo', [p0.x, p0.y], 'lineTo', [p1.x, p1.y])).toBe(true);
  });

  it('斐波那契：7 档水平线 + 百分比标签', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = drawing({
      type: 'fib',
      points: [
        { time: BARS[0].time, price: 100 },
        { time: BARS[3].time, price: 110 },
      ],
    });
    drawDrawings(asCtx(ctx), [d], null, dctx(series, viewport, priceScale, geo), 2);
    const texts = fillTexts(ctx);
    expect(texts).toContain('0.0% 100.00');
    expect(texts).toContain('23.6% 102.36');
    expect(texts).toContain('50.0% 105.00');
    expect(texts).toContain('100.0% 110.00');
  });

  it('选中画线：绘制圆形手柄（白底 + 画线色描边）', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = drawing({ type: 'hline', points: [{ time: BARS[3].time, price: 104 }] });
    drawDrawings(asCtx(ctx), [d], d.id, dctx(series, viewport, priceScale, geo), 2);
    const x = viewport.indexToX(3);
    const y = priceScale.priceToY(104);
    expect(hasCall(ctx, 'arc', [x, y, 4, 0, Math.PI * 2])).toBe(true);
    expect(propSets(ctx, 'fillStyle')).toContain('#ffffff');
  });

  it('不可见画线被跳过', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = drawing({ type: 'hline', points: [{ time: BARS[3].time, price: 104 }], visible: false });
    drawDrawings(asCtx(ctx), [d], null, dctx(series, viewport, priceScale, geo), 2);
    expect(callsOf(ctx, 'moveTo')).toHaveLength(0);
  });

  it('hitTestDrawing：手柄优先（7px），hline 线体 ±5px', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const dc = dctx(series, viewport, priceScale, geo);
    const d = drawing({ type: 'hline', points: [{ time: BARS[3].time, price: 104 }] });
    const px = viewport.indexToX(3);
    const py = priceScale.priceToY(104);
    expect(hitTestDrawing(d, px + 10, py + 4, dc)).toEqual({ part: 'body' });
    expect(hitTestDrawing(d, px + 10, py + 6, dc)).toBeNull();
    expect(hitTestDrawing(d, px + 4, py + 4, dc)).toEqual({ part: 'handle', index: 0 });
  });

  it('pixelToPoint：off 保留小数时间精度；strong 磁吸吸附 OHLC', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const dc = dctx(series, viewport, priceScale, geo);
    // x 对应 index 3.5：xToIndex(372+8+4)=xToIndex(384) = 384/8 + (-46.5) = 1.5?? → 直接选 index 3 与 4 之间
    const x = viewport.indexToX(3.5); // 3.5 → (3.5+46.5)*8 = 400
    const y = priceScale.priceToY(104);
    const off = pixelToPoint(x, y, dc, 'off');
    const iv = BARS[1].time - BARS[0].time;
    expect(off.time).toBeCloseTo(BARS[3].time + 0.5 * iv, 6);
    const snapped = pixelToPoint(x, y, dc, 'strong');
    // roundIdx=4 → BARS[4] 的 OHLC = 100/107/97/105，吸附后 price 必为其中之一
    expect([100, 107, 97, 105]).toContain(snapped.price);
  });
});

// ---------- drawTrading ----------

describe('drawTrading', () => {
  const visual: TradeVisual = {
    orders: [{ id: 'o1', side: 'buy', type: 'limit', qty: 2, price: 104 }],
    position: { side: 'long', qty: 2, avgPrice: 100, takeProfit: 110, stopLoss: 95, pnl: 8 },
    entries: [{ time: BARS[0].time, price: 100, side: 'buy', kind: 'entry' }],
    exits: [],
  };

  it('挂单线：限价蓝色虚线 + 右端标签（数量/类型/价格/撤单）', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    drawTrading(asCtx(ctx), visual, priceScale, geo, 2, series, viewport);
    const y = Math.round(priceScale.priceToY(104)) + 0.5;
    expect(propSets(ctx, 'strokeStyle')).toContain('#2962ff');
    expect(hasCall(ctx, 'setLineDash', [[2, 3]])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [0, y], 'lineTo', [W, y])).toBe(true);
    const texts = fillTexts(ctx);
    expect(texts).toContain('2 限价 104.00');
    expect(texts).toContain('×');
  });

  it('持仓线：多单实线 + 止盈/止损虚线 + 详情块标签', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    drawTrading(asCtx(ctx), visual, priceScale, geo, 2, series, viewport);
    const texts = fillTexts(ctx);
    expect(texts).toContain('止盈 110.00');
    expect(texts).toContain('止损 95.00');
    expect(texts).toContain('多 2 @100.00 · +8.00');
    expect(propSets(ctx, 'strokeStyle')).toContain('#26a69a');
    expect(propSets(ctx, 'strokeStyle')).toContain('#ef5350');
  });

  it('K 线进出场标记：买入圆点 + 朝上箭头', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    drawTrading(asCtx(ctx), visual, priceScale, geo, 2, series, viewport);
    const x = viewport.indexToX(0);
    const y = priceScale.priceToY(100);
    expect(hasCall(ctx, 'arc', [x, y, 2.5, 0, Math.PI * 2])).toBe(true);
    // 买入箭头在点下方、尖端朝上
    expect(hasCall(ctx, 'moveTo', [x, y + 2])).toBe(true);
    expect(hasCall(ctx, 'lineTo', [x - 3.5, y + 9])).toBe(true);
    expect(hasCall(ctx, 'lineTo', [x + 3.5, y + 9])).toBe(true);
    expect(propSets(ctx, 'fillStyle')).toContain('#26a69a');
  });

  it('hitTestTrading：线体拖动 / 右端撤单 / 持仓块 / TP-SL 分区', () => {
    const { priceScale, geo } = fixture();
    const yOrder = priceScale.priceToY(104);
    expect(hitTestTrading(visual, 200, yOrder + 4, priceScale, geo)).toEqual({ kind: 'order', id: 'o1' });
    expect(hitTestTrading(visual, W - 20, yOrder + 4, priceScale, geo)).toEqual({ kind: 'order-cancel', id: 'o1' });
    const yPos = priceScale.priceToY(100);
    expect(hitTestTrading(visual, W - 60, yPos + 4, priceScale, geo)).toEqual({ kind: 'position' });
    expect(hitTestTrading(visual, W - 16, yPos + 4, priceScale, geo)).toEqual({ kind: 'position-close' });
    expect(hitTestTrading(visual, 200, priceScale.priceToY(110) + 4, priceScale, geo)).toEqual({ kind: 'tp' });
    expect(hitTestTrading(visual, 200, priceScale.priceToY(95) + 4, priceScale, geo)).toEqual({ kind: 'sl' });
    expect(hitTestTrading(visual, 200, priceScale.priceToY(50), priceScale, geo)).toBeNull();
  });
});
