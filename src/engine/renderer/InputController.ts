import type { CanvasManager } from '../canvas/CanvasManager';
import type { Crosshair } from '../crosshair/Crosshair';
import type { Viewport } from '../viewport/Viewport';
import type { BarSeries } from '@/data/BarSeries';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { PaneButtonRects } from './drawAxes';
import type { StudyLegendRect } from './drawCrosshair';
import { hitPaneButtons, type PaneButtonHit } from './hitTest';
import type { PanZoomPane, PanZoomGesture, PanZoomHost } from './PanZoomGesture';
import type { DrawingGesture, DrawingHost } from './DrawingGesture';
import type { TradePane, TradeGesture, TradeHost } from './TradeGesture';
import type { HoverController, HoverHost } from './HoverController';

/**
 * 输入控制器（D 批次拆分③；架构映射：ChartRenderer 输入区的 bind/unbind 与
 * onPointerDown/Move/Up/Leave/Wheel/DoubleClick/ContextMenu 路由骨架）。
 * 只做事件绑定与路由：按命中与交互态分派到三个手势，不写手势分支逻辑；
 * 悬停态/十字光标/光标决策在 HoverController。
 */

/** 输入层面板视图（ChartRenderer.PaneState 的结构子集，避免反向依赖） */
export interface InputPane extends PanZoomPane, TradePane {
  id: string;
  indicators: IndicatorInstance[];
  headerBtns: PaneButtonRects | null;
}

/** 输入层宿主契约（ChartRenderer 实现；含三手势与 HoverController 所需子集 +
 *  事件路由所需画布与状态）。commit⑤ 起由 ChartController 适配 ChartState 提供同构实现。 */
export interface InputHost extends PanZoomHost, DrawingHost, TradeHost, HoverHost {
  readonly manager: CanvasManager;
  readonly viewport: Viewport;
  readonly crosshair: Crosshair;
  /** 面板数组（getter：指标增删会整体替换） */
  panes(): readonly InputPane[];
  paneAt(y: number): InputPane;
  /** 当前渲染序列（getter：图表类型变换会整体替换） */
  displaySeries(): BarSeries;
  invalidate(): void;

  // ---- 图表级输入态（宿主持有，draw() 同读；setter 供路由写） ----
  /** 点击即选中面板（TV 行为） */
  selectPane(id: string): void;
  /** 研究图例行命中区（drawLegendBlock 回写，悬停层读取） */
  studyRects(): readonly StudyLegendRect[];
  /** 复盘位置 index（null = 非回放） */
  replayIndex(): number | null;

  // ---- 复合动作（宿主侧多步效果） ----
  /** 选择K线落点：clamp 有效 bar + 回调 + 退出选择模式 */
  barSelected(rawIndex: number): void;
  /** 确保面板价格轴尺寸与自适应范围最新（rAF 暂停时右键换算也正确） */
  ensurePaneScaleReady(pane: InputPane): void;
  /** 完成路径类画线放置（双击/回车；公开 API） */
  finishPlacing(): void;
  /** 联动：发布视口提交 */
  publishViewport(): void;

  // ---- 回调读取（null = 未注册；与原 ChartRenderer 字段同语义） ----
  studyActionCb(): ((action: 'hide' | 'settings' | 'remove', uid: string) => void) | null;
  paneActionCb(): ((action: 'settings' | 'remove', indicatorId: string) => void) | null;
  chartClickCb(): ((price: number, time: number, clientX: number, clientY: number) => void) | null;
  contextMenuCb(): ((price: number, time: number, clientX: number, clientY: number) => void) | null;
  legendMenuCb(): ((x: number, y: number) => void) | null;
  drawingMenuCb(): ((id: string, x: number, y: number) => void) | null;
  drawingSettingsCb(): ((id: string) => void) | null;
  priceLineDblClickCb(): (() => void) | null;
}

export class InputController {
  constructor(
    private host: InputHost,
    private panzoom: PanZoomGesture,
    private drawing: DrawingGesture,
    private trade: TradeGesture,
    private hover: HoverController,
  ) {}

  /** 事件监听表（bind/unbind 共用，保证成对；处理器按窄事件类型书写，入表转 EventListener） */
  private listeners(): Array<[string, EventListener, AddEventListenerOptions?]> {
    return [
      ['pointerdown', this.onPointerDown as EventListener],
      ['pointermove', this.onPointerMove as EventListener],
      ['pointerup', this.onPointerUp as EventListener],
      ['pointercancel', this.onPointerUp as EventListener],
      ['pointerleave', this.onPointerLeave as EventListener],
      ['dblclick', this.onDoubleClick as EventListener],
      ['contextmenu', this.onContextMenu as EventListener],
      ['wheel', this.onWheel as EventListener, { passive: false }],
    ];
  }

  bind(canvas: HTMLCanvasElement): void {
    for (const [type, handler, opts] of this.listeners()) canvas.addEventListener(type, handler, opts);
  }

  unbind(canvas: HTMLCanvasElement): void {
    for (const [type, handler] of this.listeners()) canvas.removeEventListener(type, handler);
  }

  private toLocal(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.host.manager.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** 面板头部按钮命中（设置/移除，仅选中指标面板绘制了按钮） */
  private hitPaneButtonAt(x: number, y: number, pane: InputPane): PaneButtonHit | null {
    if (pane.indicators.length === 0) return null;
    return hitPaneButtons(x, y, pane.y, pane.headerBtns, pane.indicators[0].def.id);
  }

  private onPointerDown = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    const inPriceAxis = x > this.host.chartW();
    const inTimeAxis = y > this.host.chartH();
    this.panzoom.resetMoveFlag();
    this.host.manager.canvas.setPointerCapture(e.pointerId);
    const sep = !inPriceAxis && !inTimeAxis && e.button === 0 ? this.host.separatorIndexAt(y) : null;
    if (sep !== null) {
      this.panzoom.beginResize(sep, y);
      return;
    }
    if (inPriceAxis) {
      const pane = this.host.paneAt(y);
      // 点击“自动”按钮 → 恢复自动适配
      if (this.panzoom.hitAutoButton(x, y, pane)) return;
      this.panzoom.beginPriceDrag(y);
      return;
    }
    if (inTimeAxis) return;
    const pane = this.host.paneAt(y);
    // 选择K线模式：点击任意位置完成选择，预览线与蒙层即消失
    if (this.host.barSelectMode()) {
      this.host.barSelected(Math.round(this.host.viewport.xToIndex(x)));
      return;
    }
    if (this.drawing.tool) {
      this.drawing.place(x, y, pane.y, e.shiftKey);
      return;
    }
    // 面板头部按钮（设置/移除指标）优先于画线/交易命中
    const btnHit = this.hitPaneButtonAt(x, y, pane);
    if (btnHit) {
      this.host.paneActionCb()?.(btnHit.action, btnHit.indicatorId);
      return;
    }
    // 点击即选中面板（TV 行为）
    this.host.selectPane(pane.id);
    const hit = this.drawing.hitAt(x, y, pane.y);
    if (hit) {
      // B7：Ctrl+按下 = 待克隆；无移动的 Ctrl+点击 = 多选切换
      this.drawing.beginDrag(x, y, pane.y, hit, e.button, e.ctrlKey || e.metaKey);
      return;
    }
    // 交易可视化命中：挂单线拖动改价 / 撤单 / 持仓详情块拖动设 TP-SL
    if (this.trade.onPointerDown(x, y, pane)) return;
    this.drawing.deselect();
    this.panzoom.beginPan(e.clientX, e.clientY);
    this.host.crosshair.clear();
    this.host.invalidate();
  };

  private onPointerMove = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    if (this.panzoom.resizing) {
      this.panzoom.resizeTo(y);
      return;
    }
    if (this.panzoom.panning) {
      this.panzoom.panTo(e.clientX, e.clientY, y);
      return;
    }
    if (this.panzoom.pricePanning) {
      this.panzoom.priceDragTo(y);
      return;
    }
    const paneY = this.host.paneAt(y).y;
    if (this.drawing.onPointerMove(x, y, paneY, e.shiftKey)) return;
    if (this.trade.dragging) {
      this.trade.dragTo(y);
      return;
    }
    this.hover.updateHoverCursor(x, y);
    this.hover.update(x, y);
  };

  private onPointerUp = (e: PointerEvent) => {
    // TV：中键点击研究图例行 = 移除该研究
    if (e.button === 1) {
      const midStudyUid = this.hover.takeStudyUid();
      if (midStudyUid) {
        this.host.studyActionCb()?.('remove', midStudyUid);
        return;
      }
    }
    const studyBtn = this.hover.hoveredStudyBtn;
    const studyUid = this.hover.hoveredStudyUid;
    this.hover.clearStudyBtn();
    const movedFar = this.panzoom.consumeMoveFlag();
    if (studyBtn !== null && studyUid && !movedFar) {
      this.host.studyActionCb()?.(studyBtn === 0 ? 'hide' : studyBtn === 1 ? 'settings' : 'remove', studyUid);
    }
    this.drawing.onPointerUp();
    this.panzoom.end();
    this.trade.end();
    this.host.publishViewport();
    if (this.host.manager.canvas.hasPointerCapture(e.pointerId)) {
      this.host.manager.canvas.releasePointerCapture(e.pointerId);
    }
  };

  private onPointerLeave = () => {
    this.host.crosshair.clear();
    this.hover.clear();
    this.trade.setHoverCursor(false);
    this.host.invalidate();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { x, y } = this.toLocal(e);
    this.panzoom.wheelZoom(x, y, e.deltaY, e.ctrlKey || e.metaKey);
  };

  private onDoubleClick = (e: MouseEvent) => {
    const { x, y } = this.toLocal(e);
    // 双击价格轴 → 恢复该面板自动适配
    if (x > this.host.chartW()) {
      this.host.paneAt(y).manual = false;
      this.host.invalidate();
      return;
    }
    // 双击最新价线（±4px 命中区）→ 打开图表设置（TV 行为）
    const main = this.host.panes()[0];
    const lastBar = this.host.displaySeries().last;
    if (lastBar && y >= main.y && y < main.y + main.height) {
      const lineY = main.priceScale.priceToY(lastBar.close);
      if (Math.abs(y - main.y - lineY) <= 4) {
        this.host.priceLineDblClickCb()?.();
        return;
      }
    }
    // 双击画线 → 打开画线设置（TV 行为）
    const pane = this.host.paneAt(y);
    const dHit = this.drawing.hitAt(x, y, pane.y);
    if (dHit) {
      this.host.drawingSettingsCb()?.(dHit.id);
      return;
    }
    this.host.finishPlacing();
  };

  /** 右键：禁默认菜单；回放中在空白处右键 → 弹出下单浮窗（左键保留拖动），
   *  非回放时 → 交给上层弹图表上下文菜单 */
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const { x, y } = this.toLocal(e);
    if (x < 0 || x > this.host.chartW() || y < 0 || y > this.host.chartH()) return;
    const pane = this.host.paneAt(y);

    const chartClick = this.host.chartClickCb();
    const replayIndex = this.host.replayIndex();
    if (replayIndex !== null && chartClick) {
      // 命中交易可视化/画线时不弹下单
      if (this.trade.hitAt(x, y, pane)) return;
      if (this.drawing.hitAt(x, y, pane.y)) return;
      this.host.ensurePaneScaleReady(pane);
      const price = pane.priceScale.yToPrice(y - pane.y);
      const bar = this.host.displaySeries().barAt(replayIndex);
      chartClick(price, bar?.time ?? Date.now(), e.clientX, e.clientY);
      return;
    }

    const contextMenu = this.host.contextMenuCb();
    if (!contextMenu) return;
    // 右键命中画线 → 画线上下文菜单（设置/移除/视觉顺序）
    const dHit = this.drawing.hitAt(x, y, pane.y);
    if (dHit) {
      this.host.drawingMenuCb()?.(dHit.id, e.clientX, e.clientY);
      return;
    }
    // 图例区（商品行或研究行）右键 → 图例菜单（TV legend_context_menu）
    const inStudyRow = this.host.studyRects().some((r) => x >= r.x && x <= r.btnX + 48 && y >= r.y && y <= r.y + r.h);
    if (y <= 24 || inStudyRow) {
      this.host.legendMenuCb()?.(e.clientX, e.clientY);
      return;
    }
    this.host.ensurePaneScaleReady(pane);
    const price = pane.priceScale.yToPrice(y - pane.y);
    const idx = Math.round(this.host.viewport.xToIndex(x));
    const bar = this.host.displaySeries().barAt(idx);
    contextMenu(price, bar?.time ?? Date.now(), e.clientX, e.clientY);
  };
}
