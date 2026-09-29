import type { PriceScale } from '../scale/PriceScale';
import type { Viewport } from '../viewport/Viewport';

/**
 * 平移/价格拖拽/面板缩放手势（D 批次拆分③；架构映射：ChartRenderer 的
 * dragging/priceDragging/paneResize 状态机、resizePane、onWheel 缩放分支）。
 * 只持有交互态与状态迁移；面板几何/布局/重绘/联动广播经宿主契约向下调用。
 */

/** 面板最小形状（ChartRenderer.PaneState 的结构子集，避免反向依赖） */
export interface PanZoomPane {
  y: number;
  height: number;
  heightRatio: number;
  priceScale: PriceScale;
  /** 手动价格域：上下拖动/价格轴拖动后锁定，不再自动适配 */
  manual: boolean;
  /** “自动”按钮命中区（面板局部坐标） */
  autoBtn: { x: number; y: number; w: number; h: number } | null;
}

/** PanZoomGesture 宿主契约（ChartRenderer 实现；commit⑤ 起由 ChartController 适配 ChartState） */
export interface PanZoomHost {
  readonly viewport: Viewport;
  /** 面板数组（getter：指标增删会整体替换，不能快照） */
  panes(): readonly PanZoomPane[];
  /** y → 所在面板（输入路由共用，判定留在宿主） */
  paneAt(y: number): PanZoomPane;
  /** 面板高度重算（分隔条拖拽后布局变化） */
  layout(): void;
  /** 图表区高度（画布高 - 时间轴高；分隔条缩放预算用） */
  chartH(): number;
  invalidate(): void;
  /** 视口提交广播（滚轮缩放即时发布；拖拽松柄由 InputController 发布） */
  publishViewport(): void;
}

export class PanZoomGesture {
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private priceDragging = false;
  private priceYAtDragStart = 0;
  private paneResizeIndex: number | null = null;
  private paneResizeStartY = 0;
  private paneResizeStartHeight = 0;
  /** 本次按下期间指针是否移动超阈值（研究行按钮点击 vs 拖动的判据） */
  private movedFar = false;

  constructor(private host: PanZoomHost) {}

  // ---------- 路由判据（InputController 用） ----------

  get resizing(): boolean {
    return this.paneResizeIndex !== null;
  }

  get panning(): boolean {
    return this.dragging;
  }

  get pricePanning(): boolean {
    return this.priceDragging;
  }

  /** 读取并清除“移动超阈值”标记（onPointerUp 研究行按钮判定用） */
  consumeMoveFlag(): boolean {
    const v = this.movedFar;
    this.movedFar = false;
    return v;
  }

  /** 按下伊始重置移动标记（onPointerDown 入口） */
  resetMoveFlag(): void {
    this.movedFar = false;
  }

  // ---------- 按下：进入各拖拽态 ----------

  /** 面板分隔条按下（命中判定由调用方做） */
  beginResize(index: number, y: number): void {
    this.paneResizeIndex = index;
    this.paneResizeStartY = y;
    this.paneResizeStartHeight = this.host.panes()[index].height;
  }

  /** 价格轴按下：纵向拖拽改价格域 */
  beginPriceDrag(y: number): void {
    this.priceDragging = true;
    this.priceYAtDragStart = y;
  }

  /** 图表空白处按下：视口平移 + 价格域纵向平移 */
  beginPan(clientX: number, clientY: number): void {
    this.dragging = true;
    this.lastPointerX = clientX;
    this.lastPointerY = clientY;
  }

  /** 价格轴“自动”按钮命中 → 恢复自动适配（未命中返回 false） */
  hitAutoButton(x: number, y: number, pane: PanZoomPane): boolean {
    const b = pane.autoBtn;
    if (!b) return false;
    const ly = y - pane.y;
    if (x >= b.x && x <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) {
      pane.manual = false;
      this.host.invalidate();
      return true;
    }
    return false;
  }

  // ---------- 移动：各拖拽态推进 ----------

  /** 分隔条拖拽：从下一面板借比例，二者都设下限 */
  resizeTo(y: number): void {
    const index = this.paneResizeIndex;
    if (index === null) return;
    const panes = this.host.panes();
    const pane = panes[index];
    const next = panes[index + 1];
    if (!pane || !next) return;
    const chartH = this.host.chartH();
    const total = panes.reduce((s, p) => s + p.heightRatio, 0);
    const delta = y - this.paneResizeStartY;
    const minH = 48;
    const newHeight = Math.min(Math.max(this.paneResizeStartHeight + delta, minH), chartH - minH * panes.length);
    const newRatio = (newHeight * total) / chartH;
    const taken = newRatio - pane.heightRatio;
    if (next.heightRatio - taken < 0.08 || pane.heightRatio + taken < 0.08) return;
    pane.heightRatio += taken;
    next.heightRatio -= taken;
    this.host.layout();
    this.host.invalidate();
  }

  /** 平移拖拽：横向移视口，纵向移价格域（上下拖动锁定 manual） */
  panTo(clientX: number, clientY: number, y: number): void {
    const dx = clientX - this.lastPointerX;
    const dy = clientY - this.lastPointerY;
    if (Math.abs(dx) + Math.abs(dy) > 3) this.movedFar = true;
    this.lastPointerX = clientX;
    this.lastPointerY = clientY;
    const vs = this.host.viewport;
    vs.panByBars(-dx / vs.spacing);
    const pane = this.host.paneAt(y);
    const { min, max } = pane.priceScale.range;
    const span = max - min;
    const shift = (dy / Math.max(1, pane.height)) * span;
    pane.manual = true; // 上下拖动 → 锁定价格域
    pane.priceScale.shift(shift);
    this.host.invalidate();
  }

  /** 价格轴拖拽：纵向改价格域（与平移的纵向同规则，符号相反） */
  priceDragTo(y: number): void {
    const dy = y - this.priceYAtDragStart;
    const pane = this.host.paneAt(y);
    const { min, max } = pane.priceScale.range;
    const span = max - min;
    const shift = -(dy / Math.max(1, pane.height)) * span;
    pane.manual = true;
    pane.priceScale.shift(shift);
    this.host.invalidate();
  }

  /** 滚轮：Ctrl/Meta = 价格轴缩放，否则视口缩放（以指针 x 为锚） */
  wheelZoom(x: number, y: number, deltaY: number, mod: boolean): void {
    const factor = deltaY > 0 ? 1.1 : 0.9;
    if (mod) {
      const pane = this.host.paneAt(y);
      const { min, max } = pane.priceScale.range;
      const mid = (min + max) / 2;
      const half = ((max - min) / 2) * factor;
      pane.manual = true; // 价格轴缩放同样锁定
      pane.priceScale.setRange(mid - half, mid + half);
    } else {
      this.host.viewport.zoomAt(x, factor);
    }
    this.host.publishViewport();
    this.host.invalidate();
  }

  // ---------- 松柄：清空全部态 ----------

  end(): void {
    this.dragging = false;
    this.priceDragging = false;
    this.paneResizeIndex = null;
  }
}
