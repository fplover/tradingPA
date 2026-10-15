import { describe, expect, it } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import type { Bar } from '@/types/market';
import { drawPriceAxis, drawTimeAxis } from '@/engine/renderer/drawAxes';
import { AXIS_HEIGHT, AXIS_WIDTH } from '@/engine/renderer/chartPanes';
import { asCtx, callsOf, createMockCtx, type MockCtx } from './helpers/mock-ctx';

/**
 * 轴几何单一来源（三期-B5）。
 * 这里刻意不写死 64 / 58 / 6 / 24 / 12，而把断言写成「与被钉常量的关系」：
 * 改常量时源码与断言同移（不报红，那是有意的布局变更，由黄金截图面把关）；
 * 一旦某处退回裸字面量，两侧即分裂并报红——这正是本批要钉的性质。
 * 其余测试文件里保留的字面量断言（如 render-primitives 的 W + 58）是当日像素快照，两种角色不互斥。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const W = 460;
const H = 300;

const BARS: Bar[] = [
  { time: T0, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: T0 + IV, open: 104, high: 108, low: 103, close: 101, volume: 900 },
  { time: T0 + 2 * IV, open: 101, high: 105, low: 100, close: 103, volume: 1500 },
  { time: T0 + 3 * IV, open: 103, high: 104, low: 99, close: 100, volume: 700 },
  { time: T0 + 4 * IV, open: 100, high: 107, low: 97, close: 105, volume: 2000 },
  { time: T0 + 5 * IV, open: 105, high: 106, low: 102, close: 102, volume: 800 },
];

function fixture() {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(Math.min(...BARS.map((b) => b.low)), Math.max(...BARS.map((b) => b.high)));
  return { ctx: createMockCtx(), series, viewport, priceScale, geo: { chartW: W, chartH: H } };
}

/** 价格轴文字 x 相对所在轴条左缘的偏移（所有刻度同一 x，故应只有一个值） */
function priceAxisTextOffset(ctx: MockCtx, pos: 'left' | 'right'): number {
  const axisX = pos === 'left' ? -AXIS_WIDTH : W;
  const offsets = new Set(callsOf(ctx, 'fillText').map((a) => Number(a[1]) - axisX));
  expect(offsets.size).toBe(1);
  return [...offsets][0];
}

describe('价格轴文字位置：由 AXIS_WIDTH 派生，左右两枝同一条约束', () => {
  it('左枝呼吸 + 右枝内缩 = 轴宽（右枝若退回裸 58，改轴宽即两侧分裂）', () => {
    const right = fixture();
    drawPriceAxis(asCtx(right.ctx), right.priceScale, 2, right.geo, false, 'right');
    const left = fixture();
    drawPriceAxis(asCtx(left.ctx), left.priceScale, 2, left.geo, false, 'left');
    expect(priceAxisTextOffset(left.ctx, 'left') + priceAxisTextOffset(right.ctx, 'right')).toBe(AXIS_WIDTH);
  });

  it('轴条填充宽 = AXIS_WIDTH（右枝落在图表区右缘，左枝落在其外侧一个轴宽）', () => {
    const { ctx, priceScale, geo } = fixture();
    drawPriceAxis(asCtx(ctx), priceScale, 2, geo, false, 'right');
    expect(callsOf(ctx, 'fillRect').some((a) => Number(a[0]) === W && Number(a[2]) === AXIS_WIDTH)).toBe(true);
    const left = fixture();
    drawPriceAxis(asCtx(left.ctx), left.priceScale, 2, left.geo, false, 'left');
    expect(callsOf(left.ctx, 'fillRect').some((a) => Number(a[0]) === -AXIS_WIDTH && Number(a[2]) === AXIS_WIDTH)).toBe(
      true,
    );
  });
});

describe('时间轴条几何：条高与标签基线都由 AXIS_HEIGHT 派生', () => {
  it('条高 = AXIS_HEIGHT，标签基线在条内半高处（源码退回裸 24 / 12 时两侧分裂）', () => {
    const { ctx, series, viewport, geo } = fixture();
    drawTimeAxis(asCtx(ctx), series, viewport, geo);
    const strips = callsOf(ctx, 'fillRect').filter((a) => Number(a[1]) === geo.chartH);
    expect(strips).toHaveLength(1);
    expect(Number(strips[0][3])).toBe(AXIS_HEIGHT);
    const labels = callsOf(ctx, 'fillText');
    expect(labels.length).toBeGreaterThan(0);
    const baselines = new Set(labels.map((a) => Number(a[2]) - geo.chartH));
    expect(baselines.size).toBe(1);
    expect([...baselines][0]).toBe(AXIS_HEIGHT / 2);
  });
});
