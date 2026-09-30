/** TV 式选择工具栏状态机（引擎侧）：选中画线/指标 → 弹窗锚点信息推送。
 *  DOM 渲染在 React 层（并行代理约定）：引擎只推 (kind, id, x, y)，x/y 为画布 CSS 像素
 *  锚点——选中对象 bbox 中心 x（钳制 [60, chartW-60]）、顶部 y - 12。
 *  画线与指标选中互斥单选；两者都空 → null；同值不重复推送（不扰 React 重渲染）。 */
import type { Drawing, DrawingPoint } from '../drawing/types';

export interface SelectionPopupInfo {
  kind: 'drawing' | 'indicator';
  id: string;
  x: number;
  y: number;
}

/** 像素范围盒（画布坐标；y 为面板局部坐标，锚点 y = y0 - 12） */
export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 锚点 x 距画布左右缘的最小留白（工具栏半宽预算，防工具栏探出画布） */
const POPUP_MARGIN = 60;

function popupAnchor(cx: number, topY: number, chartW: number): { x: number; y: number } {
  const hi = Math.max(POPUP_MARGIN, chartW - POPUP_MARGIN); // 窄画布防御：下限不让越界反向
  return { x: Math.min(Math.max(cx, POPUP_MARGIN), hi), y: topY - 12 };
}

function sameInfo(a: SelectionPopupInfo | null, b: SelectionPopupInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id && a.x === b.x && a.y === b.y;
}

export class SelectionPopupTracker {
  private drawing: SelectionPopupInfo | null = null;
  private study: SelectionPopupInfo | null = null;
  private last: SelectionPopupInfo | null = null;
  private listeners = new Set<(info: SelectionPopupInfo | null) => void>();

  /** 画线选中变化（ids = 多选集合、末尾为主锚；bbox = 选中锚点像素范围；空选中传 [] / null） */
  setDrawingSelection(ids: readonly string[], bbox: BBox | null, chartW: number): void {
    const next: SelectionPopupInfo | null =
      ids.length > 0 && bbox
        ? { kind: 'drawing', id: ids[ids.length - 1], ...popupAnchor((bbox.x0 + bbox.x1) / 2, bbox.y0, chartW) }
        : null;
    this.drawing = next;
    if (next) this.study = null; // 互斥单选
    this.emit();
  }

  /** 指标选中变化（bbox = 该指标可见 defined 值的像素范围；清除传 null / null） */
  setStudySelection(uid: string | null, bbox: BBox | null, chartW: number): void {
    const next: SelectionPopupInfo | null =
      uid && bbox ? { kind: 'indicator', id: uid, ...popupAnchor((bbox.x0 + bbox.x1) / 2, bbox.y0, chartW) } : null;
    this.study = next;
    if (next) this.drawing = null; // 互斥单选
    this.emit();
  }

  /** 订阅工具栏信息变化（返回退订函数） */
  subscribe(cb: (info: SelectionPopupInfo | null) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** 当前工具栏信息（画线优先于指标；双空 → null） */
  get current(): SelectionPopupInfo | null {
    return this.drawing ?? this.study;
  }

  /** 变化才推送（同值短路；双空 → null） */
  private emit(): void {
    const info = this.current;
    if (sameInfo(info, this.last)) return;
    this.last = info;
    for (const cb of this.listeners) cb(info);
  }
}

/** 选中画线锚点像素 bbox（各锚点 min/max；无锚点 → null） */
export function drawingBBox(
  drawings: readonly Drawing[],
  toPixel: (p: DrawingPoint) => { x: number; y: number },
): BBox | null {
  let box: BBox | null = null;
  for (const d of drawings) {
    for (const p of d.points) {
      const px = toPixel(p);
      if (!box) box = { x0: px.x, y0: px.y, x1: px.x, y1: px.y };
      else {
        if (px.x < box.x0) box.x0 = px.x;
        if (px.y < box.y0) box.y0 = px.y;
        if (px.x > box.x1) box.x1 = px.x;
        if (px.y > box.y1) box.y1 = px.y;
      }
    }
  }
  return box;
}

/** 画线图层选中 → tracker 一步同步（DrawingGesture / ChartController 共用；
 *  bbox = 选中锚点像素范围，像素换算由调用方按自己的坐标上下文注入） */
export function syncDrawingSelection(
  popup: SelectionPopupTracker,
  layer: { list(): readonly Drawing[]; selectedIdList: readonly string[] },
  toPixel: (p: DrawingPoint) => { x: number; y: number },
  chartW: number,
): void {
  const ids = layer.selectedIdList;
  if (ids.length === 0) {
    popup.setDrawingSelection(ids, null, chartW); // 空选中：免遍历全表
    return;
  }
  const box = drawingBBox(
    layer.list().filter((d) => ids.includes(d.id)),
    toPixel,
  );
  popup.setDrawingSelection(ids, box, chartW);
}
