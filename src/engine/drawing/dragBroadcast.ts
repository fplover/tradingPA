/** 拖拽画线的广播节流门襟（P2-D③遗留）：引擎拖拽不逐像素触发 onDrawingsChanged——
 *  仅当被拖水平线的价格相对基线/上次请求实际变化时请求一次广播（请求经宿主 rAF
 *  合帧，每帧至多一次）；价格未变（水平拖动/静止）不请求；提交时若本手势变价过，
 *  由调用方补一次同步广播保证精确末态。纯状态机：不依赖 canvas/DOM，可单测。 */
import type { Drawing } from './types';

/** 拖拽集合中首个水平线的当前价（广播门襟读数；无水平线/无价 = null） */
export function draggedHlinePrice(ids: readonly string[], list: readonly Drawing[]): number | null {
  for (const id of ids) {
    const d = list.find((z) => z.id === id);
    if (d?.type !== 'hline') continue;
    const p = d.points[0]?.price;
    if (typeof p === 'number' && Number.isFinite(p)) return p;
  }
  return null;
}

export class DragBroadcast {
  /** 已请求广播的价格（reset 时登记为基线；null = 被拖集合无水平线） */
  private price: number | null = null;
  /** 本手势是否请求过广播（价格实际变化过） */
  private requested = false;

  /** 新手势开始：登记被拖水平线的起始价为基线（无水平线 = null） */
  reset(baseline: number | null): void {
    this.price = baseline;
    this.requested = false;
  }

  /** 拖拽迁移：价格相对基线/上次请求实际变化 → true（调用方请求一次合帧广播） */
  onMove(price: number | null): boolean {
    if (price === null || price === this.price) return false;
    this.price = price;
    this.requested = true;
    return true;
  }

  /** 拖拽提交：本手势变价过 → true（调用方补一次同步广播；状态归零） */
  commit(): boolean {
    const requested = this.requested;
    this.price = null;
    this.requested = false;
    return requested;
  }
}
