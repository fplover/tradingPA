import { describe, expect, it } from 'vitest';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { BarSeries } from '@/data/BarSeries';
import type { Bar } from '@/types/market';

function bars(n: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ time: i * 60_000, open: 100, high: 101, low: 99, close: 100, volume: 1 });
  }
  return out;
}

describe('Viewport', () => {
  it('scrollToRealtime 让最新 K 线贴右', () => {
    const v = new Viewport(460);
    v.setBarCount(1000);
    v.scrollToRealtime();
    const visibleCount = 460 / v.spacing;
    expect(v.first).toBeCloseTo(1000 - visibleCount + 5, 10);
    expect(v.isAtRightEdge()).toBe(true);
  });

  it('zoomAt 锚点漂移为 0', () => {
    const v = new Viewport(460);
    v.setBarCount(1000);
    v.scrollToRealtime();
    v.panByBars(-200); // 偏离右边缘，排除边界钳制干扰
    const anchor = v.xToIndex(230);
    const xBefore = v.indexToX(anchor);
    v.zoomAt(230, 0.9);
    expect(v.indexToX(anchor)).toBeCloseTo(xBefore, 6);
  });

  it('向右拖（看历史）有左边界，第一根不超过画面右缘', () => {
    const v = new Viewport(460);
    v.setBarCount(100);
    v.scrollToRealtime();
    v.panByBars(-100000);
    const visibleCount = 460 / v.spacing;
    expect(v.first).toBeGreaterThanOrEqual(-Math.ceil(visibleCount));
  });

  it('向左拖允许进入右侧空白区（一整个视口），不再钉死在右边缘', () => {
    const v = new Viewport(460);
    v.setBarCount(100);
    v.scrollToRealtime();
    v.panByBars(100000);
    const visibleCount = 460 / v.spacing;
    const maxFirst = 100 - visibleCount + Math.max(5, visibleCount);
    expect(v.first).toBeLessThanOrEqual(maxFirst + 1e-9);
    expect(v.first).toBeGreaterThan(100 - visibleCount + 5); // 确实拖过了实时边缘
  });

  it('isAtRightEdge：贴边为 true，拖入空白/看历史为 false', () => {
    const v = new Viewport(460);
    v.setBarCount(100);
    v.scrollToRealtime();
    expect(v.isAtRightEdge()).toBe(true);
    v.panByBars(10); // 拖入右侧空白区
    expect(v.isAtRightEdge()).toBe(false);
    v.scrollToRealtime();
    v.panByBars(-10); // 看历史
    expect(v.isAtRightEdge()).toBe(false);
    v.scrollToRealtime();
    expect(v.isAtRightEdge()).toBe(true);
  });

  it('复盘边缘：可左右拖动，右界为复盘位置 + 一整个视口空白', () => {
    const v = new Viewport(460);
    v.setBarCount(1000);
    v.scrollToRealtime();
    v.setReplayEdge(500); // 复盘位置在 500
    const visibleCount = 460 / v.spacing;
    const maxFirst = 500 - visibleCount + Math.max(5, visibleCount);
    // 向左拖（看历史）：有左边界
    v.panByBars(-100000);
    expect(v.first).toBeGreaterThanOrEqual(-Math.ceil(visibleCount));
    // 向右拖（看回放点右侧空白）：不超过 复盘位置 + 一整个视口
    v.panByBars(100000);
    expect(v.first).toBeLessThanOrEqual(maxFirst + 1e-9);
    expect(v.first).toBeGreaterThan(499 - visibleCount); // 确实越过了复盘位置
    // 取消复盘边缘后右界回到数据末端
    v.setReplayEdge(null);
    v.panByBars(100000);
    expect(v.first).toBeGreaterThan(maxFirst);
  });

  it('缩放下限不超过数据铺满所需间距', () => {
    const v = new Viewport(460);
    v.setBarCount(100);
    for (let i = 0; i < 50; i++) v.zoomAt(230, 0.7);
    expect(v.spacing).toBeGreaterThanOrEqual(460 / 100 - 1e-9);
  });
});

describe('PriceScale', () => {
  it('线性换算往返', () => {
    const ps = new PriceScale();
    ps.setSize(500);
    ps.autoScale(100, 200);
    expect(ps.priceToY(150)).toBeCloseTo(250, 6);
    expect(ps.yToPrice(250)).toBeCloseTo(150, 6);
  });

  it('对数换算往返且刻度等比', () => {
    const ps = new PriceScale();
    ps.setSize(500);
    ps.setLogMode(true);
    ps.autoScale(100, 10000);
    expect(ps.yToPrice(ps.priceToY(1000))).toBeCloseTo(1000, 6);
    const ticks = ps.ticks(6);
    expect(ticks.length).toBeGreaterThan(2);
    // 对数刻度应近似等比
    const r1 = ticks[1] / ticks[0];
    const r2 = ticks[2] / ticks[1];
    expect(r1).toBeCloseTo(r2, 1);
  });

  it('刻度在范围内', () => {
    const ps = new PriceScale();
    ps.setSize(500);
    ps.autoScale(100, 200);
    const ticks = ps.ticks(6);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(ps.range.min - 1e-9);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(ps.range.max + 1e-9);
  });
});

describe('BarSeries', () => {
  it('update 同时间戳替换、新时间戳追加', () => {
    const s = new BarSeries();
    s.replace(bars(3));
    s.update({ time: 120_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 5 });
    expect(s.length).toBe(3);
    expect(s.last!.close).toBe(1.5);
    s.update({ time: 180_000, open: 1.5, high: 2, low: 1, close: 1.8, volume: 5 });
    expect(s.length).toBe(4);
  });

  it('乱序包丢弃', () => {
    const s = new BarSeries();
    s.replace(bars(3));
    s.update({ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 });
    expect(s.length).toBe(3);
    expect(s.last!.time).toBe(120_000);
  });

  it('indexOfTime / fractionalIndexAt', () => {
    const s = new BarSeries();
    s.replace(bars(5));
    expect(s.indexOfTime(120_000)).toBe(2);
    expect(s.indexOfTime(999_999)).toBe(-1);
    expect(s.fractionalIndexAt(90_000)).toBeCloseTo(1.5, 10);
    expect(s.fractionalIndexAt(600_000)).toBeCloseTo(10, 10); // 外推
  });

  it('prepend 前插保持升序', () => {
    const s = new BarSeries();
    s.replace(bars(3));
    const older = bars(2).map((b) => ({ ...b, time: b.time - 10 * 60_000 }));
    s.prepend(older);
    expect(s.length).toBe(5);
    expect(s.first!.time).toBe(-600_000);
    expect(s.last!.time).toBe(120_000);
  });
});
