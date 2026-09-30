import { describe, expect, it, vi } from 'vitest';
import { IndicatorInstance } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import type { Bar } from '@/types/market';
import { BarSeries } from '@/data/BarSeries';
import { PriceScale } from '@/engine/scale/PriceScale';
import { Viewport } from '@/engine/viewport/Viewport';
import { drawIndicator, indicatorValuesAt } from '@/engine/renderer/drawIndicator';
import { autoscaleIndicators, type AutoscaleOptions, type ScalablePane } from '@/engine/renderer/autoscale';
import { asCtx, createMockCtx } from './helpers/mock-ctx';

/**
 * 指标 computeWindow 脏缓存 + 同帧复用（架构评估 #4）。
 * 数值正确性由 indicators.test.ts 金标准全量兜底；这里只证缓存行为：
 * 命中不重算、四条失效路径必失效、返回值副本安全、同帧三消费方一次计算。
 */

/** 确定性 K 线（与金标准同风格：收盘 = 序号） */
function ramp(n: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 1; i <= n; i++) {
    bars.push({ time: i * 60_000, open: i, high: i + 1, low: i - 1, close: i, volume: 100 });
  }
  return bars;
}

/** 带计算计数探针的实例：复制注册表 def 并包裹 compute（绝不污染共享注册表） */
function countingInstance(id = 'sma', params?: Record<string, string | number | boolean>) {
  const base = getIndicatorDef(id);
  if (!base) throw new Error(`指标不存在: ${id}`);
  const compute = vi.fn((bars: readonly Bar[], p: Record<string, string | number | boolean>) => base.compute(bars, p));
  return { inst: new IndicatorInstance({ ...base, compute }, { params }), compute };
}

/** 全新未缓存实例（金标准对照） */
function freshOutputs(id: string, bars: readonly Bar[], from: number, to: number, params?: Record<string, string | number | boolean>) {
  return new IndicatorInstance(getIndicatorDef(id)!, { params }).computeWindow(bars, from, to).outputs;
}

describe('computeWindow 脏缓存：命中', () => {
  it('同 bars 引用 + 同窗口 + 同 params，二次调用不重算且值一致', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(30);
    const first = inst.computeWindow(bars, 10, 20);
    const second = inst.computeWindow(bars, 10, 20);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(second.ctxFrom).toBe(first.ctxFrom);
    expect(second.outputs).toEqual(first.outputs);
    // 与未缓存实例的金标准值逐项一致
    expect(second.outputs).toEqual(freshOutputs('sma', bars, 10, 20));
  });

  it('多窗口各自缓存：交替调用不互相挤掉', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(30);
    inst.computeWindow(bars, 10, 20);
    inst.computeWindow(bars, 12, 22);
    inst.computeWindow(bars, 10, 20);
    inst.computeWindow(bars, 12, 22);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('同值 options 重下发不失效缓存（仅值变化 bump 版本号）', () => {
    const { inst, compute } = countingInstance('sma', { length: 3 });
    const bars = ramp(30);
    inst.computeWindow(bars, 10, 20);
    inst.applyOptions({ params: { length: 3 } });
    inst.computeWindow(bars, 10, 20);
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('computeWindow 脏缓存：四条失效路径', () => {
  it('失效①新 bar：time 变化（push，数组引用不变）自动重算', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(30);
    inst.computeWindow(bars, 10, 29);
    bars.push({ time: 31 * 60_000, open: 31, high: 32, low: 30, close: 31, volume: 100 });
    const after = inst.computeWindow(bars, 10, 29);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(after.outputs).toEqual(freshOutputs('sma', bars, 10, 29));
  });

  it('失效①实时 tick：同 time 新 bar 对象（close 变）必须重算且值不陈旧', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(30);
    const before = inst.computeWindow(bars, 10, 29);
    // 金标准：sma(20)[29] = mean(11..30) = 20.5
    expect(before.outputs.sma![29]).toBeCloseTo(20.5, 10);
    // BarSeries.update 同 time 分支即此模式：替换末 bar 对象，time 不变、close 变
    const last = bars[29];
    bars[29] = { ...last, close: last.close + 10 };
    const after = inst.computeWindow(bars, 10, 29);
    expect(compute).toHaveBeenCalledTimes(2);
    // 新值：mean(11..29, 40) = 21——缓存必须反映新数据而非服务 20.5
    expect(after.outputs.sma![29]).toBeCloseTo(21, 10);
    expect(after.outputs).toEqual(freshOutputs('sma', bars, 10, 29));
  });

  it('失效②bars 替换：新数组引用（内容相同）也重算', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(30);
    inst.computeWindow(bars, 10, 20);
    const replaced = ramp(30); // setData/replace 模式：同内容、新引用
    inst.computeWindow(replaced, 10, 20);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('失效③窗口变化：from / to 任一变化即重算', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(30);
    inst.computeWindow(bars, 10, 20);
    inst.computeWindow(bars, 11, 20); // from 变
    inst.computeWindow(bars, 10, 21); // to 变
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('失效④参数变化：applyOptions 改 params 后重算且值正确', () => {
    const { inst, compute } = countingInstance('sma', { length: 3 });
    const bars = ramp(30);
    const before = inst.computeWindow(bars, 0, 29);
    inst.applyOptions({ params: { length: 5 } });
    const after = inst.computeWindow(bars, 0, 29);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(after.outputs.sma).not.toEqual(before.outputs.sma);
    // 金标准：length=5 → sma[29] = mean(26..30) = 28
    expect(after.outputs.sma![29]).toBeCloseTo(28, 10);
    expect(after.outputs).toEqual(freshOutputs('sma', bars, 0, 29, { length: 5 }));
  });

  it('失效④防御：绕过 applyOptions 就地修改 params 也失效（浅快照兜底）', () => {
    const { inst, compute } = countingInstance('sma', { length: 3 });
    const bars = ramp(30);
    inst.computeWindow(bars, 0, 29);
    inst.params.length = 5; // 直接改字段（版本号不 bump，靠快照比对）
    const after = inst.computeWindow(bars, 0, 29);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(after.outputs.sma![29]).toBeCloseTo(28, 10);
  });
});

describe('computeWindow 脏缓存：返回值安全性', () => {
  it('调用方就地修改返回数组/删 key 不影响缓存，也不触发重算', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(30);
    const first = inst.computeWindow(bars, 10, 20);
    const pristine = first.outputs.sma!.slice();
    first.outputs.sma![5] = 999; // 破坏性修改
    delete (first.outputs as Record<string, unknown>).sma; // 甚至删掉整个 plot
    const second = inst.computeWindow(bars, 10, 20);
    expect(compute).toHaveBeenCalledTimes(1); // 未触发重算
    expect(second.outputs.sma).toEqual(pristine); // 缓存值未被污染
    expect(second.outputs.sma).not.toBe(first.outputs.sma); // 返回的是副本
  });
});

describe('同帧复用：autoscale + draw + legend', () => {
  it('三消费方对同一 (instance, 窗口) 只触发一次 compute', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(60);
    const series = new BarSeries();
    series.replace(bars);
    const pane: ScalablePane = { priceScale: new PriceScale(), indicators: [inst], manual: false };
    const opts: AutoscaleOptions = { autoScaleOn: true, logScale: false };
    const viewport = new Viewport(400);
    viewport.setBarCount(bars.length);
    const ctx = asCtx(createMockCtx());
    const from = 30;
    const to = 50;

    autoscaleIndicators(pane, series, from, to, opts); // 消费方① autoscale
    drawIndicator(ctx, inst, series.raw(), from, to, viewport, pane.priceScale, { chartW: 400, chartH: 200 }); // ② draw
    indicatorValuesAt(inst, series.raw(), from, to); // ③ legend（同窗口）

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('真实帧拓扑：绘制窗口与图例窗口分离，空闲帧 0 次、平移/悬停帧各 1 次', () => {
    const { inst, compute } = countingInstance();
    const bars = ramp(80);
    const series = new BarSeries();
    series.replace(bars);
    const pane: ScalablePane = { priceScale: new PriceScale(), indicators: [inst], manual: false };
    const opts: AutoscaleOptions = { autoScaleOn: true, logScale: false };
    const viewport = new Viewport(400);
    viewport.setBarCount(bars.length);
    const ctx = asCtx(createMockCtx());
    const last = bars.length - 1;
    /** 模拟一帧：autoscale + draw 用可视窗口 (from, to)；图例用 50 根回看窗口 */
    const frame = (from: number, to: number, legendIndex = last) => {
      autoscaleIndicators(pane, series, from, to, opts);
      drawIndicator(ctx, inst, series.raw(), from, to, viewport, pane.priceScale, { chartW: 400, chartH: 200 });
      indicatorValuesAt(inst, series.raw(), Math.max(0, legendIndex - 50), legendIndex);
    };

    frame(20, 60); // 首帧：2 个不同窗口 → 2 次（旧行为 3 次）
    expect(compute).toHaveBeenCalledTimes(2);
    frame(20, 60); // 空闲重绘帧（倒计时/主题等触发，数据视口未变）→ 0 次
    expect(compute).toHaveBeenCalledTimes(2);
    frame(21, 61); // 平移帧：绘制窗口变 → 1 次；图例窗口（last-50, last）不变 → 命中
    expect(compute).toHaveBeenCalledTimes(3);
    frame(20, 60, 40); // 悬停帧：绘制窗口命中；图例窗口随光标变 → 1 次
    expect(compute).toHaveBeenCalledTimes(4);
    frame(20, 60, 40); // 悬停停留再绘 → 0 次
    expect(compute).toHaveBeenCalledTimes(4);
  });
});

describe('缓存命中数值正确性：多指标对照金标准', () => {
  it('sma / ema / rsi / vol 命中值与未缓存实例逐项一致', () => {
    const bars = ramp(50);
    for (const id of ['sma', 'ema', 'rsi', 'vol']) {
      const { inst } = countingInstance(id);
      const first = inst.computeWindow(bars, 10, 40);
      const second = inst.computeWindow(bars, 10, 40); // 命中
      const legend = indicatorValuesAt(inst, bars, Math.max(0, 40 - 50), 40); // 图例窗口
      expect(second.outputs, id).toEqual(freshOutputs(id, bars, 10, 40));
      expect(first.outputs, id).toEqual(second.outputs);
      // 图例值同样与全新实例一致
      const freshLegend = indicatorValuesAt(new IndicatorInstance(getIndicatorDef(id)!), bars, 0, 40);
      expect(legend, id).toEqual(freshLegend);
    }
  });
});
