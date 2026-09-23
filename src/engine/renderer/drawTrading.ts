import type { PriceScale } from '../scale/PriceScale';
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

export interface TradeVisual {
  orders: OrderVisual[];
  position: PositionVisual | null;
}

export type TradeHit =
  | { kind: 'order'; id: string }
  | { kind: 'position' }
  | { kind: 'tp' }
  | { kind: 'sl' }
  | { kind: 'order-cancel'; id: string }
  | null;

/** 绘制挂单线 / 持仓线 / TP-SL 手柄（面板局部坐标） */
export function drawTrading(
  ctx: CanvasRenderingContext2D,
  visual: TradeVisual,
  priceScale: PriceScale,
  geo: DrawGeometry,
  decimals: number,
): void {
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
  // 右侧标签：数量 + 类型 + 撤盘按钮
  const label = `${o.qty} ${orderTypeLabel(o.type)} ${o.price!.toFixed(decimals)}`;
  drawTag(ctx, geo.chartW - 4, y, label, color, true);
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
  // TP/SL 横线（细虚线）+ 右端描述标签（与持仓详情块同款圆角）
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
    drawTag(ctx, geo.chartW - 4, ly, `${label} ${price.toFixed(decimals)}`, lineColor, false);
  };
  drawTpSlLine(p.takeProfit, '#26a69a', '止盈');
  drawTpSlLine(p.stopLoss, '#ef5350', '止损');
  const pnl = p.pnl >= 0 ? `+${p.pnl.toFixed(2)}` : p.pnl.toFixed(2);
  const label = `${p.side === 'long' ? '多' : '空'} ${p.qty} @${p.avgPrice.toFixed(decimals)} · ${pnl}`;
  drawTag(ctx, geo.chartW - 4, y, label, color, false);

}

/** 持仓详情块命中区宽度（圆角标签约宽） */
const POSITION_TAG_W = 150;

/** 持仓详情块是否命中（线右端圆角标签区域） */
export function isPositionTagHit(x: number, y: number, position: PositionVisual, priceScale: PriceScale, geo: DrawGeometry): boolean {
  const ey = priceScale.priceToY(position.avgPrice);
  return x >= geo.chartW - POSITION_TAG_W && x <= geo.chartW && Math.abs(y - ey) <= 10;
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  y: number,
  label: string,
  color: string,
  withCancel: boolean,
): void {
  ctx.font = '10px system-ui, sans-serif';
  const textW = ctx.measureText(label).width;
  const cancelW = withCancel ? 14 : 0;
  const w = textW + 12 + cancelW;
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
  if (withCancel) {
    ctx.fillText('×', x + w - 10, y);
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

/** 命中测试：挂单线/持仓线/TP/SL 手柄/撤单按钮（面板局部坐标） */
export function hitTestTrading(
  visual: TradeVisual,
  x: number,
  y: number,
  priceScale: PriceScale,
  geo: DrawGeometry,
): TradeHit {
  const p = visual.position;
  // 1) 持仓详情块（圆角标签，拖动设 TP/SL）
  if (p && isPositionTagHit(x, y, p, priceScale, geo)) return { kind: 'position' };
  // 2) 挂单线（含撤单按钮区：标签右端窄区）
  for (const o of visual.orders) {
    if (o.price === undefined) continue;
    const ly = priceScale.priceToY(o.price);
    if (Math.abs(y - ly) <= 5) {
      if (x >= geo.chartW - 30 && x <= geo.chartW) return { kind: 'order-cancel', id: o.id };
      return { kind: 'order', id: o.id };
    }
  }
  return null;
}

/** 撤单按钮命中区（标签右端） */
export function isOrderCancelArea(x: number, geo: DrawGeometry): boolean {
  return x >= geo.chartW - 30 && x <= geo.chartW;
}
