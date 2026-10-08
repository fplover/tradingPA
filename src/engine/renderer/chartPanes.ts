import { PriceScale } from '../scale/PriceScale';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { PaneButtonRects } from './drawAxes';

/** 画布几何常量（图表区 = 画布 - 价格轴/时间轴；跨模块共享，随模型定义） */
export const AXIS_WIDTH = 64;
export const AXIS_HEIGHT = 24;
export const PANE_GAP = 0;

/** 价格轴位置（TV Scales 页）：右 / 左 / 无 */
export type PriceAxisPos = 'right' | 'left' | 'none';

/** 默认价格轴位置（右）：ChartState 字段初值视口初宽同源，保证默认路径零像素变化 */
export const DEFAULT_PRICE_AXIS_POS: PriceAxisPos = 'right';

/**
 * 图表区宽（画布宽 - 价格轴宽）。
 * right/left：轴占据画布一侧 64px，图表区 = 画布 - 轴宽；
 * none：无价格轴，图表区全宽（视口可见 bar 数随之变化）。
 */
export function chartAreaWidth(canvasW: number, pos: PriceAxisPos): number {
  return pos === 'none' ? canvasW : canvasW - AXIS_WIDTH;
}

/** 图表区左边界画布 x：left = 价格轴在左，图表区右移一个轴宽；right/none = 0 */
export function chartAreaOffsetX(pos: PriceAxisPos): number {
  return pos === 'left' ? AXIS_WIDTH : 0;
}

export type PaneKind = 'price' | 'indicator';

export interface PaneState {
  id: string;
  kind: PaneKind;
  heightRatio: number;
  priceScale: PriceScale;
  indicators: IndicatorInstance[];
  y: number;
  height: number;
  /** 手动价格域：上下拖动/价格轴拖动后锁定，不再自动适配 */
  manual: boolean;
  /** “自动”按钮命中区（面板局部坐标） */
  autoBtn: { x: number; y: number; w: number; h: number } | null;
  /** 面板头部操作按钮命中区（设置/移除，选中指标面板时绘制） */
  headerBtns: PaneButtonRects | null;
}

export function createPane(id: string, kind: PaneKind, heightRatio: number): PaneState {
  return {
    id,
    kind,
    heightRatio,
    priceScale: new PriceScale(),
    indicators: [],
    y: 0,
    height: 0,
    manual: false,
    autoBtn: null,
    headerBtns: null,
  };
}
