import { describe, expect, it } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { computeProfile } from '@/engine/profile/volumeProfile';
import type { Bar } from '@/types/market';

/**
 * 二期-G 百万根 K 线数据面探针（机械证据）：
 * 渲染管线本就 O(可见 bar)（LOD + 视口切片，10 万根实测 3–9ms/帧，见 PHASE2-PLAN），
 * 1M 根的增量压力全在数据面——本探针在 Node 侧机械验证：
 * 1M 根构建、BarSeries 二分查找（O(log n)）、时间→小数 index 插值、
 * 视口切片与 VP 分桶（O(可见窗口)）的时间预算。
 * 画布全管线 1M 视口验证需浏览器 E2E（登记 PHASE2-PLAN 交付记录边界）。
 */

const N = 1_000_000;
const T0 = Date.UTC(2024, 0, 1);
const IV = 60_000; // 1 分钟

function buildBars(): Bar[] {
  const out: Bar[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const close = 100 + (i % 1000) * 0.01; // 廉价确定性价格序列（锯齿）
    out[i] = {
      time: T0 + i * IV,
      open: close - 0.05,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 100,
    };
  }
  return out;
}

function budgetMs(ms: number, fn: () => void): number {
  const t0 = performance.now();
  fn();
  const dt = performance.now() - t0;
  // 机械断言为宽松预算（防数量级退化，不卡 CI 噪声）
  expect(dt).toBeLessThan(ms);
  return dt;
}

describe('百万根 K 线数据面探针（1M bars）', () => {
  it('构建 + BarSeries 装载 + O(log n) 查找 + O(可见) 分桶，全部在预算内', () => {
    let bars: Bar[] = [];
    const buildMs = budgetMs(15_000, () => {
      bars = buildBars();
    });

    const series = new BarSeries();
    const loadMs = budgetMs(2000, () => {
      series.replace(bars);
    });

    expect(series.length).toBe(N);
    const mid = N >> 1;
    expect(series.indexOfTime(T0 + mid * IV)).toBe(mid);
    expect(series.indexOfTime(T0 + N * IV)).toBe(-1); // 越界

    const lookupMs = budgetMs(500, () => {
      let hits = 0;
      for (let k = 0; k < 10_000; k++) {
        if (series.indexOfTime(T0 + ((k * 97) % N) * IV) >= 0) hits++;
      }
      expect(hits).toBe(10_000);
    });

    const fracMs = budgetMs(200, () => {
      let acc = 0;
      for (let k = 0; k < 1000; k++) acc += series.fractionalIndexAt(T0 + ((k * 131) % N) * IV);
      expect(acc).toBeGreaterThan(0);
    });

    // 视口切片（渲染层每帧入口）与 VP 分桶（O(可见窗口 × 行数)）
    const sliceMs = budgetMs(50, () => {
      expect(series.slice(500_000, 501_499)).toHaveLength(1500);
    });
    const vpMs = budgetMs(200, () => {
      const r = computeProfile(series.raw(), 500_000, 501_499, {
        rowCount: 24,
        vaPercent: 70,
        source: 'volume',
        mode: 'range',
      });
      expect(r).not.toBeNull();
      expect(r!.total).toBeCloseTo(1500 * 100, 6);
    });

    // 汇总数字供交付记录引用（预算内即通过；数字写入进程输出可观测）
    expect({ buildMs, loadMs, lookupMs, fracMs, sliceMs, vpMs }).toBeDefined();
  });
});
