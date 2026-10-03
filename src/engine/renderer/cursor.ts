/**
 * 光标决策纯函数（D 批次拆分②；架构映射：ChartRenderer.updateHoverCursor）。
 * 只做「悬停态 → CSS cursor 值」的决策；DOM 写入与 dirty check 留在渲染器
 * （每 pointermove 直接写 canvas.style.cursor 有 dirty check，位置在渲染器）。
 * 无依赖，可独立单测。
 */

import type { StudyLegendRect } from './drawCrosshair';

/** 光标决策输入（ChartRenderer 悬停态与画布几何的结构子集） */
export interface CursorInput {
  /** 指针画布坐标 */
  x: number;
  y: number;
  /** 图表区右边界（= 画布宽 - 价格轴宽；右侧为价格轴区域） */
  chartRight: number;
  /** 图表区下边界（= 画布高 - 时间轴高；下方为时间轴区域） */
  chartBottom: number;
  /** 面板分隔条命中 index（null = 未命中） */
  separatorIndex: number | null;
  /** 研究图例行悬停按钮 index（null = 无） */
  studyHoverBtn: number | null;
  /** 画线悬停光标（handle=pointer / body=move；'' = 无） */
  drawingHoverCursor: string;
  /** 是否悬停交易可视化元素 */
  tradeHover: boolean;
}

/** TV 光标语义：面板分隔条与价格轴 ns-resize，时间轴 ew-resize，可交互元素 pointer。
 *  返回 '' 表示默认光标（交还给画布/页面默认样式）。 */
export function decideCursor(input: CursorInput): string {
  if (input.separatorIndex !== null) return 'ns-resize';
  if (input.x > input.chartRight) return 'ns-resize';
  if (input.y > input.chartBottom) return 'ew-resize';
  if (input.studyHoverBtn !== null) return 'pointer';
  if (input.drawingHoverCursor) return input.drawingHoverCursor;
  if (input.tradeHover) return 'pointer';
  return '';
}

/** 研究图例行悬停判定（图例右侧 眼睛/设置/移除 按钮）：命中行返回 uid 与按钮 index。
 *  按钮区宽 16px、最多 3 个；未命中任何行返回 null。 */
export function hoverStudyRow(
  rects: readonly StudyLegendRect[],
  x: number,
  y: number,
): { uid: string; btn: number | null } | null {
  for (const r of rects) {
    if (x >= r.x && x <= r.btnX + 48 && y >= r.y && y <= r.y + r.h) {
      return { uid: r.uid, btn: x >= r.btnX ? Math.min(2, Math.floor((x - r.btnX) / 16)) : null };
    }
  }
  return null;
}
