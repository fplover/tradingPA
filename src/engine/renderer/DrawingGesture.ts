import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import { DrawingLayer } from '../drawing/DrawingLayer';
import { getToolDef, isConstrainableTool, type DrawingPoint, type DrawingTypeId } from '../drawing/types';
import { pixelToPoint, pointToPixel, type DrawContext } from '../drawing/drawDrawings';
import { detectVisibleSwing } from '../drawing/fibMath';
import { hitDrawings, type DrawingHit } from './hitTest';

/**
 * 画线手势（D 批次拆分③；架构映射：ChartRenderer 的画线放置/预览/拖拽状态机、
 * activeTool/placing/previewPoint/dragDrawing/pendingClone 字段与画线命中）。
 * 持有 DrawingLayer；放置/预览/整体与手柄拖拽/Shift 约束/Auto Fib 收敛于此。
 */

/** 画线手势宿主契约（ChartRenderer 实现；结构子集避免反向依赖） */
export interface DrawingHost {
  /** 主面板局部绘制上下文（坐标换算用） */
  drawingCtx(): DrawContext;
  /** 主面板局部 y 原点（拖拽换算固定主面板，与放置的当前面板语义分开） */
  mainPaneY(): number;
  readonly viewport: Viewport;
  /** 当前渲染序列（getter：砖块/HA 变换会整体替换） */
  displaySeries(): BarSeries;
  /** 图表区宽（getter：随画布尺寸变化） */
  chartW(): number;
  /** 画线锁定开关（命中守卫用；图表级配置） */
  drawingsLocked(): boolean;
  invalidate(): void;
  notifyDrawings(): void;
}

/** 拖拽画线：ids 为本次受动对象集合（单选=1；多选整体=全部选中；手柄=1） */
interface DrawingDrag {
  ids: string[];
  part: 'body' | 'handle';
  index: number;
  start: DrawingPoint;
  origins: Map<string, DrawingPoint[]>;
}

/** Ctrl+按下待克隆：首次移动超阈值才懒克隆（无移动的 Ctrl+点击 = 多选切换） */
interface PendingClone {
  id: string;
  part: 'body' | 'handle';
  index: number;
  start: DrawingPoint;
}

export class DrawingGesture {
  /** 画线图层（公开 API 的薄委托经此；选中/增删/撤销栈在 layer 内） */
  readonly layer = new DrawingLayer();

  private activeTool: DrawingTypeId | null = null;
  private placing: DrawingPoint[] = [];
  private previewPoint: DrawingPoint | null = null;
  private dragDrawing: DrawingDrag | null = null;
  private pendingClone: PendingClone | null = null;
  /** 画线悬停光标：body=move、handle=pointer（决策纯函数在 cursor.ts） */
  private hover = '';
  private toolFinishedCb: (() => void) | null = null;

  constructor(private host: DrawingHost) {}

  // ---------- 绘制与公开 API 读取 ----------

  get tool(): DrawingTypeId | null { return this.activeTool; }
  get placingPoints(): DrawingPoint[] { return this.placing; }
  get preview(): DrawingPoint | null { return this.previewPoint; }
  get hoverCursor(): string { return this.hover; }
  setHoverCursor(cursor: string): void { this.hover = cursor; }

  setToolFinishedCallback(cb: (() => void) | null): void {
    this.toolFinishedCb = cb;
  }

  /** 设置当前工具（null = 光标模式）：重置放置态 */
  setTool(tool: DrawingTypeId | null): void {
    this.activeTool = tool;
    this.placing = [];
    this.previewPoint = null;
    this.host.notifyDrawings();
    this.host.invalidate();
  }

  /** 完成路径类画线（双击/回车） */
  finishPlacing(): void {
    if (this.activeTool === 'path' && this.placing.length >= 2) {
      this.layer.add('path', this.placing);
    }
    this.placing = [];
    this.previewPoint = null;
    this.host.notifyDrawings();
    this.host.invalidate();
  }

  /** Esc：取消放置并退出多选（TV：Esc 取消当前操作并取消选择） */
  cancelPlacing(): void {
    this.placing = [];
    this.previewPoint = null;
    this.pendingClone = null;
    this.layer.select(null);
    this.host.notifyDrawings();
    this.host.invalidate();
  }

  /** 空白处点击：清空选中（进入平移拖拽的前置） */
  deselect(): void {
    this.layer.select(null);
  }

  /** 画布级画线命中（锁定态守卫 + 上下文装配；逐对象判定在 hitTest.ts） */
  hitAt(x: number, y: number, paneY: number): DrawingHit | null {
    if (this.host.drawingsLocked()) return null;
    return hitDrawings(this.layer.list(), x, y, paneY, this.host.drawingCtx());
  }

  /** 工具模式落点（1 点工具即落成；多点工具累积锚点，满点数落成） */
  place(x: number, y: number, paneY: number, shift: boolean): void {
    let pt = pixelToPoint(x, y - paneY, this.host.drawingCtx(), this.layer.magnetModeForDraw);
    // Auto Fib：无锚点点击——一次点击即按可见区间 swing 生成标准回撤对象
    if (this.activeTool === 'fib-auto') {
      const swing = this.detectSwingForAutoFib();
      if (swing) {
        this.layer.add('fib-auto', [swing.start, swing.end]);
        this.toolFinishedCb?.();
      }
      this.host.invalidate();
      return;
    }
    // B7：Shift 约束——新落点相对上一个锚点按主导轴锁轴（TV 肌肉记忆）
    if (shift && this.placing.length > 0 && isConstrainableTool(this.activeTool!)) {
      pt = this.constrainPoint(this.placing[this.placing.length - 1], x, y - paneY);
    }
    const def = getToolDef(this.activeTool!);
    if (def.points === 1) {
      this.layer.add(this.activeTool!, [pt]);
      this.host.invalidate();
      this.toolFinishedCb?.();
      return;
    }
    this.placing.push(pt);
    if (def.points > 0 && this.placing.length >= def.points) {
      this.layer.add(this.activeTool!, this.placing);
      this.placing = [];
      this.previewPoint = null;
      this.toolFinishedCb?.();
    }
    this.host.invalidate();
  }

  /** 命中画线后的按下：Ctrl/Meta = 待克隆；否则多选态下点已选中对象 = 整组拖拽 */
  beginDrag(x: number, y: number, paneY: number, hit: DrawingHit, button: number, ctrlOrMeta: boolean): void {
    if (button === 0 && ctrlOrMeta) {
      this.pendingClone = {
        id: hit.id,
        part: hit.part,
        index: hit.index,
        start: pixelToPoint(x, y - paneY, this.host.drawingCtx(), 'off'),
      };
      this.host.invalidate();
      return;
    }
    // 多选态下点击已选中对象 = 整组拖拽；否则单选该对象
    const groupDrag = hit.part === 'body' && this.layer.isSelected(hit.id) && this.layer.selectedIdList.length > 1;
    if (!groupDrag) this.layer.select(hit.id);
    const ids = groupDrag ? this.layer.selectedIdList : [hit.id];
    const origins = new Map<string, DrawingPoint[]>();
    for (const id of ids) {
      const dd = this.layer.list().find((z) => z.id === id);
      if (dd && !dd.locked) origins.set(id, dd.points.map((p) => ({ ...p })));
    }
    this.layer.beginHistory();
    this.dragDrawing = {
      ids: [...origins.keys()],
      part: hit.part,
      index: hit.index,
      start: pixelToPoint(x, y - paneY, this.host.drawingCtx(), 'off'),
      origins,
    };
    this.host.invalidate();
  }

  // ---------- 内部：拖拽换算 / Shift 约束 / Auto Fib ----------
  onPointerMove(x: number, y: number, paneY: number, shift: boolean): boolean {
    if (this.pendingClone) {
      // B7：Ctrl+拖动——首次移动超过 2px 阈值即懒克隆并进入克隆体拖拽（原对象不动）
      const dctx = this.host.drawingCtx();
      const sp = pointToPixel(this.pendingClone.start, dctx);
      if (Math.hypot(x - sp.x, y - paneY - sp.y) > 2) {
        const pc = this.pendingClone;
        this.pendingClone = null;
        const src = this.layer.list().find((d) => d.id === pc.id);
        if (src && !src.locked) {
          // 先快照再克隆：克隆 + 拖拽 = 单步撤销
          this.layer.beginHistory();
          const clone = this.layer.cloneDrawing(src.id)!;
          this.dragDrawing = {
            ids: [clone.id],
            part: pc.part,
            index: pc.index,
            start: pc.start,
            origins: new Map([[clone.id, clone.points.map((p) => ({ ...p }))]]),
          };
          this.updateDrawingDrag(x, y, shift);
        } else {
          this.host.invalidate();
        }
      }
      return true;
    }
    if (this.dragDrawing) {
      this.updateDrawingDrag(x, y, shift);
      return true;
    }
    if (this.activeTool && this.placing.length > 0) {
      let pt = pixelToPoint(x, y - paneY, this.host.drawingCtx(), this.layer.magnetModeForDraw);
      // B7：Shift 约束预览——与落点约束同规则（相对上一个锚点按主导轴锁轴）
      if (shift && isConstrainableTool(this.activeTool)) {
        pt = this.constrainPoint(this.placing[this.placing.length - 1], x, y - paneY);
      }
      this.previewPoint = pt;
      this.host.invalidate();
      return true;
    }
    return false;
  }

  /** 松柄：无移动的 Ctrl+点击 = 多选切换（TV）；移动过的已在 move 懒克隆并清空 */
  onPointerUp(): void {
    if (this.pendingClone) {
      this.layer.toggleSelect(this.pendingClone.id);
      this.host.notifyDrawings();
    }
    this.pendingClone = null;
    this.dragDrawing = null;
  }

  // ---------- 内部：拖拽换算 / Shift 约束 / Auto Fib ----------

  /** 拖拽画线：整体平移（单选/多选整组）或单手柄移动；Shift = 水平/垂直约束（按主导轴） */
  private updateDrawingDrag(x: number, y: number, shift: boolean): void {
    const drag = this.dragDrawing;
    if (!drag) return;
    const paneY = this.host.mainPaneY();
    const dctx = this.host.drawingCtx();
    const cur = pixelToPoint(x, y - paneY, dctx, 'off');
    // Shift 约束仅对线类工具生效（趋势线/射线/箭头/信息线/斐波那契家族）
    const constrain =
      shift && drag.ids.some((id) => isConstrainableTool(this.layer.list().find((d) => d.id === id)?.type ?? 'rect'));
    if (drag.part === 'body') {
      let dt = cur.time - drag.start.time;
      let dp = cur.price - drag.start.price;
      if (constrain) {
        const sp = pointToPixel(drag.start, dctx);
        if (Math.abs(x - sp.x) >= Math.abs(y - paneY - sp.y)) dp = 0;
        else dt = 0;
      }
      for (const [id, origin] of drag.origins) {
        this.layer.updatePoints(
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
      this.layer.updatePoints(drag.ids[0], pts);
    }
    this.host.invalidate();
  }

  /** Shift 约束：像素域按主导轴锁轴——|Δx| ≥ |Δy| 锁水平（价格固定），否则锁垂直（时间固定） */
  private constrainPoint(anchor: DrawingPoint, px: number, py: number): DrawingPoint {
    const dctx = this.host.drawingCtx();
    const a = pointToPixel(anchor, dctx);
    const magnet = this.layer.magnetModeForDraw;
    if (Math.abs(px - a.x) >= Math.abs(py - a.y)) return pixelToPoint(px, a.y, dctx, magnet);
    return pixelToPoint(a.x, py, dctx, magnet);
  }

  /** Auto Fib 摆动检测：可见 bar 区间的最高/最低点对（不足则 null，本次点击不放置） */
  private detectSwingForAutoFib(): { start: DrawingPoint; end: DrawingPoint } | null {
    const chartW = this.host.chartW();
    const from = Math.max(0, Math.floor(this.host.viewport.first));
    const to = Math.min(this.host.displaySeries().length - 1, Math.ceil(this.host.viewport.xToIndex(chartW)));
    return detectVisibleSwing(this.host.displaySeries().raw(), from, to);
  }
}
