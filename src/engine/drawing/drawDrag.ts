/** 拖拽画线的坐标运算（D 批次拆分③后续瘦身）：整体平移（body：单选/多选整组）
 *  或单手柄移动（handle）；Shift = 按主导轴约束（仅线类工具生效）。
 *  纯函数：拖拽态 / 面板局部原点 / 绘制上下文显式入参，返回各对象的新坐标表，
 *  由调用方（DrawingGesture）落层并驱动重绘与广播。 */
import type { DrawingPoint, DrawingTypeId } from './types';
import { isConstrainableTool } from './types';
import { pixelToPoint, pointToPixel, type DrawContext } from './coords';

/** 拖拽态（DrawingGesture.DrawingDrag 的结构子集，避免反向依赖） */
export interface DragState {
  ids: string[];
  part: 'body' | 'handle';
  index: number;
  start: DrawingPoint;
  origins: Map<string, DrawingPoint[]>;
}

/**
 * 计算拖拽后的各对象坐标：key = 对象 id，value = 新坐标（调用方逐项 updatePoints）。
 * paneY 为主面板局部 y 原点（拖拽换算固定主面板，与放置的当前面板语义分开）；
 * typeOf 供 Shift 约束判定工具类型（找不到按非约束工具处理）。
 */
export function computeDragPoints(
  drag: DragState,
  x: number,
  y: number,
  paneY: number,
  shift: boolean,
  dctx: DrawContext,
  typeOf: (id: string) => DrawingTypeId | undefined,
): Map<string, DrawingPoint[]> {
  const cur = pixelToPoint(x, y - paneY, dctx, 'off');
  const constrain = shift && drag.ids.some((id) => isConstrainableTool(typeOf(id) ?? 'rect'));
  const out = new Map<string, DrawingPoint[]>();
  if (drag.part === 'body') {
    let dt = cur.time - drag.start.time;
    let dp = cur.price - drag.start.price;
    if (constrain) {
      const sp = pointToPixel(drag.start, dctx);
      if (Math.abs(x - sp.x) >= Math.abs(y - paneY - sp.y)) dp = 0;
      else dt = 0;
    }
    for (const [id, origin] of drag.origins) {
      out.set(
        id,
        origin.map((p) => ({ time: p.time + dt, price: p.price + dp })),
      );
    }
  } else {
    let target = cur;
    if (constrain) {
      const h = drag.origins.get(drag.ids[0])?.[drag.index];
      if (h) {
        const hp = pointToPixel(h, dctx);
        target =
          Math.abs(x - hp.x) >= Math.abs(y - paneY - hp.y)
            ? pixelToPoint(x, hp.y, dctx, 'off')
            : pixelToPoint(hp.x, y - paneY, dctx, 'off');
      }
    }
    const pts = (drag.origins.get(drag.ids[0]) ?? []).map((p) => ({ ...p }));
    if (pts[drag.index]) pts[drag.index] = target;
    out.set(drag.ids[0], pts);
  }
  return out;
}
