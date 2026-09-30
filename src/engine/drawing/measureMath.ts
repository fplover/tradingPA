/** 测量工具纯几何（P2-B）：两点 → bar 数 / 价差 / 百分比（TV Measure 浮层三行）。
 *  不依赖 canvas / DOM：渲染（measureRender）、命中、单测共用。
 *  bar 数按世界时间换算分数索引后取整（磁吸/非磁吸落点均可）。 */
import type { BarSeries } from '@/data/BarSeries';
import type { DrawingPoint } from './types';

export interface MeasureStats {
  /** 两点相隔 bar 数（取整） */
  bars: number;
  /** 价差（终点 - 起点） */
  diff: number;
  /** 百分比（起点价不为 0 时） */
  pct: number;
}

/** 测量统计：bar 数 = |分数索引差| 取整；价差/百分比按世界价格 */
export function measureStats(p1: DrawingPoint, p2: DrawingPoint, series: BarSeries): MeasureStats {
  const i1 = series.fractionalIndexAt(p1.time);
  const i2 = series.fractionalIndexAt(p2.time);
  const diff = p2.price - p1.price;
  return { bars: Math.round(Math.abs(i2 - i1)), diff, pct: p1.price !== 0 ? (diff / p1.price) * 100 : 0 };
}

/** 浮层三行文本：N 根K线 / 带符号价差 / 带符号百分比（TV 同口径） */
export function measureLabelLines(s: MeasureStats, decimals: number): string[] {
  return [
    `${s.bars} 根K线`,
    `${s.diff >= 0 ? '+' : ''}${s.diff.toFixed(decimals)}`,
    `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(2)}%`,
  ];
}
