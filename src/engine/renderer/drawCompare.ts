import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { DrawGeometry } from './drawSeries';
import type { CompareLegendInfo } from './legendTypes';
import { theme } from '../theme';

/**
 * 对比序列叠加渲染（P2-D①，AC-D1）：第二条价格序列以归一化百分比坐标画在主价格面板。
 * - 口径：pct = (close / base - 1) * 100，base = 对比序列首根收盘（compare.base）。
 * - 坐标：非 percent 模式走「主图副坐标」——可见窗口内 pct 的独立线性域（与主价格域
 *   互不影响，主序列 autoscale/视口完全不感知对比序列的存在）；percent 模式与主序列
 *   同一坐标系——pct 折算回主序列的百分比基准价后过主 priceScale（同 % 读数同高度）。
 * - 无对比序列（compare 为空 / 无可见点）时零开销：直接 early return，不做任何绘制。
 * - 画在最顶层（PaneRenderer 中置于叠加指标之后），避免被指标曲线与填充遮挡。
 */

/** 归一化百分比（相对基准价；基准非法时回落 0，防除零） */
export function toPercent(value: number, base: number): number {
  return base > 0 && Number.isFinite(base) ? (value / base - 1) * 100 : 0;
}

/** 副坐标域：可见窗口内 pct 的最小/最大值（含 8% 留白；全平时给 1 个百分点的兜底跨度） */
export function compareDomain(pcts: readonly number[]): { min: number; max: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pcts) {
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  if (lo === Infinity) return { min: -1, max: 1 };
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.01);
  const pad = span * 0.08;
  return { min: lo - pad, max: hi + pad };
}

export function drawCompareOverlay(
  ctx: CanvasRenderingContext2D,
  compare: CompareLegendInfo | null | undefined,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  percentOn: boolean,
  /** 主序列百分比基准价（首根可见 bar 收盘；percent 模式共用坐标系用，非 percent 传 null） */
  mainPercentBase: number | null,
): void {
  if (!compare || compare.base <= 0 || to < from) return;
  const aligned = compare.aligned;
  if (aligned.length === 0) return;

  // 收集可见窗口内的点：x 视口定位，pct 归一化；null = 该主 bar 无对应对比 bar（断线）
  const pts: Array<{ x: number; pct: number | null }> = [];
  const pcts: number[] = [];
  for (let i = from; i <= to; i++) {
    const v = aligned[i];
    if (v === undefined) continue; // 主序列比对齐数据长（轮询间隙）：末端自然短缺，不补点
    if (v === null || !Number.isFinite(v) || v <= 0) {
      pts.push({ x: viewport.indexToX(i), pct: null });
      continue;
    }
    const pct = toPercent(v, compare.base);
    pts.push({ x: viewport.indexToX(i), pct });
    pcts.push(pct);
  }
  if (pts.length === 0 || pcts.length === 0) return; // 无可见点 / 全断线：零开销

  // percent 模式：与主序列同一坐标系——pct 折算回主序列基准价再过主 priceScale
  // （主序列标签同为 (price/base-1)*100，故同 % 读数的两点必然同高度）
  const sharedBase = percentOn && mainPercentBase !== null && mainPercentBase > 0 ? mainPercentBase : null;
  const domain = sharedBase === null ? compareDomain(pcts) : null;
  const yOf = (pct: number): number => {
    if (sharedBase !== null) return priceScale.priceToY(sharedBase * (1 + pct / 100));
    // 非 percent：副坐标为独立线性域（sharedBase 为 null 时 domain 必已计算）
    const min = domain?.min ?? 0;
    const max = domain?.max ?? 1;
    return geo.chartH * (1 - (pct - min) / (max - min || 1e-9));
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.strokeStyle = theme.warn; // 对比序列惯用橙色（TV 风格），与涨跌绿红、品牌蓝均区分
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let pen = false;
  let lastX = 0;
  let lastY = 0;
  for (const pt of pts) {
    if (pt.pct === null) {
      pen = false; // 缺口：抬笔，下一有效点重新起笔
      continue;
    }
    const y = yOf(pt.pct);
    if (!pen) ctx.moveTo(pt.x, y);
    else ctx.lineTo(pt.x, y);
    pen = true;
    lastX = pt.x;
    lastY = y;
  }
  ctx.stroke();
  // 末点小圆点：实时端定位标记（图例第二行给出数值读数）
  if (pen) {
    ctx.fillStyle = theme.warn;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
