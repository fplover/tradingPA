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
  // TP/SL 横线（细虚线，TP 绿 / SL 红）
  const drawTpSlLine = (price: number | undefined, lineColor: string) => {
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
  };
  drawTpSlLine(p.takeProfit, '#26a69a');
  drawTpSlLine(p.stopLoss, '#ef5350');
  const pnl = p.pnl >= 0 ? `+${p.pnl.toFixed(2)}` : p.pnl.toFixed(2);
  const label = `${p.side === 'long' ? '多' : '空'} ${p.qty} @${p.avgPrice.toFixed(decimals)} · ${pnl}`;
  drawTag(ctx, geo.chartW - 4, y, label, color, false);

  // TP/SL 手柄（线右端两个圆点）：已设置为实心，未设置为半透明"拖出创建"
  const tpY = p.takeProfit !== undefined ? priceScale.priceToY(p.takeProfit) : y - 40;
  const slY = p.stopLoss !== undefined ? priceScale.priceToY(p.stopLoss) : y + 40;
  drawHandle(ctx, tpY, geo, '#26a69a', p.takeProfit !== undefined);
  drawHandle(ctx, slY, geo, '#ef5350', p.stopLoss !== undefined);
}

/** TP/SL 手柄默认位置（未设置时）：持仓线上下各 40px */
export function tpHandleY(position: PositionVisual, priceScale: PriceScale): number {
  return position.takeProfit !== undefined
    ? priceScale.priceToY(position.takeProfit)
    : priceScale.priceToY(position.avgPrice) - 40;
}

export function slHandleY(position: PositionVisual, priceScale: PriceScale): number {
  return position.stopLoss !== undefined
    ? priceScale.priceToY(position.stopLoss)
    : priceScale.priceToY(position.avgPrice) + 40;
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  y: number,
  geo: DrawGeometry,
  color: string,
  active: boolean,
): void {
  if (y < 0 || y > geo.chartH) return;
  const x = geo.chartW - 26;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = active ? 0.85 : 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (!active) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
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
  ctx.fillRect(x, y - h / 2, w, h);
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
  // 1) TP/SL 手柄（精确圆点）优先于带状命中
  if (p) {
    if (nearHandle(x, y, tpHandleY(p, priceScale), geo)) return { kind: 'tp' };
    if (nearHandle(x, y, slHandleY(p, priceScale), geo)) return { kind: 'sl' };
  }
  // 2) 挂单线（含撤单按钮区：标签右端窄区，避免与 TP/SL 手柄重叠）
  for (const o of visual.orders) {
    if (o.price === undefined) continue;
    const ly = priceScale.priceToY(o.price);
    if (Math.abs(y - ly) <= 5) {
      if (x >= geo.chartW - 30 && x <= geo.chartW) return { kind: 'order-cancel', id: o.id };
      return { kind: 'order', id: o.id };
    }
  }
  // 3) 持仓入场线（仅展示）
  if (p) {
    const py = priceScale.priceToY(p.avgPrice);
    if (Math.abs(y - py) <= 5) return { kind: 'position' };
  }
  return null;
}

function nearHandle(x: number, y: number, hy: number, geo: DrawGeometry): boolean {
  const hx = geo.chartW - 26;
  return Math.hypot(x - hx, y - hy) <= 9;
}

/** 撤单按钮命中区（标签右端） */
export function isOrderCancelArea(x: number, geo: DrawGeometry): boolean {
  return x >= geo.chartW - 30 && x <= geo.chartW;
}
