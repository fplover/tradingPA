import type { PriceScale } from '../scale/PriceScale';
import type { Crosshair } from '../crosshair/Crosshair';
import type { Viewport } from '../viewport/Viewport';
import type { BarSeries } from '@/data/BarSeries';
import type { StudyLegendRect } from './drawCrosshair';
import { decideCursor, hoverStudyRow } from './cursor';
import type { DrawingGesture } from './DrawingGesture';
import type { TradeGesture } from './TradeGesture';

/**
 * 悬停控制器（D 批次拆分③；架构映射：ChartRenderer updateCrosshair / updateHoverCursor
 * 与研究图例行悬停态）。无手势时每 pointermove 驱动：研究行/画线/交易命中态、
 * 十字光标定位、联动发布时间与光标决策。studyRects 由 draw() 回写、此处读取
 * （渲染→输入的既有数据流，原样保留）。
 */

/** 悬停层面板视图（ChartRenderer.PaneState 的结构子集，避免反向依赖） */
export interface HoverPane {
  id: string;
  y: number;
  height: number;
  priceScale: PriceScale;
}

/** HoverController 宿主契约（ChartRenderer 实现；InputHost 是其超集） */
export interface HoverHost {
  /** 画布（光标样式写入用） */
  readonly canvas: HTMLCanvasElement;
  readonly viewport: Viewport;
  readonly crosshair: Crosshair;
  paneAt(y: number): HoverPane;
  /** 当前渲染序列（getter：图表类型变换会整体替换） */
  displaySeries(): BarSeries;
  chartW(): number;
  chartH(): number;
  separatorIndexAt(y: number): number | null;
  /** 研究图例行命中区（drawLegendBlock 回写） */
  studyRects(): readonly StudyLegendRect[];
  setHoveredPane(id: string): void;
  setSelectPreviewX(x: number | null): void;
  barSelectMode(): boolean;
  /** 联动：发布本地十字光标时间 */
  publishCrosshairTime(time: number | null): void;
  invalidate(): void;
}

export class HoverController {
  /** 研究图例行悬停 uid（图例高亮 + 中键移除 + 按钮点击判定；draw() 同读） */
  private studyUid: string | null = null;
  /** 研究图例行悬停按钮 index（眼睛/设置/移除） */
  private studyBtn: number | null = null;

  constructor(
    private host: HoverHost,
    private drawing: DrawingGesture,
    private trade: TradeGesture,
  ) {}

  get hoveredStudyUid(): string | null {
    return this.studyUid;
  }

  /** 研究行悬停按钮 index（onPointerUp 按钮点击判定用） */
  get hoveredStudyBtn(): number | null {
    return this.studyBtn;
  }

  /** 读取并清除悬停 uid（中键点击研究行 = 移除） */
  takeStudyUid(): string | null {
    const uid = this.studyUid;
    this.studyUid = null;
    return uid;
  }

  /** 清除悬停按钮 index（onPointerUp 点击消费后） */
  clearStudyBtn(): void {
    this.studyBtn = null;
  }

  /** 离开画布：清除全部悬停态 */
  clear(): void {
    this.studyUid = null;
    this.studyBtn = null;
  }

  /** TV 光标语义：面板分隔条与价格轴 ns-resize，时间轴 ew-resize，可交互元素 pointer。
   *  决策纯函数在 cursor.ts；此处只装配输入、写 DOM（带 dirty check） */
  updateHoverCursor(x: number, y: number): void {
    const cursor = decideCursor({
      x,
      y,
      chartRight: this.host.chartW(),
      chartBottom: this.host.chartH(),
      separatorIndex: this.host.separatorIndexAt(y),
      studyHoverBtn: this.studyBtn,
      drawingHoverCursor: this.drawing.hoverCursor,
      tradeHover: this.trade.hoverCursor,
    });
    const canvas = this.host.canvas;
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }

  /** 悬停更新：研究行/画线/交易命中态 + 十字光标定位 + 联动发布时间 */
  update(x: number, y: number): void {
    const chartW = this.host.chartW();
    const chartH = this.host.chartH();
    if (x < 0 || x > chartW || y < 0 || y > chartH) {
      this.host.crosshair.clear();
      this.host.setSelectPreviewX(null);
      this.host.publishCrosshairTime(null);
      this.trade.setHoverCursor(false);
      this.updateHoverCursor(x, y);
      this.host.invalidate();
      return;
    }
    // 选择K线模式：预览线跟随光标（不显示十字光标）
    if (this.host.barSelectMode()) {
      this.host.crosshair.clear();
      this.host.setSelectPreviewX(x);
      this.host.invalidate();
      return;
    }
    // 研究图例行悬停：记录命中行与按钮区（眼睛/设置/移除）
    this.studyUid = null;
    this.studyBtn = null;
    const row = hoverStudyRow(this.host.studyRects(), x, y);
    if (row) {
      this.studyUid = row.uid;
      this.studyBtn = row.btn;
    }
    const pane = this.host.paneAt(y);
    this.host.setHoveredPane(pane.id);
    // 画线悬停光标：顶点手柄 pointer、线体 move
    const dHit = this.drawing.hitAt(x, y, pane.y);
    this.drawing.setHoverCursor(dHit ? (dHit.part === 'handle' ? 'pointer' : 'move') : '');
    const hit = this.trade.hitAt(x, y, pane);
    this.trade.setHoverCursor(hit !== null);
    const idx = Math.round(this.host.viewport.xToIndex(x));
    const bar = this.host.displaySeries().barAt(idx);
    if (bar) {
      const price = pane.priceScale.yToPrice(y - pane.y);
      this.host.crosshair.set(x, y, idx, bar.time, price);
      this.host.publishCrosshairTime(bar.time);
    } else {
      this.host.crosshair.clear();
      this.host.publishCrosshairTime(null);
    }
    this.host.invalidate();
  }
}
