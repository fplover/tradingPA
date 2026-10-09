import type { Bar } from '@/types/market';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme, TV_FONT } from '../theme';
import type { DrawGeometry } from './drawSeries';
import type { ProfileResult, VolumeProfileModel, VolumeProfileParams } from '../profile/volumeProfile';

/**
 * Volume Profile 绘制（P1-F §3）：主图右缘横置直方图（TV 形态）。
 * - 行宽按行总量比例，最大行宽 = 图表区宽 25%；up 段贴右缘、down 段续向左；
 * - POC 实线 + 右缘价签，VAH/VAL 虚线贯穿图表区；
 * - 颜色只读主题 token（参数显式覆盖除外），与挂单线/画线（后绘）TV 同序浮于其上。
 * 右缘锚定 = 图表区右缘（本地 chartW）：PaneRenderer 按价格轴侧 translate 后，
 * 左/无轴形态下直方图与价签随图表区右缘落位，无需在此感知轴侧。
 *
 * 会话模式（二期-G Session Volume Profile）：按 UTC 日逐段分布——每段直方图
 * 右对齐到该会话最后一根 bar 的 x（TV Session VP 同形态），POC/VAH/VAL 只在
 * 段横向范围内绘制；段宽过窄时直方图按段宽收敛（下限 20px 保可读）。
 */

/** 直方图最大行宽占图表区宽比例 */
const MAX_WIDTH_RATIO = 0.25;

/** 会话段直方图最小宽度（px）：段宽收敛下限，低于此仍按此宽绘制 */
const SESSION_MIN_W = 20;

/** VP 绘制取数包（range/session 两模式共用；PaneRenderer 组装一次） */
export interface VpDrawArgs {
  bars: readonly Bar[];
  from: number;
  to: number;
  viewport: Viewport;
  priceScale: PriceScale;
  geo: DrawGeometry;
  model: VolumeProfileModel;
  params: VolumeProfileParams;
  dataEpoch: number;
  decimals: number;
}

export function drawVolumeProfile(ctx: CanvasRenderingContext2D, args: VpDrawArgs): void {
  const { bars, from, to, priceScale, geo, model, params, dataEpoch, decimals } = args;
  const profile: ProfileResult | null = model.getProfile(bars, from, to, params, dataEpoch);
  if (!profile || profile.total <= 0) return;

  const colors = vpColors(params);
  let maxTotal = 0;
  for (const row of profile.rows) {
    if (row.total > maxTotal) maxTotal = row.total;
  }
  if (!(maxTotal > 0)) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();

  drawProfileRows(ctx, profile.rows, maxTotal, geo.chartW, geo.chartW * MAX_WIDTH_RATIO, priceScale, colors);
  // VAH/VAL：虚线贯穿图表区
  drawLevel(ctx, priceScale.priceToY(profile.vah), 0, geo.chartW, theme.profileVa, [4, 4]);
  drawLevel(ctx, priceScale.priceToY(profile.val), 0, geo.chartW, theme.profileVa, [4, 4]);
  // POC：实线 + 右缘价签
  drawPoc(ctx, profile.poc, 0, geo.chartW, priceScale, colors.poc, decimals);

  ctx.restore();
}

/** 会话模式（二期-G）：UTC 日逐段分布，每段直方图右对齐段内最后一根 bar */
export function drawSessionVolumeProfile(ctx: CanvasRenderingContext2D, args: VpDrawArgs): void {
  const { bars, from, to, viewport, priceScale, geo, model, params, dataEpoch, decimals } = args;
  const sessions = model.getSessions(bars, from, to, params, dataEpoch);
  if (sessions.length === 0) return;

  const colors = vpColors(params);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();

  for (const seg of sessions) {
    let maxTotal = 0;
    for (const row of seg.result.rows) {
      if (row.total > maxTotal) maxTotal = row.total;
    }
    if (!(maxTotal > 0)) continue;
    const xRight = viewport.indexToX(seg.to);
    const xLeft = viewport.indexToX(seg.from);
    const maxW = Math.min(geo.chartW * MAX_WIDTH_RATIO, Math.max(xRight - xLeft, SESSION_MIN_W));
    drawProfileRows(ctx, seg.result.rows, maxTotal, xRight, maxW, priceScale, colors);
    drawLevel(ctx, priceScale.priceToY(seg.result.vah), xLeft, xRight, theme.profileVa, [4, 4]);
    drawLevel(ctx, priceScale.priceToY(seg.result.val), xLeft, xRight, theme.profileVa, [4, 4]);
    drawPoc(ctx, seg.result.poc, xLeft, xRight, priceScale, colors.poc, decimals);
  }

  ctx.restore();
}

interface VpColors {
  up: string;
  down: string;
  poc: string;
}

function vpColors(params: VolumeProfileParams): VpColors {
  return {
    up: params.upColor ?? theme.profileUp,
    down: params.downColor ?? theme.profileDown,
    poc: params.pocColor ?? theme.profilePoc,
  };
}

/** 右对齐水平直方图（range 与 session 共用原语；xRight 为段右缘） */
function drawProfileRows(
  ctx: CanvasRenderingContext2D,
  rows: ProfileResult['rows'],
  maxTotal: number,
  xRight: number,
  maxW: number,
  priceScale: PriceScale,
  colors: VpColors,
): void {
  for (const row of rows) {
    if (!(row.total > 0)) continue;
    const w = (row.total / maxTotal) * maxW;
    // up 段占比 ≤ 1，钳制防御浮点噪声产生负宽
    const wUp = Math.min((row.up / row.total) * w, w);
    const yTop = priceScale.priceToY(row.high);
    const yBot = priceScale.priceToY(row.low);
    if (w - wUp > 0) {
      ctx.fillStyle = colors.down;
      ctx.fillRect(xRight - w, yTop, w - wUp, yBot - yTop);
    }
    if (wUp > 0) {
      ctx.fillStyle = colors.up;
      ctx.fillRect(xRight - wUp, yTop, wUp, yBot - yTop);
    }
  }
}

/** POC：实线 + 右缘价签（[xLeft, xRight] 范围内） */
function drawPoc(
  ctx: CanvasRenderingContext2D,
  poc: number,
  xLeft: number,
  xRight: number,
  priceScale: PriceScale,
  pocColor: string,
  decimals: number,
): void {
  const pocY = priceScale.priceToY(poc);
  drawLevel(ctx, pocY, xLeft, xRight, pocColor, []);
  const label = poc.toFixed(decimals);
  ctx.font = `10px ${TV_FONT}`;
  const tw = ctx.measureText(label).width + 8;
  ctx.fillStyle = pocColor;
  ctx.fillRect(xRight - tw, pocY - 13, tw, 12);
  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, xRight - tw / 2, pocY - 7);
}

/** 水平价位线（dash 数组为空 = 实线；[xLeft, xRight] 范围内） */
function drawLevel(
  ctx: CanvasRenderingContext2D,
  y: number,
  xLeft: number,
  xRight: number,
  color: string,
  dash: number[],
): void {
  if (!Number.isFinite(y)) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(xLeft, Math.round(y) + 0.5);
  ctx.lineTo(xRight, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
}
