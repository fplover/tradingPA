import type { BarSeries } from '@/data/BarSeries';
import type { PriceScale } from '../scale/PriceScale';
import type { IndicatorInstance } from '@/indicators/core/instance';
import { indicatorRange } from './drawIndicator';

/**
 * 价格域自适应（D 批次拆分①；架构映射：ChartRenderer ensurePriceScaleReady /
 * autoscalePrice / autoscaleIndicators）。纯函数：不持有状态，全部依赖显式入参，
 * 与 drawXxx 渲染原语同风格（view/renderer 分离），可独立单测。
 */

/** autoscale 需要的最小面板形状（ChartRenderer.PaneState 的结构子集，避免反向依赖） */
export interface ScalablePane {
  priceScale: PriceScale;
  indicators: IndicatorInstance[];
  manual: boolean;
}

/** 图表级自适应配置（每帧由 ChartRenderer 提供） */
export interface AutoscaleOptions {
  /** 自动价格适配开关（TV 底部 auto） */
  autoScaleOn: boolean;
  /** 对数坐标 */
  logScale: boolean;
  /** 图例 timeframeId（指标按周期可见性） */
  timeframeId?: string;
}

/** 主图价格域自适应：可见 bar 高低 + 叠加指标值域；manual 面板保持当前范围 */
export function autoscalePrice(
  pane: ScalablePane,
  series: BarSeries,
  from: number,
  to: number,
  opts: AutoscaleOptions,
): void {
  if (!opts.autoScaleOn) return;
  let low = Infinity;
  let high = -Infinity;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    if (bar.low < low) low = bar.low;
    if (bar.high > high) high = bar.high;
  }
  // 叠加指标参与主图价格域
  const bars = series.raw();
  for (const inst of pane.indicators) {
    if (!inst.isVisibleOn(opts.timeframeId)) continue;
    const r = indicatorRange(inst, bars, from, to);
    if (r.low < low) low = r.low;
    if (r.high > high) high = r.high;
  }
  if (low === Infinity) return;
  pane.priceScale.setLogMode(opts.logScale);
  if (pane.manual) return; // 手动价格域：保持当前范围
  pane.priceScale.autoScale(low, high);
}

/** 副图指标价格域自适应：含零轴（histogram 需要） */
export function autoscaleIndicators(
  pane: ScalablePane,
  series: BarSeries,
  from: number,
  to: number,
  opts: AutoscaleOptions,
): void {
  if (pane.manual) return;
  let low = Infinity;
  let high = -Infinity;
  const bars = series.raw();
  for (const inst of pane.indicators) {
    if (!inst.isVisibleOn(opts.timeframeId)) continue;
    const r = indicatorRange(inst, bars, from, to);
    if (r.low < low) low = r.low;
    if (r.high > high) high = r.high;
  }
  if (low === Infinity) return;
  pane.priceScale.autoScale(Math.min(low, 0), Math.max(high, 0));
}

/** 确保面板价格轴尺寸与自适应范围最新（rAF 暂停时拖拽换算也正确）。
 *  与 draw 帧内的自适应区分：这里只按可见 bar 高低适配（不含指标域），
 *  调用方负责先 layout() 并把可视区间换算好。 */
export function ensurePriceScaleReady(
  pane: ScalablePane,
  series: BarSeries,
  from: number,
  to: number,
  logScale: boolean,
): void {
  if (to < from) return;
  let low = Infinity;
  let high = -Infinity;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    if (bar.low < low) low = bar.low;
    if (bar.high > high) high = bar.high;
  }
  if (low !== Infinity) {
    pane.priceScale.setLogMode(logScale);
    pane.priceScale.autoScale(low, high);
  }
}
