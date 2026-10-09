import type { CanvasManager } from '../canvas/CanvasManager';
import type { Viewport } from '../viewport/Viewport';
import type { Crosshair } from '../crosshair/Crosshair';
import { isMarketOpen } from '@/data/marketHours';
import { getToolDef } from '../drawing/types';
import { drawDrawings, type DrawContext } from '../drawing/drawDrawings';
import { drawTrading } from './drawTrading';
import { drawWatermark, watermarkText } from './drawWatermark';
import { drawTimeAxis, drawBorders } from './drawAxes';
import {
  drawCrosshair,
  drawLegendBlock,
  type LegendInfo,
  type LegendStudyValues,
  type LegendDrawInfo,
} from './drawCrosshair';
import { indicatorValuesAt } from './drawIndicator';
import { AXIS_HEIGHT, type ChartState } from './ChartState';
import { chartAreaOffsetX, chartAreaWidth } from './chartPanes';
import type { SyncBridge } from './SyncBridge';
import type { DrawingGesture } from './DrawingGesture';
import type { TradeGesture } from './TradeGesture';
import type { PaneRenderer } from './PaneRenderer';
import type { AutoscaleOptions } from './autoscale';
import { theme, TV_FONT } from '../theme';

/**
 * 渲染管线（D 批次拆分④；架构映射：ChartRenderer draw() 帧编排）。
 * 一帧的顺序：清屏 → layout → 逐面板（PaneRenderer）→ 分隔线 → 时间轴/边框 →
 * 画线/交易/放置预览 → 十字光标 → 图例 → 联动参考线 → 选线预览。
 * 状态经 ChartState 读取，画布/联动/手势经宿主契约访问。
 */

/** RenderPipeline 宿主契约（ChartController 提供同构实现） */
export interface RenderHost {
  readonly manager: CanvasManager;
  readonly viewport: Viewport;
  readonly crosshair: Crosshair;
  /** 图表级状态（面板/配置/序列/交互态） */
  readonly state: ChartState;
  /** 图例信息（setLegend 整体替换，getter 注入） */
  legend(): LegendInfo;
  readonly sync: SyncBridge;
  readonly drawing: DrawingGesture;
  readonly trade: TradeGesture;
  /** 主面板局部绘制上下文（画线坐标换算） */
  drawingCtx(): DrawContext;
  /** 收盘倒计时文本（null = 不显示；墙钟由编排层每帧取一次） */
  countdownText(now: number): string | null;
  /** 帧耗时回写（性能监控与测试） */
  setLastFrameMs(ms: number): void;
  /** 研究图例行悬停 uid（图例高亮；悬停层持有） */
  hoveredStudyUid(): string | null;
}

export class RenderPipeline {
  constructor(
    private host: RenderHost,
    private panes: PaneRenderer,
  ) {}

  draw(): void {
    const t0 = performance.now();
    const now = Date.now(); // 倒计时用墙钟（纪元毫秒），与 bar time 同时钟
    const ctx = this.host.manager.context;
    const w = this.host.manager.width;
    const h = this.host.manager.height;
    const st = this.host.state;

    this.host.manager.beginFrame();
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    if (st.displaySeries.length === 0) {
      this.host.setLastFrameMs(performance.now() - t0);
      return;
    }
    st.layout(h - AXIS_HEIGHT);

    const { from, to } = st.visibleRange();
    if (to < from) {
      this.host.setLastFrameMs(performance.now() - t0);
      return;
    }

    const legend = this.host.legend();
    const axisPos = st.priceAxisPos;
    const hour12 = st.timeHour12;
    // 图表区几何随价格轴侧：right=轴在右（x0=0）、left=轴在左（x0=轴宽）、none=全宽
    const chartW = chartAreaWidth(w, axisPos);
    const x0 = chartAreaOffsetX(axisPos);
    const autoscaleOpts: AutoscaleOptions = {
      autoScaleOn: st.autoScaleOn,
      logScale: st.logScale,
      timeframeId: legend.timeframeId,
    };
    const countdownText = this.host.countdownText(now);
    for (const pane of st.panes) {
      // compare 随 legend 每帧下发（P2-D）：PaneRenderer 主价格面板绘归一化叠加，
      // 图例第二行由下方 drawLegendBlock 读同一 legend.compare 渲染
      this.panes.draw(ctx, pane, from, to, autoscaleOpts, countdownText, legend.compare);
    }

    // 画布水印（P2 画布级特性）：主价格面板居中「代码 · 周期」。开关走 ChartState
    // 既有 watermarkVisible（ChartController.watermarkOn 同源），默认关——关闭时
    // 本帧路径零新增 ctx 状态变更，黄金截图零 diff。置于面板内容之上、画线/交易/
    // 光标层之下：低透明度 + 主题色，不干扰行情
    if (st.watermarkVisible) {
      const wmPane = st.panes[0];
      ctx.save();
      ctx.translate(x0, wmPane.y);
      drawWatermark(ctx, watermarkText(legend), { chartW, chartH: wmPane.height });
      ctx.restore();
    }

    // 面板分隔线：各副图面板顶边（贯穿含数值轴的全宽，TV 风格）
    ctx.strokeStyle = theme.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let pi = 1; pi < st.panes.length; pi++) {
      const sy = Math.round(st.panes[pi].y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // 共享时间轴 + 边框 + 十字光标（全画布坐标；时间轴/边框/光标随轴侧偏移）
    const mainGeo = { chartW, chartH: h - AXIS_HEIGHT };
    drawTimeAxis(ctx, st.displaySeries, this.host.viewport, mainGeo, axisPos, hour12);
    if (st.bordersVisible) drawBorders(ctx, mainGeo, axisPos);

    // 画线层（主面板局部坐标：随图表区左边界偏移，左轴时整体右移一个轴宽）
    const main = st.panes[0];
    ctx.save();
    ctx.translate(x0, main.y);
    if (!st.drawingsHidden) {
      const sel = this.host.drawing.layer.selectedIdList;
      const primary = sel.length > 0 ? sel[sel.length - 1] : null;
      drawDrawings(
        ctx,
        this.host.drawing.layer.list(),
        primary,
        this.host.drawingCtx(),
        legend.decimals,
        sel.slice(0, -1),
      );
    }
    // 交易可视化：挂单线 / 持仓线 / TP-SL / K 线进出场标记（图表区局部坐标）
    drawTrading(
      ctx,
      this.host.trade.tradeVisual,
      main.priceScale,
      { chartW, chartH: main.height },
      legend.decimals,
      st.displaySeries,
      this.host.viewport,
    );
    const previewTool = this.host.drawing.tool;
    if (previewTool && this.host.drawing.placingPoints.length > 0) {
      const placing = this.host.drawing.placingPoints;
      const pts = this.host.drawing.preview ? [...placing, this.host.drawing.preview] : placing;
      const def = getToolDef(previewTool);
      drawDrawings(
        ctx,
        [
          {
            id: '__preview',
            type: previewTool,
            points: pts,
            style: { ...def.defaultStyle, color: theme.crosshair },
            locked: false,
            visible: true,
          },
        ],
        null,
        this.host.drawingCtx(),
        legend.decimals,
      );
    }
    // Marquee 框选（二期-C2）：虚线选框（与放置预览同层，面板局部坐标）
    const mq = this.host.drawing.marqueeRect;
    if (mq) {
      ctx.save();
      ctx.strokeStyle = theme.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(mq.x0, mq.x1), Math.min(mq.y0, mq.y1), Math.abs(mq.x1 - mq.x0), Math.abs(mq.y1 - mq.y0));
      ctx.restore();
    }
    ctx.restore();

    const hoveredPane = st.panes.find((p) => p.id === st.hoveredPaneId) ?? st.panes[0];
    const hoveredBar = this.host.crosshair.bar(st.displaySeries);
    // 主图叠加指标在悬停 bar 上的值（图例展示）
    const legendIndicators: LegendStudyValues[] = [];
    const mainPane = st.panes[0];
    // 回放中图例与最新价都必须跟随回放游标（st.currentIndex / st.currentBar），
    // 取真实末柱会泄露「未来」价格——见 ChartState.currentIndex 注释。
    const legendIndex = this.host.crosshair.visible && hoveredBar ? this.host.crosshair.barIndex : st.currentIndex;
    if (!st.hideStudies && mainPane.indicators.length > 0 && legendIndex >= 0) {
      const bars = st.bars();
      for (const inst of mainPane.indicators) {
        if (!inst.isVisibleOn(legend.timeframeId)) continue;
        legendIndicators.push({
          uid: inst.uid,
          name: inst.name,
          precision: inst.precision,
          values: indicatorValuesAt(inst, bars, Math.max(0, legendIndex - 50), legendIndex),
        });
      }
    }
    drawCrosshair(
      ctx,
      this.host.crosshair,
      this.host.viewport,
      hoveredPane.priceScale,
      mainGeo,
      legend,
      hoveredPane.y,
      hoveredPane.height,
      axisPos,
      hour12,
    );
    // 图例常驻：悬停跟随十字光标，否则显示最后一根；同时收集研究行命中区
    st.studyRects = [];
    const legendInfo: LegendDrawInfo = { collapsed: 0 };
    ctx.save();
    ctx.translate(x0, 0); // 图例块随图表区偏移（rects 仍为图表区局部坐标，输入层同口径判定）
    drawLegendBlock(
      ctx,
      hoveredBar ?? st.currentBar,
      { ...legend, marketOpen: legend.market ? isMarketOpen(legend.market) : undefined },
      legendIndicators,
      st.legendOptions,
      this.host.hoveredStudyUid(),
      st.studyRects,
      legendInfo,
      mainGeo,
      st.chartType,
    );
    if (legendInfo.collapsed > 0) {
      ctx.font = `11px ${TV_FONT}`;
      ctx.fillStyle = theme.legendDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        `+${legendInfo.collapsed}`,
        st.studyRects.length ? st.studyRects[st.studyRects.length - 1].btnX + 56 : 120,
        28,
      );
    }
    ctx.restore();

    // 联动：其他图表十字光标时间的垂直参考线（小数 index 插值定位——
    // 跨周期图表的时间戳不落在 bar 上时也能对齐，不再因精确匹配失败而错位/消失）
    this.host.sync.drawReferenceLine(ctx, mainGeo.chartW, mainGeo.chartH, this.host.crosshair.visible, x0);

    // 选择K线预览线：实线 + 剪刀图标 + 线右侧淡蒙层（选中后由复盘标记线取代）。
    // selectPreviewX 为图表区局部坐标（HoverController 已换算），绘制时补左边界偏移
    if (st.barSelectMode && st.selectPreviewX !== null) {
      const px = st.selectPreviewX;
      if (px >= 0 && px <= mainGeo.chartW) {
        const cx = px + x0;
        // 线右侧淡蒙层（“未来”区域提示）
        ctx.fillStyle = theme.accentMask;
        ctx.fillRect(cx, 0, mainGeo.chartW - px, mainGeo.chartH);
        // 实线
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx) + 0.5, 0);
        ctx.lineTo(Math.round(cx) + 0.5, mainGeo.chartH);
        ctx.stroke();
        // 顶端剪刀图标
        drawScissors(ctx, cx, 10);
      }
    }

    // 回放位置不绘制标记（蒙层/竖线/标签），图表截至该 K 线即为标示
    this.host.setLastFrameMs(performance.now() - t0);
  }
}

/** 绘制剪刀图标（选择K线预览线顶端标记，蓝底白字）。
 *  与 lucide-react `Scissors` 同源：按 24×24 viewBox 的 path 数据等比缩放到 16px 绘制，
 *  保持全项目统一描边（1.5）与圆角线帽，不用字符字形（字体依赖重、光学重量不可控）。 */
function drawScissors(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.strokeStyle = theme.onAccent;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = 16 / 24;
  const p = (px: number, py: number): [number, number] => [x + (px - 12) * s, y + (py - 12) * s];
  // 两个指环
  for (const [cx, cy] of [
    [6, 6],
    [6, 18],
  ] as const) {
    ctx.beginPath();
    ctx.arc(...p(cx, cy), 3 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 三条剪线（M8.12 8.12 L12 12 / M20 4 L8.12 15.88 / M14.8 14.8 L20 20）
  for (const [x1, y1, x2, y2] of [
    [8.12, 8.12, 12, 12],
    [20, 4, 8.12, 15.88],
    [14.8, 14.8, 20, 20],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(...p(x1, y1));
    ctx.lineTo(...p(x2, y2));
    ctx.stroke();
  }
  ctx.restore();
}
