import { PriceScale } from '../scale/PriceScale';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { PaneButtonRects } from './drawAxes';

/** 画布几何常量（图表区 = 画布 - 价格轴/时间轴；跨模块共享，随模型定义） */
export const AXIS_WIDTH = 64;
export const AXIS_HEIGHT = 24;
export const PANE_GAP = 0;

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
