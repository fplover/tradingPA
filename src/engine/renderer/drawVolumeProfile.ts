import type { Bar } from '@/types/market';
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
 */

/** 直方图最大行宽占图表区宽比例 */
const MAX_WIDTH_RATIO = 0.25;

export function drawVolumeProfile(
  ctx: CanvasRenderingContext2D,
  bars: readonly Bar[],
  from: number,
  to: number,
  priceScale: PriceScale,
  geo: DrawGeometry,
  model: VolumeProfileModel,
  params: VolumeProfileParams,
  dataEpoch: number,
  decimals: number,
): void {
  const profile: ProfileResult | null = model.getProfile(bars, from, to, params, dataEpoch);
  if (!profile || profile.total <= 0) return;

  const upColor = params.upColor ?? theme.profileUp;
  const downColor = params.downColor ?? theme.profileDown;
  const pocColor = params.pocColor ?? theme.profilePoc;

  let maxTotal = 0;
  for (const row of profile.rows) {
    if (row.total > maxTotal) maxTotal = row.total;
  }
  if (!(maxTotal > 0)) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();

  // 右对齐水平直方图：up 段贴右缘，down 段在其左侧续接
  const maxW = geo.chartW * MAX_WIDTH_RATIO;
  for (const row of profile.rows) {
    if (!(row.total > 0)) continue;
    const w = (row.total / maxTotal) * maxW;
    // up 段占比 ≤ 1，钳制防御浮点噪声产生负宽
    const wUp = Math.min((row.up / row.total) * w, w);
    const yTop = priceScale.priceToY(row.high);
    const yBot = priceScale.priceToY(row.low);
    if (w - wUp > 0) {
      ctx.fillStyle = downColor;
      ctx.fillRect(geo.chartW - w, yTop, w - wUp, yBot - yTop);
    }
    if (wUp > 0) {
      ctx.fillStyle = upColor;
      ctx.fillRect(geo.chartW - wUp, yTop, wUp, yBot - yTop);
    }
  }

  // VAH/VAL：虚线贯穿图表区
  drawLevel(ctx, priceScale.priceToY(profile.vah), geo, theme.profileVa, [4, 4]);
  drawLevel(ctx, priceScale.priceToY(profile.val), geo, theme.profileVa, [4, 4]);

  // POC：实线 + 右缘价签
  const pocY = priceScale.priceToY(profile.poc);
  drawLevel(ctx, pocY, geo, pocColor, []);
  const label = profile.poc.toFixed(decimals);
  ctx.font = `10px ${TV_FONT}`;
  const tw = ctx.measureText(label).width + 8;
  ctx.fillStyle = pocColor;
  ctx.fillRect(geo.chartW - tw, pocY - 13, tw, 12);
  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, geo.chartW - tw / 2, pocY - 7);

  ctx.restore();
}

/** 水平价位线（dash 数组为空 = 实线） */
function drawLevel(ctx: CanvasRenderingContext2D, y: number, geo: DrawGeometry, color: string, dash: number[]): void {
  if (!Number.isFinite(y)) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(y) + 0.5);
  ctx.lineTo(geo.chartW, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
}
