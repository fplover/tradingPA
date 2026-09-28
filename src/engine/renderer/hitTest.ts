import type { Drawing } from '../drawing/types';
import { hitTestDrawing, type DrawContext } from '../drawing/drawDrawings';
import type { PaneButtonRects } from './drawAxes';

/**
 * 命中测试（D 批次拆分②；架构映射：ChartRenderer hitDrawings/hitPaneButtons）。
 * 纯函数：不持有状态，对象表/绘制上下文/面板几何全部显式入参。
 */

/** 画线命中结果（body=整体拖拽，handle=单手柄；index 仅 handle 有意义） */
export interface DrawingHit {
  id: string;
  part: 'body' | 'handle';
  index: number;
}

/** 面板头部按钮命中结果（设置/移除指标） */
export interface PaneButtonHit {
  action: 'settings' | 'remove';
  indicatorId: string;
}

/**
 * 画布级画线命中：自顶向下（顶层级优先），跳过不可见/锁定对象。
 * y 为全画布坐标，内部换算到面板局部（y - paneY）后交给 drawDrawings 的逐对象测试。
 */
export function hitDrawings(drawings: readonly Drawing[], x: number, y: number, paneY: number, dctx: DrawContext): DrawingHit | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (!d.visible || d.locked) continue;
    const hit = hitTestDrawing(d, x, y - paneY, dctx);
    if (hit) return { id: d.id, part: hit.part, index: hit.part === 'handle' ? hit.index : -1 };
  }
  return null;
}

/**
 * 面板头部按钮命中（设置/移除，仅选中指标面板绘制了按钮）。
 * 命中区外扩 2px（触摸友好）；btns/indicatorId 为 null 时无按钮可命中的。
 */
export function hitPaneButtons(x: number, y: number, paneY: number, btns: PaneButtonRects | null, indicatorId: string | null): PaneButtonHit | null {
  if (!btns || !indicatorId) return null;
  const ly = y - paneY;
  const inRect = (r: { x: number; y: number; w: number; h: number }) =>
    x >= r.x - 2 && x <= r.x + r.w + 2 && ly >= r.y - 2 && ly <= r.y + r.h + 2;
  if (inRect(btns.settings)) return { action: 'settings', indicatorId };
  if (inRect(btns.remove)) return { action: 'remove', indicatorId };
  return null;
}
