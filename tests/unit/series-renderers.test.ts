import { describe, expect, it } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { theme } from '@/engine/theme';
import type { Bar } from '@/types/market';
import { drawCandles } from '@/engine/renderer/drawSeries';
import {
  drawOhlc,
  drawHighLow,
  drawColumns,
  drawStepLine,
  drawLineMarkers,
  drawHlcArea,
  drawVolumeCandles,
} from '@/engine/renderer/seriesRenderers';
import { createMockCtx, callsOf, propSets, asCtx, type MockCtx } from './helpers/mock-ctx';

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

/** 确定性夹具：含 1 根平盘（open === close）与递增/递减成交量 */
const BARS: Bar[] = [
  { time: T0, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: T0 + IV, open: 104, high: 108, low: 103, close: 101, volume: 900 },
  { time: T0 + 2 * IV, open: 101, high: 105, low: 100, close: 103, volume: 1500 },
  { time: T0 + 3 * IV, open: 103, high: 104, low: 99, close: 100, volume: 700 },
  { time: T0 + 4 * IV, open: 100, high: 107, low: 97, close: 105, volume: 2000 },
  { time: T0 + 5 * IV, open: 105, high: 106, low: 102, close: 102, volume: 800 },
  { time: T0 + 6 * IV, open: 103, high: 105, low: 101, close: 103, volume: 1000 }, // 平盘
];

const W = 460;
const H = 300;
const FROM = 0;
const TO = 6;

function fixture(bars: Bar[] = BARS, spacing = 8) {
  const series = new BarSeries();
  series.replace(bars);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(spacing);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(Math.min(...bars.map((b) => b.low)), Math.max(...bars.map((b) => b.high)));
  const geo = { chartW: W, chartH: H };
  const ctx = createMockCtx();
  return { ctx, series, viewport, priceScale, geo };
}

function run(
  fn: (
    ctx: CanvasRenderingContext2D,
    s: BarSeries,
    f: number,
    t: number,
    v: Viewport,
    p: PriceScale,
    g: { chartW: number; chartH: number },
  ) => void,
  f = fixture(),
) {
  fn(asCtx(f.ctx), f.series, FROM, TO, f.viewport, f.priceScale, f.geo);
  return f.ctx;
}

/** 提取 lineTo 调用的坐标序列 */
function lineToPoints(ctx: MockCtx): Array<[number, number]> {
  return callsOf(ctx, 'lineTo').map((a) => [a[0] as number, a[1] as number]);
}

describe('drawColumns 柱状图', () => {
  it('每 bar 一根 fillRect 实体柱，高度=|收盘-开盘|，平盘保留 1px', () => {
    const ctx = run(drawColumns);
    const rects = callsOf(ctx, 'fillRect');
    expect(rects.length).toBe(BARS.length);
    // 每根柱高度 > 0（平盘柱 height 被钳到 ≥1）
    for (const r of rects) {
      expect(r[3] as number).toBeGreaterThanOrEqual(1);
    }
    // 涨跌着色：up 用 theme.up，down 用 theme.down
    const fills = propSets(ctx, 'fillStyle');
    expect(fills).toContain(theme.up);
    expect(fills).toContain(theme.down);
  });

  it('柱宽随间距收敛且不超过 30px', () => {
    const f = fixture(BARS, 100);
    drawColumns(asCtx(f.ctx), f.series, FROM, TO, f.viewport, f.priceScale, f.geo);
    for (const r of callsOf(f.ctx, 'fillRect')) {
      expect(r[2] as number).toBeLessThanOrEqual(30);
      expect(r[2] as number).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('drawHighLow 高低图', () => {
  it('与竹线图逐调用同构（TV 几何一致：高低竖线 + 左开右收 tick）', () => {
    const a = run(drawOhlc);
    const b = run(drawHighLow);
    expect(JSON.stringify(b.calls)).toBe(JSON.stringify(a.calls));
  });
});

describe('drawStepLine 阶梯线', () => {
  it('每段先水平后垂直：lineTo 成对出现且横段 y 不变、竖段 x 不变', () => {
    const ctx = run(drawStepLine);
    const pts = lineToPoints(ctx);
    // 7 个点 → 6 段 × 2 次 lineTo
    expect(pts.length).toBe((BARS.length - 1) * 2);
    const xs = BARS.map((_, i) => i);
    void xs;
    // 第 j 段：lineTo[2j]=(x_j, y_{j-1}) 水平；lineTo[2j+1]=(x_j, y_j) 垂直
    for (let j = 0; j < BARS.length - 1; j++) {
      const [hx, hy] = pts[2 * j];
      const [vx, vy] = pts[2 * j + 1];
      expect(hx).toBe(vx); // 水平段终点与垂直段起点同 x
      expect(hy).not.toBe(vy); // 垂直段发生跳变（除非价格持平，本夹具无）
    }
  });

  it('node 环境（无 DOM）线色回落主题令牌，不抛异常', () => {
    const ctx = run(drawStepLine);
    expect(propSets(ctx, 'strokeStyle')).toContain(theme.up);
  });
});

describe('drawLineMarkers 带标记线形', () => {
  it('折线走 drawLine 同构几何 + 每 bar 一个圆标记', () => {
    const ctx = run(drawLineMarkers);
    // 折线：7 点 → 6 次 lineTo
    expect(lineToPoints(ctx).length).toBe(BARS.length - 1);
    // 圆标记：每 bar 一次 arc
    const arcs = callsOf(ctx, 'arc');
    expect(arcs.length).toBe(BARS.length);
    for (const a of arcs) {
      const r = a[2] as number;
      expect(r).toBeGreaterThanOrEqual(1.5);
      expect(r).toBeLessThanOrEqual(3.5);
    }
    expect(propSets(ctx, 'fillStyle')).toContain(theme.up);
  });

  it('过密（间距 < 3px）退化为纯线形：无 arc', () => {
    // 300 根使 fitAll≈1.53px，spacing 2 才不被钳制（视口最小间距 = max(minBarSpacing, min(fitAll, 8))）
    const dense: Bar[] = [];
    for (let i = 0; i < 300; i++) {
      dense.push({ time: T0 + i * IV, open: 100, high: 102, low: 98, close: 101, volume: 500 });
    }
    const f = fixture(dense, 2);
    expect(f.viewport.spacing).toBeLessThan(3);
    drawLineMarkers(asCtx(f.ctx), f.series, 0, 299, f.viewport, f.priceScale, f.geo);
    expect(callsOf(f.ctx, 'arc').length).toBe(0);
    // 折线本身仍绘制（视口外 bar 被 drawLine 的 ±10px 容差跳过，故少于 299）
    const lt = lineToPoints(f.ctx).length;
    expect(lt).toBeGreaterThan(100);
    expect(lt).toBeLessThanOrEqual(300 - 1);
  });
});

describe('drawHlcArea HLC 面积', () => {
  it('折线取 HLC 中值 (h+l+c)/3，并做渐变填充', () => {
    const f = fixture();
    const expectedY0 = f.priceScale.priceToY((106 + 98 + 104) / 3);
    drawHlcArea(asCtx(f.ctx), f.series, FROM, TO, f.viewport, f.priceScale, f.geo);
    const pts = lineToPoints(f.ctx);
    // 填充路径 7 点 → 6 次 lineTo + 2 次到底边；重描折线再 6 次；合计 14
    expect(pts.length).toBe((BARS.length - 1) * 2 + 2);
    // 第二个点（折线第 2 点）之前第一个 moveTo 在 (x0, y0)
    const moves = callsOf(f.ctx, 'moveTo');
    expect(moves.length).toBe(2); // 填充路径 + 重描折线各一次起点
    expect(moves[0][1]).toBeCloseTo(expectedY0, 9);
    // 渐变填充发生
    expect(callsOf(f.ctx, 'fill').length).toBe(1);
    const strokes = propSets(f.ctx, 'strokeStyle');
    expect(strokes).toContain(theme.up);
  });
});

describe('drawVolumeCandles 成交量蜡烛', () => {
  it('柱宽按可见窗口成交量占比编码：最大成交量最宽、最小最窄', () => {
    const ctx = run(drawVolumeCandles);
    // 每 bar：1 次影线 stroke + 1 次实体（fillRect；up 另加 strokeRect）
    const strokes = callsOf(ctx, 'stroke');
    expect(strokes.length).toBe(BARS.length); // 影线逐根描边
    const fills = callsOf(ctx, 'fillRect');
    expect(fills.length).toBe(BARS.length); // 实体逐根填充
    // 实体宽度（fillRect 第 3 参）与成交量正相关
    const widths = fills.map((r) => r[2] as number);
    const vols = BARS.map((b) => b.volume);
    const maxVol = Math.max(...vols);
    const minVol = Math.min(...vols);
    expect(widths[vols.indexOf(maxVol)]).toBeGreaterThan(widths[vols.indexOf(minVol)]);
    // 单调性：按成交量排序后宽度非降
    const pairs = vols.map((v, i) => [v, widths[i]] as [number, number]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i][1]).toBeGreaterThanOrEqual(pairs[i - 1][1] - 1e-9);
    }
  });

  it('无成交量数据时逐调用降级为 drawCandles', () => {
    const zeroBars = BARS.map((b) => ({ ...b, volume: 0 }));
    const f = fixture(zeroBars);
    drawVolumeCandles(asCtx(f.ctx), f.series, FROM, TO, f.viewport, f.priceScale, f.geo);
    const g = fixture(zeroBars);
    drawCandles(asCtx(g.ctx), g.series, FROM, TO, g.viewport, g.priceScale, g.geo);
    expect(JSON.stringify(f.ctx.calls)).toBe(JSON.stringify(g.ctx.calls));
  });

  it('spacing < 4 的缩窄态同样走降级/收窄，不抛异常', () => {
    const f = fixture(BARS, 2);
    expect(() => drawVolumeCandles(asCtx(f.ctx), f.series, FROM, TO, f.viewport, f.priceScale, f.geo)).not.toThrow();
    expect(callsOf(f.ctx, 'fillRect').length).toBe(BARS.length);
  });
});
