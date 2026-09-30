import { describe, expect, it } from 'vitest';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { theme } from '@/engine/theme';
import type { Bar } from '@/types/market';
import { alignByTime, buildCompareLegend } from '@/features/market/useCompareSeries';
import { compareDomain, drawCompareOverlay, toPercent } from '@/engine/renderer/drawCompare';
import { drawLegendBlock } from '@/engine/renderer/drawCrosshair';
import type { CompareLegendInfo, LegendStudyValues, StudyLegendRect } from '@/engine/renderer/legendTypes';
import { createMockCtx, asCtx, callsOf, fillTexts, hasCall, hasPair, propSets } from './helpers/mock-ctx';

/** Compare 叠加（P2-D①，AC-D1）：对齐数学金样 / 图例数据组装 / 归一化渲染 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

function bar(time: number, close: number): Bar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 100 };
}

const MAIN: Bar[] = [0, 1, 2, 3, 4].map((i) => bar(T0 + i * IV, 100 + i));
const COMPARE: Bar[] = [
  bar(T0, 50),
  bar(T0 + IV, 55),
  bar(T0 + 2 * IV, 52.5),
  // T0+3IV 缺失（休市/不同日历）→ 对齐断线
  bar(T0 + 4 * IV, 60),
];

// ---------- alignByTime：按 time 对齐 ----------

describe('alignByTime', () => {
  it('golden：主 series 每根取同时间戳对比收盘，长度与逐位顺序一致', () => {
    expect(alignByTime(MAIN, COMPARE)).toEqual([50, 55, 52.5, null, 60]);
  });

  it('对比序列中主序列没有的时间戳被忽略（不插入不对齐）', () => {
    const extra = [...COMPARE, bar(T0 + 10 * IV, 999)];
    expect(alignByTime(MAIN, extra)).toEqual([50, 55, 52.5, null, 60]);
  });

  it('主序列为空 / 对比为空 → 空数组或全 null', () => {
    expect(alignByTime([], COMPARE)).toEqual([]);
    expect(alignByTime(MAIN, [])).toEqual([null, null, null, null, null]);
  });
});

// ---------- buildCompareLegend：图例第二行数据组装 ----------

describe('buildCompareLegend', () => {
  it('基准 = 首个有效收盘，末点读数 = 最后有效值相对基准涨跌幅', () => {
    const info = buildCompareLegend('ETH/USDT', [50, 55, 52.5, null, 60]);
    expect(info?.symbol).toBe('ETH/USDT');
    expect(info?.base).toBe(50);
    expect(info?.lastPct).toBeCloseTo(20, 10);
    expect(info?.aligned).toEqual([50, 55, 52.5, null, 60]);
  });

  it('跳过非法值（null / 0 / 负 / 非有限），基准取首个有效值', () => {
    const info = buildCompareLegend('X', [null, 0, -3, Number.NaN, 200, 220]);
    expect(info?.base).toBe(200);
    expect(info?.lastPct).toBeCloseTo(10, 10);
  });

  it('无任何有效值 → null（调用方据此清空对比，不走渲染）', () => {
    expect(buildCompareLegend('X', [])).toBeNull();
    expect(buildCompareLegend('X', [null, 0, -1])).toBeNull();
  });
});

// ---------- 归一化数学 ----------

describe('toPercent / compareDomain', () => {
  it('toPercent：相对基准的百分比；基准非法回落 0', () => {
    expect(toPercent(110, 100)).toBeCloseTo(10, 12);
    expect(toPercent(90, 100)).toBeCloseTo(-10, 12);
    expect(toPercent(100, 0)).toBe(0);
  });

  it('compareDomain：可见窗口 min/max + 8% 留白', () => {
    expect(compareDomain([0, 10, 30])).toEqual({ min: -2.4, max: 32.4 });
  });

  it('compareDomain：全平（span 0）回落 1 个百分点兜底跨度（留白后域宽 0.16）', () => {
    const d = compareDomain([5, 5]);
    expect(d.max - d.min).toBeCloseTo(0.16, 12);
  });
});

// ---------- drawCompareOverlay ----------

const W = 460;
const H = 300;

function overlayFixture() {
  const viewport = new Viewport(W);
  viewport.setBarCount(MAIN.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime(); // first = 6 - 460/8 + 5 = -46.5
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(90, 140);
  const geo = { chartW: W, chartH: H };
  const ctx = createMockCtx();
  return { ctx, viewport, priceScale, geo };
}

const INFO: CompareLegendInfo = { symbol: 'ETH/USDT', base: 50, lastPct: 20, aligned: [50, 55, 52.5, null, 60] };

/** 非 percent 副坐标：可见 pcts = [0,10,5,20]，域 = [0,20] ± 8% 留白 → y = H*(1-(pct-min)/(max-min)) */
function secondaryY(pct: number): number {
  const { min, max } = compareDomain([0, 10, 5, 20]);
  return H * (1 - (pct - min) / (max - min));
}

describe('drawCompareOverlay', () => {
  it('无对比序列 → 零开销（一次绘制调用都不发出）', () => {
    const { ctx, viewport, priceScale, geo } = overlayFixture();
    drawCompareOverlay(asCtx(ctx), null, 0, 4, viewport, priceScale, geo, false, null);
    drawCompareOverlay(asCtx(ctx), undefined, 0, 4, viewport, priceScale, geo, true, 100);
    expect(ctx.calls).toHaveLength(0);
  });

  it('对齐数据为空 / 全断线 / to<from → 零开销', () => {
    const { ctx, viewport, priceScale, geo } = overlayFixture();
    drawCompareOverlay(asCtx(ctx), { symbol: 'X', base: 50, lastPct: 0, aligned: [] }, 0, 4, viewport, priceScale, geo, false, null);
    drawCompareOverlay(asCtx(ctx), { symbol: 'X', base: 50, lastPct: 0, aligned: [null, null] }, 0, 1, viewport, priceScale, geo, false, null);
    drawCompareOverlay(asCtx(ctx), INFO, 4, 0, viewport, priceScale, geo, false, null);
    expect(ctx.calls).toHaveLength(0);
  });

  it('非 percent：副坐标独立线性域，断线处抬笔（两段 path）', () => {
    const { ctx, viewport, priceScale, geo } = overlayFixture();
    drawCompareOverlay(asCtx(ctx), INFO, 0, 4, viewport, priceScale, geo, false, null);

    // 5 根贴右：first = 5 - 460/8 + 5 = -47.5，x 直接取视口换算（不写死魔数）
    const X = (i: number) => viewport.indexToX(i);
    expect(hasPair(ctx, 'moveTo', [X(0), secondaryY(0)], 'lineTo', [X(1), secondaryY(10)])).toBe(true);
    expect(hasPair(ctx, 'lineTo', [X(1), secondaryY(10)], 'lineTo', [X(2), secondaryY(5)])).toBe(true);
    expect(hasPair(ctx, 'lineTo', [X(2), secondaryY(5)], 'moveTo', [X(4), secondaryY(20)])).toBe(true);
    // 末点圆点 + 对比橙
    expect(hasCall(ctx, 'arc', [X(4), secondaryY(20), 2.5, 0, Math.PI * 2])).toBe(true);
    expect(propSets(ctx, 'strokeStyle')).toContain(theme.warn);
  });

  it('percent 模式：与主序列同一坐标系（pct 折算主序列基准价后过主 priceScale）', () => {
    const { ctx, viewport, priceScale, geo } = overlayFixture();
    drawCompareOverlay(asCtx(ctx), INFO, 0, 4, viewport, priceScale, geo, true, 100);

    // pct 0 → priceToY(100)；pct 10 → priceToY(110)；pct 20 → priceToY(120)
    const X = (i: number) => viewport.indexToX(i);
    expect(hasPair(ctx, 'moveTo', [X(0), priceScale.priceToY(100)], 'lineTo', [X(1), priceScale.priceToY(110)])).toBe(true);
    expect(hasPair(ctx, 'lineTo', [X(2), priceScale.priceToY(105)], 'moveTo', [X(4), priceScale.priceToY(120)])).toBe(true);
  });

  it('percent 模式但主基准缺失 → 回落副坐标（不崩不错位）', () => {
    const { ctx, viewport, priceScale, geo } = overlayFixture();
    drawCompareOverlay(asCtx(ctx), INFO, 0, 4, viewport, priceScale, geo, true, null);
    const X = (i: number) => viewport.indexToX(i);
    expect(hasPair(ctx, 'moveTo', [X(0), secondaryY(0)], 'lineTo', [X(1), secondaryY(10)])).toBe(true);
  });

  it('裁剪到图表区（save/rect/clip/restore 包裹）', () => {
    const { ctx, viewport, priceScale, geo } = overlayFixture();
    drawCompareOverlay(asCtx(ctx), INFO, 0, 4, viewport, priceScale, geo, false, null);
    expect(ctx.calls[0].m).toBe('save');
    expect(ctx.calls[ctx.calls.length - 1].m).toBe('restore');
    expect(callsOf(ctx, 'clip')).toHaveLength(1);
  });
});

// ---------- 图例第二行 ----------

describe('drawLegendBlock 对比第二行', () => {
  const bar1 = MAIN[1]; // open=close=101 → 涨跌 0
  const studies: LegendStudyValues[] = [{ uid: 'u1', name: 'MA', precision: 2, values: [{ label: 'MA', value: 101 }] }];
  const geo = { chartW: W, chartH: H };
  const base = { symbol: 'BTC/USDT', interval: '1m', decimals: 2, marketOpen: undefined };

  it('有 compare：第二行渲染符号 + 末点涨跌幅，指标行下移到 y=44', () => {
    const ctx = createMockCtx();
    const rects: StudyLegendRect[] = [];
    drawLegendBlock(
      asCtx(ctx),
      bar1,
      { ...base, compare: { symbol: 'ETH/USDT', base: 50, lastPct: 20, aligned: [] } },
      studies,
      undefined,
      null,
      rects,
      undefined,
      geo,
      'candles',
    );
    const texts = fillTexts(ctx);
    expect(texts).toContain('ETH/USDT');
    expect(texts).toContain('+20.00%');
    expect(rects).toHaveLength(1);
    expect(rects[0].y).toBe(44);
  });

  it('负涨跌幅显负号', () => {
    const ctx = createMockCtx();
    drawLegendBlock(
      asCtx(ctx),
      bar1,
      { ...base, compare: { symbol: 'ETH/USDT', base: 50, lastPct: -3.5, aligned: [] } },
      [],
      undefined,
      null,
      undefined,
      undefined,
      geo,
      'candles',
    );
    expect(fillTexts(ctx)).toContain('-3.50%');
  });

  it('无 compare：不渲染第二行，指标行仍在 y=28', () => {
    const ctx = createMockCtx();
    const rects: StudyLegendRect[] = [];
    drawLegendBlock(asCtx(ctx), bar1, { ...base }, studies, undefined, null, rects, undefined, geo, 'candles');
    expect(fillTexts(ctx)).not.toContain('ETH/USDT');
    expect(rects).toHaveLength(1);
    expect(rects[0].y).toBe(28);
  });
});
