import type { Bar } from '@/types/market';
import type { Crosshair } from '../crosshair/Crosshair';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme, TV_FONT } from '../theme';
import type { DrawGeometry } from './drawSeries';
import { formatTime } from './drawAxes';

export interface LegendInfo {
  symbol: string;
  interval: string;
  decimals: number;
  exchange?: string;
  timeframeId?: string;
}

/** 图例可见性（TV 图表设置「状态栏」页 + 图例右键菜单） */
export interface LegendOptions {
  /** 商品行（代码 · 周期 · 交易所） */
  showSeriesTitle: boolean;
  showOHLC: boolean;
  showChange: boolean;
  showVolume: boolean;
  /** 指标名称 / 参数 / 数值 三档可分别开关 */
  showStudyNames: boolean;
  showStudyArgs: boolean;
  showStudyValues: boolean;
}

export const DEFAULT_LEGEND_OPTIONS: LegendOptions = {
  showSeriesTitle: true,
  showOHLC: true,
  showChange: true,
  showVolume: true,
  showStudyNames: true,
  showStudyArgs: true,
  showStudyValues: true,
};

/** 图例绘制附加信息：超出可用高度的折叠行数 */
export interface LegendDrawInfo {
  collapsed: number;
}

export interface LegendStudyValues {
  uid: string;
  name: string;
  precision?: number;
  values: Array<{ label: string; value: number }>;
}

/** 研究图例行命中区（含右侧三个悬停按钮的子区） */
export interface StudyLegendRect {
  uid: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 按钮区起点 x：eye / gear / remove 各 16px */
  btnX: number;
}

/** 十字光标：虚线 + 价格轴标签 + 时间轴标签 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  crosshair: Crosshair,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  legend: LegendInfo,
  paneY = 0,
  paneHeight = geo.chartH,
): void {
  if (!crosshair.visible) return;

  // 虚线（水平限悬停面板内，垂直吸附 bar 中心并贯穿全高）
  const snapX = viewport.indexToX(crosshair.barIndex);
  ctx.strokeStyle = theme.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(crosshair.y) + 0.5);
  ctx.lineTo(geo.chartW, Math.round(crosshair.y) + 0.5);
  ctx.moveTo(Math.round(snapX) + 0.5, paneY);
  ctx.lineTo(Math.round(snapX) + 0.5, paneY + paneHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 价格轴标签（价格按悬停面板的相对坐标换算）
  const price = priceScale.yToPrice(crosshair.y - paneY);
  drawAxisLabel(ctx, geo.chartW + 1, crosshair.y, priceScale.toLabel(price, legend.decimals), 'price');

  // 时间轴标签
  const time = crosshair.barIndex >= 0 ? crosshair.time : 0;
  if (time > 0) {
    drawAxisLabel(ctx, snapX, geo.chartH + 1, formatTime(time, viewport.spacing), 'time');
  }
}

/**
 * 左上角图例：常驻单行（TradingView 样式）。
 * 代码加粗 + 周期/交易所灰字 + O H L C 按该根涨跌着色 + 涨跌幅 + 量；
 * 悬停时跟随十字光标，否则显示最后一根。叠加指标值换行附在其下。
 */
export function drawLegendBlock(
  ctx: CanvasRenderingContext2D,
  bar: Bar | undefined,
  legend: LegendInfo,
  indicatorValues?: LegendStudyValues[],
  options: LegendOptions = DEFAULT_LEGEND_OPTIONS,
  hoverUid: string | null = null,
  outRects?: StudyLegendRect[],
  outInfo?: LegendDrawInfo,
  geo?: DrawGeometry,
): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let x = 8;
  const y = 6;
  // TV 图例：代码行 16px、其余 13px，字重 400（观感粗来自字号而非 weight）
  ctx.font = `16px ${TV_FONT}`;
  if (options.showSeriesTitle) {
    ctx.fillStyle = theme.legendText;
    ctx.fillText(legend.symbol, x, y);
    x += ctx.measureText(legend.symbol).width;
  }

  ctx.font = `13px ${TV_FONT}`;
  if (options.showSeriesTitle) {
    const meta = ` · ${legend.interval}${legend.exchange ? ` · ${legend.exchange}` : ''}`;
    ctx.fillStyle = theme.legendDim;
    ctx.fillText(meta, x, y);
    x += ctx.measureText(meta).width + 14;
  }

  if (bar) {
    const d = legend.decimals;
    const change = bar.close - bar.open;
    const changePct = bar.open !== 0 ? (change / bar.open) * 100 : 0;
    const color = bar.close >= bar.open ? theme.up : theme.down;
    const sign = change >= 0 ? '+' : '';
    const fields: Array<[string, string, string]> = [];
    if (options.showOHLC) {
      fields.push(
        ['开=', bar.open.toFixed(d), color],
        ['高=', bar.high.toFixed(d), color],
        ['低=', bar.low.toFixed(d), color],
        ['收=', bar.close.toFixed(d), color],
      );
      if (options.showChange) fields.push(['涨跌', `${sign}${change.toFixed(d)} (${sign}${changePct.toFixed(2)}%)`, color]);
    }
    if (options.showVolume) fields.push(['量', formatVolume(bar.volume), theme.legendDim]);
    for (const [label, value, c] of fields) {
      if (label) {
        ctx.fillStyle = theme.legendDim;
        ctx.fillText(label, x, y);
        x += ctx.measureText(label).width + 4;
      }
      ctx.fillStyle = c;
      ctx.fillText(value, x, y);
      x += ctx.measureText(value).width + 10;
    }
  }

  let collapsed = 0;
  const rows = indicatorValues ?? [];
  const maxY = geo ? geo.chartH - 4 : Infinity;
  if ((options.showStudyNames || options.showStudyArgs || options.showStudyValues) && rows.length > 0) {
    let iy = 28;
    ctx.font = `13px ${TV_FONT}`;
    for (const ind of rows) {
      if (ind.values.length === 0) continue;
      if (iy + 16 > maxY) {
        collapsed += 1;
        continue;
      }
      let ix = 8;
      if (options.showStudyNames) {
        ctx.fillStyle = theme.legendDim;
        ctx.fillText(ind.name, ix, iy);
        ix += ctx.measureText(ind.name).width + 6;
      }
      if (options.showStudyValues) {
        for (const v of ind.values) {
          if (options.showStudyArgs) {
            ctx.fillStyle = theme.legendDim;
            ctx.fillText(v.label, ix, iy);
            ix += ctx.measureText(v.label).width + 4;
          }
          ctx.fillStyle = theme.legendText;
          const text = ind.precision !== undefined ? v.value.toFixed(ind.precision) : formatIndicatorValue(v.value);
          ctx.fillText(text, ix, iy);
          ix += ctx.measureText(text).width + 8;
        }
      }
      const btnX = ix + 4;
      outRects?.push({ uid: ind.uid, x: 8, y: iy, w: btnX + 48 - 8, h: 16, btnX });
      if (hoverUid === ind.uid) drawStudyButtons(ctx, btnX, iy);
      iy += 16;
    }
  }
  if (outInfo) outInfo.collapsed = collapsed;
  ctx.restore();
}

/** 研究图例行的悬停按钮：显示/隐藏、设置、移除（TV 同位置） */
function drawStudyButtons(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = theme.legendDim;
  ctx.fillStyle = theme.legendDim;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const bx = x + i * 16;
    const cx = bx + 8;
    const cy = y + 8;
    ctx.beginPath();
    if (i === 0) {
      // eye
      ctx.ellipse(cx, cy, 5, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (i === 1) {
      // gear
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2;
        ctx.moveTo(cx + Math.cos(ang) * 3.6, cy + Math.sin(ang) * 3.6);
        ctx.lineTo(cx + Math.cos(ang) * 5.4, cy + Math.sin(ang) * 5.4);
      }
      ctx.stroke();
    } else {
      // remove
      ctx.moveTo(cx - 3.4, cy - 3.4);
      ctx.lineTo(cx + 3.4, cy + 3.4);
      ctx.moveTo(cx + 3.4, cy - 3.4);
      ctx.lineTo(cx - 3.4, cy + 3.4);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function formatIndicatorValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

function drawAxisLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  kind: 'price' | 'time',
): void {
  ctx.font = `11px ${TV_FONT}`;
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  let bx = x - w / 2;
  let by = y - h / 2;
  if (kind === 'price') {
    bx = x + 2;
    by = Math.max(0, Math.min(by, 9999));
  } else {
    bx = Math.max(0, bx);
    by = y + 3;
  }
  ctx.fillStyle = theme.tooltipBg;
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = theme.axisLabelText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2);
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}
