import { describe, it, expect } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import type { Bar } from '@/types/market';
import type { IndicatorDef } from '@/indicators/core/types';
import { IndicatorInstance } from '@/indicators/core/instance';
import { drawPinePaint, isCandleLike } from '@/engine/renderer/drawPinePaint';
import { compilePine } from '@/indicators/pine/compile';
import { BARS, compileOk } from './helpers/pine-fixture';
import { createMockCtx, callsOf, propSets, asCtx, type MockCtx } from './helpers/mock-ctx';

/**
 * P2-A① Pine 绘图指令渲染接线：bgcolor 背景色带 + barcolor 蜡烛体色覆绘。
 * 条件序列经 IndicatorInstance.computeWindow 的 extra 旁路（与 compute 同窗缓存）。
 */

const W = 460;
const H = 300;
const FROM = 0;
const TO = BARS.length - 1;
const SPACING = 8;

/** bgcolor(close>open)：奇 bar 阳线生效；barcolor(close<open)：偶 bar 阴线生效 */
const SRC = [
  'indicator("paint 渲染", overlay=true)',
  'plot(close, "close")',
  'bgcolor(close > open, color=color.red)',
  'barcolor(close < open, color=color.green)',
].join('\n');

function fixture() {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(SPACING);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(Math.min(...BARS.map((b) => b.low)), Math.max(...BARS.map((b) => b.high)));
  const geo = { chartW: W, chartH: H };
  const ctx = createMockCtx();
  return { ctx, series, viewport, priceScale, geo };
}

function paintInstance(src = SRC): IndicatorInstance {
  return new IndicatorInstance(compileOk(src));
}

/** 收集一次绘制的 rect 参数（跳过首个 clip 裁剪矩形；callsOf 已返回参数数组本身） */
function rectsOf(ctx: MockCtx): Array<[number, number, number, number]> {
  return callsOf(ctx, 'rect').slice(1) as unknown as Array<[number, number, number, number]>;
}

describe('P2-A① computeExtra 旁路（窗口对齐）', () => {
  it('extra 与 compute 同窗返回：cond 序列长度=窗口长、按 ctxFrom 对齐', () => {
    const inst = paintInstance();
    const { extra, ctxFrom } = inst.computeWindow(BARS, FROM, TO);
    const paints = extra as Array<{ kind: string; color: string; cond: Array<number | undefined> | null }>;
    expect(paints).toHaveLength(2);
    expect(ctxFrom).toBe(0);
    const bg = paints.find((p) => p.kind === 'bgcolor')!;
    expect(bg.color).toBe('#f44336');
    // 奇 bar 阳线生效：cond 与 BARS 逐根对齐
    expect(bg.cond).toEqual(BARS.map((b) => (b.close > b.open ? 1 : 0)));
    const bar = paints.find((p) => p.kind === 'barcolor')!;
    expect(bar.color).toBe('#4caf50');
    expect(bar.cond).toEqual(BARS.map((b) => (b.close < b.open ? 1 : 0)));
  });

  it('纯 color 常量指令 cond=null（恒生效）', () => {
    const inst = paintInstance('indicator("C", overlay=true)\nplot(close)\nbarcolor(color.blue)');
    const { extra } = inst.computeWindow(BARS, FROM, TO);
    const paints = extra as Array<{ kind: string; color: string; cond: unknown }>;
    expect(paints[0]).toMatchObject({ kind: 'barcolor', color: '#2196f3', cond: null });
  });

  it('多窗口不串窗：图例窗计算后，绘制窗缓存仍返回本窗 paint', () => {
    const inst = paintInstance();
    const f = fixture();
    // 先画一次（绘制窗 0..11）
    drawPinePaint(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo, 'bg');
    const firstCount = rectsOf(f.ctx).length;
    expect(firstCount).toBe(6); // 6 根阳线
    // 图例窗（5..6）compute：覆盖 lastPaintRun 槽位
    inst.computeWindow(BARS, 5, 6);
    // 再画绘制窗：缓存命中，extra 仍为 0..11 窗的 paint
    const ctx2 = createMockCtx();
    drawPinePaint(asCtx(ctx2), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo, 'bg');
    expect(rectsOf(ctx2).length).toBe(6);
  });
});

describe('P2-A① drawPinePaint 渲染', () => {
  it('bg 相位：阳线 bar 列背景色带，颜色带 alpha 后缀', () => {
    const f = fixture();
    const inst = paintInstance();
    drawPinePaint(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo, 'bg');
    expect(propSets(f.ctx, 'fillStyle')).toEqual(['#f4433626']);
    const rects = rectsOf(f.ctx);
    expect(rects).toHaveLength(6); // 仅奇 bar（阳线）
    // 列几何：x = indexToX(i) - spacing/2，宽 = spacing，全高
    const oddIndexes = BARS.map((b, i) => (b.close > b.open ? i : -1)).filter((i) => i >= 0);
    rects.forEach(([x, y, w, h], k) => {
      expect(x).toBeCloseTo(f.viewport.indexToX(oddIndexes[k]) - SPACING / 2, 6);
      expect(w).toBeCloseTo(SPACING, 6);
      expect(y).toBe(0);
      expect(h).toBe(H);
    });
    expect(callsOf(f.ctx, 'fill').length).toBe(1); // 单 path 批量填充
  });

  it('bar 相位：阴线 bar 体矩形覆绘，颜色不透明、几何与 drawCandles 一致', () => {
    const f = fixture();
    const inst = paintInstance();
    drawPinePaint(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo, 'bar');
    expect(propSets(f.ctx, 'fillStyle')).toEqual(['#4caf50']); // 无 alpha 后缀
    const rects = rectsOf(f.ctx);
    expect(rects).toHaveLength(6); // 仅偶 bar（阴线）
    const bodyW = Math.max(1, Math.min(SPACING * 0.7, 30));
    const evenIndexes = BARS.map((b, i) => (b.close < b.open ? i : -1)).filter((i) => i >= 0);
    rects.forEach(([x, y, w, h], k) => {
      const i = evenIndexes[k];
      const bar: Bar = BARS[i];
      expect(w).toBeCloseTo(bodyW, 6);
      expect(x).toBeCloseTo(f.viewport.indexToX(i) - bodyW / 2, 6);
      const yOpen = f.priceScale.priceToY(bar.open);
      const yClose = f.priceScale.priceToY(bar.close);
      expect(y).toBeCloseTo(Math.min(yOpen, yClose), 6);
      expect(h).toBeCloseTo(Math.max(1, Math.abs(yClose - yOpen)), 6);
    });
  });

  it('bg 相位不画 barcolor、bar 相位不画 bgcolor（相位隔离）', () => {
    const f = fixture();
    const inst = paintInstance();
    drawPinePaint(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo, 'bg');
    expect(propSets(f.ctx, 'fillStyle')).not.toContain('#4caf50');
    const f2 = fixture();
    drawPinePaint(asCtx(f2.ctx), inst, BARS, FROM, TO, f2.viewport, f2.priceScale, f2.geo, 'bar');
    expect(propSets(f2.ctx, 'fillStyle')).not.toContain('#f4433626');
  });

  it('无 paint 旁路的指标（内置/无 computeExtra）：零绘制调用', () => {
    const f = fixture();
    const plainDef: IndicatorDef = {
      id: 'plain',
      name: 'plain',
      category: 'test',
      overlay: true,
      lookback: 0,
      params: [],
      plots: [],
      compute: () => ({}),
    };
    const inst = new IndicatorInstance(plainDef);
    drawPinePaint(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo, 'bg');
    drawPinePaint(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo, 'bar');
    expect(f.ctx.calls.filter((c) => c.m === 'rect' || c.m === 'fill')).toHaveLength(0);
  });

  it('isCandleLike：蜡烛族 true，线形/面积族 false', () => {
    expect(isCandleLike('candles')).toBe(true);
    expect(isCandleLike('heikin-ashi')).toBe(true);
    expect(isCandleLike('renko')).toBe(true);
    expect(isCandleLike('line')).toBe(false);
    expect(isCandleLike('area')).toBe(false);
    expect(isCandleLike('ohlc')).toBe(false);
  });

  it('编译失败脚本不走渲染（def=null 时调用方不会建实例）', () => {
    const r = compilePine('plot(close)\nbgcolor(flag)', 'test');
    expect(r.def).toBeNull();
  });
});
