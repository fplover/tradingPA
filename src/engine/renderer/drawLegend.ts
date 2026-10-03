import type { Bar, ChartTypeId } from '@/types/market';
import { theme, TV_FONT } from '../theme';
import type { DrawGeometry } from './drawSeries';
import type { LegendDrawInfo, LegendInfo, LegendOptions, LegendStudyValues, StudyLegendRect } from './legendTypes';
import { DEFAULT_LEGEND_OPTIONS } from './legendTypes';

/** 图例 OHLCV 字段按图表类型收窄（TV 规格）：
 *  高低图 H L C；柱状图 O C；线族（线形/阶梯/带标记/HLC面积）仅 C；
 *  成交量蜡烛 O H L C + 柱宽语义提示；其余类型（蜡烛/竹线/空心/平均K/基线/面积/砖块）O H L C。 */
export function legendFieldsFor(chartType: ChartTypeId): {
  open: boolean;
  high: boolean;
  low: boolean;
  close: boolean;
  volumeWidthHint: boolean;
} {
  switch (chartType) {
    case 'high-low':
      return { open: false, high: true, low: true, close: true, volumeWidthHint: false };
    case 'columns':
      return { open: true, high: false, low: false, close: true, volumeWidthHint: false };
    case 'line':
    case 'step-line':
    case 'line-markers':
    case 'hlc-area':
      return { open: false, high: false, low: false, close: true, volumeWidthHint: false };
    case 'volume-candles':
      return { open: true, high: true, low: true, close: true, volumeWidthHint: true };
    default:
      return { open: true, high: true, low: true, close: true, volumeWidthHint: false };
  }
}

/**
 * 左上角图例：常驻单行（TradingView 样式）。
 * 代码加粗 + 周期/交易所灰字 + O H L C 按该根涨跌着色 + 涨跌幅 + 量；
 * 悬停时跟随十字光标，否则显示最后一根。叠加指标值换行附在其下。
 * OHLCV 字段按 chartType 收窄（见 legendFieldsFor）。
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
  chartType: ChartTypeId = 'candles',
): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let x = 8;
  const y = 6;
  // TV 图例：代码行 16px、其余 13px，字重 400（观感粗来自字号而非 weight）
  ctx.font = `16px ${TV_FONT}`;
  if (options.showSeriesTitle) {
    // 市场状态圆点：开市=涨色，闭市=暗灰（TV market status）
    if (legend.marketOpen !== undefined) {
      ctx.fillStyle = legend.marketOpen ? theme.up : theme.legendDim;
      ctx.beginPath();
      ctx.arc(x + 3, y + 8, 3, 0, Math.PI * 2);
      ctx.fill();
      x += 10;
    }
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
    const f = legendFieldsFor(chartType);
    const fields: Array<[string, string, string]> = [];
    if (options.showOHLC) {
      if (f.open) fields.push(['开=', bar.open.toFixed(d), color]);
      if (f.high) fields.push(['高=', bar.high.toFixed(d), color]);
      if (f.low) fields.push(['低=', bar.low.toFixed(d), color]);
      if (f.close) fields.push(['收=', bar.close.toFixed(d), color]);
      if (options.showChange)
        fields.push(['涨跌', `${sign}${change.toFixed(d)} (${sign}${changePct.toFixed(2)}%)`, color]);
      // 成交量蜡烛：柱宽编码成交量，TV 图例附语义提示
      if (f.volumeWidthHint) fields.push(['量宽', '表示成交量', theme.legendDim]);
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
  // 对比序列第二行（P2-D）：符号 + 末点归一化百分比；存在时指标行整体下移 16px
  if (legend.compare) {
    const cmp = legend.compare;
    ctx.font = `13px ${TV_FONT}`;
    ctx.fillStyle = theme.legendText;
    ctx.fillText(cmp.symbol, 8, 28);
    const cx = 8 + ctx.measureText(cmp.symbol).width + 8;
    const pct = `${cmp.lastPct >= 0 ? '+' : ''}${cmp.lastPct.toFixed(2)}%`;
    ctx.fillStyle = cmp.lastPct >= 0 ? theme.up : theme.down;
    ctx.fillText(pct, cx, 28);
  }
  const studyRowY = legend.compare ? 44 : 28;
  if ((options.showStudyNames || options.showStudyArgs || options.showStudyValues) && rows.length > 0) {
    let iy = studyRowY;
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

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}
