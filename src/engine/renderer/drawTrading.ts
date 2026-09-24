import type { PriceScale } from '../scale/PriceScale';
import type { Viewport } from '../viewport/Viewport';
import type { BarSeries } from '@/data/BarSeries';
import type { DrawGeometry } from './drawSeries';

export interface OrderVisual {
  id: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop-limit';
  qty: number;
  /** 主挂单价格（限价单=limitPrice，止损单=stopPrice） */
  price?: number;
}

export interface PositionVisual {
  side: 'long' | 'short';
  qty: number;
  avgPrice: number;
  takeProfit?: number;
  stopLoss?: number;
  /** 浮动盈亏（标签展示） */
  pnl: number;
}

/** K 线进出场标记：圆点标在成交价上，上下箭头标方向（买=上、卖=下） */
export interface TradeMarker {
  time: number;
  price: number;
  side: 'buy' | 'sell';
  kind: 'entry' | 'exit';
}

export interface TradeVisual {
  orders: OrderVisual[];
  position: PositionVisual | null;
  /** 开仓点（含已平仓交易的入场） */
  entries: TradeMarker[];
  /** 平仓点 */
  exits: TradeMarker[];
}

export type TradeHit =
  | { kind: 'order'; id: string }
  | { kind: 'position' }
  | { kind: 'tp' }
  | { kind: 'sl' }
  | { kind: 'order-cancel'; id: string }
  | { kind: 'position-close' }
  | { kind: 'tp-close' }
  | { kind: 'sl-close' }
  | null;

/** 右端标签与画布边缘的预留间距 */
const TAG_PAD = 12;
/** 右端关闭/撤单按钮命中宽度 */
const BTN_HIT_W = 16;
/** 持仓详情块命中区宽度（圆角标签约宽） */
const POSITION_TAG_W = 150;
/** TP/SL 线命中半宽 */
const TP_SL_HIT = 5;

/** 绘制挂单线 / 持仓线 / TP-SL / K 线进出场标记（面板局部坐标） */
export function drawTrading(
  ctx: CanvasRenderingContext2D,
  visual: TradeVisual,
  priceScale: PriceScale,
  geo: DrawGeometry,
  decimals: number,
  series: BarSeries,
  viewport: Viewport,
): void {
  drawTradeMarkers(ctx, visual.entries, series, viewport, priceScale, geo);
  drawTradeMarkers(ctx, visual.exits, series, viewport, priceScale, geo);
  for (const o of visual.orders) {
    if (o.price === undefined) continue;
    drawOrderLine(ctx, o, priceScale, geo, decimals);
  }
  if (visual.position) {
    drawPositionLine(ctx, visual.position, priceScale, geo, decimals);
  }
}

function drawOrderLine(
  ctx: CanvasRenderingContext2D,
  o: OrderVisual,
  priceScale: PriceScale,
  geo: DrawGeometry,
  decimals: number,
): void {
  const y = Math.round(priceScale.priceToY(o.price!)) + 0.5;
  if (y < 0 || y > geo.chartH) return;
  const color = o.type === 'stop' || o.type === 'stop-limit' ? '#ff9800' : '#2962ff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(geo.chartW, y);
  ctx.stroke();
  ctx.setLineDash([]);
  // 右侧标签：数量 + 类型 + 价格 + 撤单按钮
  const label = `${o.qty} ${orderTypeLabel(o.type)} ${o.price!.toFixed(decimals)}`;
  drawTag(ctx, geo.chartW - TAG_PAD, y, label, color, true);
}

function drawPositionLine(
  ctx: CanvasRenderingContext2D,
  p: PositionVisual,
  priceScale: PriceScale,
  geo: DrawGeometry,
  decimals: number,
): void {
  const y = Math.round(priceScale.priceToY(p.avgPrice)) + 0.5;
  if (y < 0 || y > geo.chartH) return;
  const color = p.side === 'long' ? '#26a69a' : '#ef5350';
  // 持仓入场线（细实线）
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(geo.chartW, y);
  ctx.stroke();
  // TP/SL 横线（细虚线）+ 右端描述标签 + 清除按钮（与持仓详情块同款圆角）
  const drawTpSlLine = (price: number | undefined, lineColor: string, label: string) => {
    if (price === undefined) return;
    const ly = Math.round(priceScale.priceToY(price)) + 0.5;
    if (ly < 0 || ly > geo.chartH) return;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(geo.chartW, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    drawTag(ctx, geo.chartW - TAG_PAD, ly, `${label} ${price.toFixed(decimals)}`, lineColor, true);
  };
  drawTpSlLine(p.takeProfit, '#26a69a', '止盈');
  drawTpSlLine(p.stopLoss, '#ef5350', '止损');
  const pnl = p.pnl >= 0 ? `+${p.pnl.toFixed(2)}` : p.pnl.toFixed(2);
  const label = `${p.side === 'long' ? '多' : '空'} ${p.qty} @${p.avgPrice.toFixed(decimals)} · ${pnl}`;
  // 持仓详情块右端带关闭按钮（点击市价平仓）
  drawTag(ctx, geo.chartW - TAG_PAD, y, label, color, true);
}

/** K 线进出场标记：成交价处画小圆点，旁配小箭头指示方向（买=上、卖=下） */
function drawTradeMarkers(
  ctx: CanvasRenderingContext2D,
  markers: TradeMarker[],
  series: BarSeries,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  for (const m of markers) {
    const idx = series.indexOfTime(m.time);
    if (idx < 0) continue;
    const x = viewport.indexToX(idx);
    if (x < -12 || x > geo.chartW + 12) continue;
    const y = priceScale.priceToY(m.price);
    if (y < -12 || y > geo.chartH + 12) continue;
    const buy = m.side === 'buy';
    const color = buy ? '#26a69a' : '#ef5350';
    ctx.fillStyle = color;
    // 方向箭头：买入在点下方尖端朝上，卖出在点上方尖端朝下
    const ay = buy ? y + 7 : y - 7;
    ctx.beginPath();
    if (buy) {
      ctx.moveTo(x, ay - 5);
      ctx.lineTo(x - 3.5, ay + 2);
      ctx.lineTo(x + 3.5, ay + 2);
    } else {
      ctx.moveTo(x, ay + 5);
      ctx.lineTo(x - 3.5, ay - 2);
      ctx.lineTo(x + 3.5, ay - 2);
    }
    ctx.closePath();
    ctx.fill();
    // 成交价圆点
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 右端标签（圆角块）：label + 可选关闭/撤单按钮（×） */
function drawTag(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  y: number,
  label: string,
  color: string,
  withButton: boolean,
): void {
  ctx.font = '10px system-ui, sans-serif';
  const textW = ctx.measureText(label).width;
  const btnW = withButton ? 14 : 0;
  const w = textW + 12 + btnW;
  const h = 16;
  const x = rightX - w;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y);
  if (withButton) {
    ctx.textAlign = 'center';
    ctx.fillText('×', rightX - 8, y);
  }
}

function orderTypeLabel(type: OrderVisual['type']): string {
  switch (type) {
    case 'limit': return '限价';
    case 'stop': return '止损';
    case 'stop-limit': return '止損限价';
    default: return '市价';
  }
}

/** 右端关闭/撤单按钮命中区（标签末尾 × 区域） */
function isRightBtnHit(x: number, y: number, ly: number, geo: DrawGeometry): boolean {
  return (
    x >= geo.chartW - TAG_PAD - BTN_HIT_W &&
    x <= geo.chartW - TAG_PAD + 4 &&
    Math.abs(y - ly) <= 10
  );
}

/** 命中测试：挂单线/持仓块/TP-SL 线的拖动区与右端关闭按钮（面板局部坐标） */
export function hitTestTrading(
  visual: TradeVisual,
  x: number,
  y: number,
  priceScale: PriceScale,
  geo: DrawGeometry,
): TradeHit {
  const p = visual.position;
  // 1) 持仓详情块：右端关闭（平仓）优先，其余区域拖动设 TP/SL
  if (p) {
    const ey = priceScale.priceToY(p.avgPrice);
    if (Math.abs(y - ey) <= 10) {
      if (isRightBtnHit(x, y, ey, geo)) return { kind: 'position-close' };
      if (x >= geo.chartW - TAG_PAD - POSITION_TAG_W && x <= geo.chartW - TAG_PAD) return { kind: 'position' };
    }
  }
  // 2) TP/SL 线：右端关闭（清除）优先，线体拖动改价
  if (p) {
    if (p.takeProfit !== undefined) {
      const ty = priceScale.priceToY(p.takeProfit);
      if (Math.abs(y - ty) <= TP_SL_HIT) {
        if (isRightBtnHit(x, y, ty, geo)) return { kind: 'tp-close' };
        return { kind: 'tp' };
      }
    }
    if (p.stopLoss !== undefined) {
      const sy = priceScale.priceToY(p.stopLoss);
      if (Math.abs(y - sy) <= TP_SL_HIT) {
        if (isRightBtnHit(x, y, sy, geo)) return { kind: 'sl-close' };
        return { kind: 'sl' };
      }
    }
  }
  // 3) 挂单线：右端撤单按钮 + 线体拖动改价
  for (const o of visual.orders) {
    if (o.price === undefined) continue;
    const ly = priceScale.priceToY(o.price);
    if (Math.abs(y - ly) <= 5) {
      if (isRightBtnHit(x, y, ly, geo)) return { kind: 'order-cancel', id: o.id };
      return { kind: 'order', id: o.id };
    }
  }
  return null;
}
