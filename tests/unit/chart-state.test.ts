// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Viewport } from '@/engine/viewport/Viewport';
import { Crosshair } from '@/engine/crosshair/Crosshair';
import { CloseCountdown } from '@/engine/countdown';
import type { Bar } from '@/types/market';
import { ChartState } from '@/engine/renderer/ChartState';

/**
 * D 批次拆分④ 模型层单测（W6-2）。
 * 覆盖：数据装载与图表类型变换（applyData）、可视区间与复盘、面板布局、
 * 指标生命周期（IndicatorManager）、配置 setter 的重绘请求。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
const CHART_W = 1216;
const CHART_H = 776;

function makeBars(n = 200): Bar[] {
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

function makeState(): { state: ChartState; invalidate: ReturnType<typeof vi.fn>; viewport: Viewport } {
  const invalidate = vi.fn();
  const viewport = new Viewport(CHART_W);
  const state = new ChartState(viewport, new Crosshair(), new CloseCountdown(), () => CHART_W, invalidate);
  state.initData(BARS);
  return { state, invalidate, viewport };
}

describe('ChartState：数据与图表类型', () => {
  it('initData + applyData：蜡烛类型下 displaySeries 即 baseSeries，视口同步 bar 数', () => {
    const { state, viewport } = makeState();
    state.applyData(true);
    expect(state.displaySeries).toBe(state.baseSeries);
    expect(state.displaySeries.length).toBe(BARS.length);
    expect(viewport.barCount).toBe(BARS.length);
    // scrollToRealtime：first 贴近右缘
    expect(viewport.first).toBeGreaterThan(BARS.length - 200);
  });

  it('heikin-ashi 变换：displaySeries 为重算结果；renko 等砖块类 timeBasedChart=false', () => {
    const { state } = makeState();
    state.setChartType('heikin-ashi');
    expect(state.chartType).toBe('heikin-ashi');
    expect(state.displaySeries).not.toBe(state.baseSeries);
    expect(state.displaySeries.length).toBeGreaterThan(0);
    expect(state.timeBasedChart).toBe(true); // HA 保留时间戳
    state.setChartType('renko');
    expect(state.timeBasedChart).toBe(false);
    // 切回蜡烛：恢复 baseSeries
    state.setChartType('candles');
    expect(state.displaySeries).toBe(state.baseSeries);
    expect(state.timeBasedChart).toBe(true);
  });

  it('setData 重置价格域（manual 回落）并请求重绘', () => {
    const { state, invalidate } = makeState();
    state.applyData(true);
    state.panes[0].manual = true;
    state.setData(makeBars(120));
    expect(state.panes[0].manual).toBe(false);
    expect(state.displaySeries.length).toBe(120);
    expect(invalidate).toHaveBeenCalled();
  });

  it('updateBar 贴右缘时跟随滚动；prependData 重建序列', () => {
    const { state } = makeState();
    state.applyData(true);
    const last = BARS[BARS.length - 1];
    state.updateBar({ ...last, close: last.close * 1.001 });
    expect(state.displaySeries.length).toBe(BARS.length);
    state.prependData(makeBars(30));
    expect(state.baseSeries.length).toBe(BARS.length + 30);
  });
});

describe('ChartState：复盘与可视区间', () => {
  it('visibleRange：复盘 index 之后的 bar 不可见', () => {
    const { state } = makeState();
    state.applyData(true);
    const full = state.visibleRange();
    // 复盘位置由门面 setReplayIndex 写入（视口算术 + 居中在其内）；此处验可视区间钳制
    state.replayIndex = 150;
    const replayed = state.visibleRange();
    expect(replayed.to).toBeLessThanOrEqual(150);
    expect(replayed.from).toBeLessThanOrEqual(replayed.to);
    expect(full.to).toBeGreaterThan(150);
  });
});

describe('ChartState：面板布局与配置', () => {
  it('layout 按高度比例分配几何且总数守恒', () => {
    const { state } = makeState();
    state.indicators.add('rsi'); // 副图面板
    state.layout(CHART_H);
    expect(state.panes).toHaveLength(2);
    const total = state.panes.reduce((s, p) => s + p.height, 0);
    expect(total).toBeCloseTo(CHART_H, 6);
    expect(state.panes[1].y).toBeCloseTo(state.panes[0].height, 6);
  });

  it('配置 setter 落状态并请求重绘', () => {
    const { state, invalidate } = makeState();
    invalidate.mockClear();
    state.setLogScale(true);
    expect(state.logScale).toBe(true);
    expect(state.panes[0].priceScale.isLog).toBe(true);
    state.setAutoScale(false);
    expect(state.autoScaleOn).toBe(false);
    state.setGridMode('horizontal');
    expect(state.gridMode).toBe('horizontal');
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});

describe('IndicatorManager：指标生命周期', () => {
  it('overlay 进主面板；副图指标独立成面板', () => {
    const { state } = makeState();
    expect(state.indicators.add('sma')).toBeTruthy();
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0].indicators).toHaveLength(1);
    expect(state.indicators.add('rsi')).toBeTruthy();
    expect(state.panes).toHaveLength(2);
    expect(state.panes[1].kind).toBe('indicator');
    // 未知 id 返回 null
    expect(state.indicators.add('no-such-indicator')).toBeNull();
  });

  it('remove 清空指标并移除空面板；选中面板回落主面板', () => {
    const { state } = makeState();
    const uid = state.indicators.add('rsi')!;
    state.selectedPaneId = state.panes[1].id; // 选中副图面板
    state.indicators.remove(uid);
    expect(state.panes).toHaveLength(1);
    expect(state.selectedPaneId).toBe('main');
  });

  it('list / exportTemplate / importTemplate 往返', () => {
    const { state } = makeState();
    state.indicators.add('sma');
    state.indicators.add('rsi');
    expect(state.indicators.list()).toHaveLength(2);
    const tpl = state.indicators.exportTemplate();
    expect(tpl.map((t) => t.id).sort()).toEqual(['rsi', 'sma']);
    state.indicators.importTemplate([{ id: 'ema' }]);
    expect(state.indicators.list().map((i) => i.id)).toEqual(['ema']);
    expect(state.panes).toHaveLength(1); // 副图面板已清
  });
});
