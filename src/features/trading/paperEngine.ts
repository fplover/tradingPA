/** 回放模拟交易引擎（纯逻辑，无框架依赖）：订单 / 挂单 / 持仓 / 盈亏 / 报告 */

import { checkOrderTrigger, validateOrderSpec } from './orderTrigger';

export type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'filled' | 'cancelled';

export interface Order {
  id: string;
  type: OrderType;
  side: OrderSide;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  status: OrderStatus;
  filledPrice?: number;
  filledTime?: number;
  createdAt: number;
  /** stop-limit 触发段已完成（此后按限价单等待） */
  triggered?: boolean;
}

export interface Position {
  side: 'long' | 'short';
  qty: number;
  avgPrice: number;
  /** 止盈/止损价（图表拖拽手柄设置） */
  takeProfit?: number;
  stopLoss?: number;
}

export interface ClosedTrade {
  id: string;
  side: 'long' | 'short';
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  entryTime: number;
  exitTime: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface OrderSpec {
  type: OrderType;
  side: OrderSide;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
}

export interface TradeSummary {
  initialBalance: number;
  finalEquity: number;
  netPnL: number;
  returnPct: number;
  totalTrades: number;
  winTrades: number;
  loseTrades: number;
  /** 保本单数量（pnl === 0，不计胜负；典型为「止损价 = 开仓均价」的保本止损） */
  breakEvenTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgWin: number;
  avgLoss: number;
  openPosition: Position | null;
  unrealizedPnL: number;
  pendingOrders: number;
}

let seq = 0;

/** 模拟交易引擎：market 立即成交；limit/stop/stop-limit 挂单由 onBar 触发；可开/加/减仓并记录权益曲线 */
export class PaperTradingEngine {
  balance: number;
  realizedPnL = 0;
  position: Position | null = null;
  unrealizedPnL = 0;
  orders: Order[] = [];
  trades: ClosedTrade[] = [];
  equityCurve: EquityPoint[] = [];
  /** 持仓开仓时间（图表进出场标记用，平仓后归零） */
  entryTime = 0;

  constructor(initialBalance = 100_000) {
    this.balance = initialBalance;
  }

  get equity(): number {
    return this.balance + this.realizedPnL + this.unrealizedPnL;
  }

  get pendingOrders(): Order[] {
    return this.orders.filter((o) => o.status === 'pending');
  }

  reset(balance = this.balance): void {
    this.balance = balance;
    this.realizedPnL = 0;
    this.position = null;
    this.unrealizedPnL = 0;
    this.orders = [];
    this.trades = [];
    this.equityCurve = [];
    this.entryTime = 0;
  }

  /** 下订单：market 立即按 refPrice 成交，其余挂单；无效单拒绝并返回 null */
  place(spec: OrderSpec, refPrice: number, time: number): Order | null {
    const invalid = validateOrderSpec(spec);
    if (invalid) return null;
    const order: Order = {
      id: `ord_${++seq}`,
      type: spec.type,
      side: spec.side,
      qty: spec.qty,
      limitPrice: spec.limitPrice,
      stopPrice: spec.stopPrice,
      status: 'pending',
      createdAt: time,
    };
    if (spec.type === 'market') {
      this.fill(order, refPrice, time);
    }
    this.orders.unshift(order);
    this.trimOrders();
    return order;
  }

  /**
   * 订单表截断（上限 100）：只淘汰最老的终态订单（已成交/已撤销）。
   * pending 挂单是用户真实委托，不因截断消失——终态淘汰完仍超限时保留全部
   * pending（上限对挂单让位：用户自挂的单不应被静默丢掉，用户口径 2026-10-08）。
   */
  private trimOrders(): void {
    for (let i = this.orders.length - 1; i >= 0 && this.orders.length > 100; i--) {
      if (this.orders[i].status !== 'pending') this.orders.splice(i, 1);
    }
  }

  cancel(id: string): void {
    const o = this.orders.find((x) => x.id === id);
    if (o && o.status === 'pending') o.status = 'cancelled';
  }

  /** 挂单改价（限价单拖动改价） */
  updateOrderPrice(id: string, price: number): void {
    const o = this.orders.find((x) => x.id === id);
    if (!o || o.status !== 'pending') return;
    if (o.type === 'limit' || o.type === 'stop-limit') o.limitPrice = price;
    if (o.type === 'stop' || o.type === 'stop-limit') o.stopPrice = price;
  }

  /** 设置/清除持仓止盈止损（null 清除） */
  setPositionTPSL(tp: number | null, sl: number | null): void {
    if (!this.position) return;
    this.position.takeProfit = tp ?? undefined;
    this.position.stopLoss = sl ?? undefined;
  }

  /**
   * 每根 K 线检查止盈止损触发（与 orderTrigger 同构的 gap 语义 + 保守优先，用户裁决 2026-10-03）：
   * - 开盘跳穿：止损按开盘价成交（更差价，不低估亏损）；止盈按开盘价成交（更优价，真实成交语义）
   * - 同 bar 双触：先判止损（保守）——旧实现永远先判 TP 偏乐观
   */
  private checkTpSl(bar: { open: number; high: number; low: number; time: number }): void {
    const p = this.position;
    if (!p) return;
    const long = p.side === 'long';
    if (p.stopLoss !== undefined) {
      const gap = long ? bar.open <= p.stopLoss : bar.open >= p.stopLoss;
      if (gap) {
        this.closePosition(bar.open, bar.time);
        return;
      }
      const hit = long ? bar.low <= p.stopLoss : bar.high >= p.stopLoss;
      if (hit) {
        this.closePosition(p.stopLoss, bar.time);
        return;
      }
    }
    if (p.takeProfit !== undefined) {
      const gap = long ? bar.open >= p.takeProfit : bar.open <= p.takeProfit;
      if (gap) {
        this.closePosition(bar.open, bar.time);
        return;
      }
      const hit = long ? bar.high >= p.takeProfit : bar.low <= p.takeProfit;
      if (hit) this.closePosition(p.takeProfit, bar.time);
    }
  }

  /** 市价平掉全部持仓 */
  closePosition(refPrice: number, time: number): ClosedTrade | null {
    if (!this.position) return null;
    const p = this.position;
    const pnl = (p.side === 'long' ? refPrice - p.avgPrice : p.avgPrice - refPrice) * p.qty;
    const trade: ClosedTrade = {
      id: `trd_${++seq}`,
      side: p.side,
      qty: p.qty,
      entryPrice: p.avgPrice,
      exitPrice: refPrice,
      pnl,
      entryTime: this.entryTime,
      exitTime: time,
    };
    this.trades.unshift(trade);
    this.realizedPnL += pnl;
    this.position = null;
    this.unrealizedPnL = 0;
    return trade;
  }

  /** 每根 K 线调用：标记盈亏 + 检查挂单触发（bar 需含开盘价，gap 语义判定用） */
  onBar(bar: { time: number; open: number; high: number; low: number; close: number }): void {
    this.markToMarket(bar.close);
    this.checkTpSl(bar);
    for (const order of this.pendingOrders) {
      const result = checkOrderTrigger(order, bar);
      if (result.activated) order.triggered = true;
      if (result.fillPrice !== null) this.fill(order, result.fillPrice, bar.time);
    }
    this.equityCurve.push({ time: bar.time, equity: this.equity });
    if (this.equityCurve.length > 5000) this.equityCurve.shift();
  }

  private fill(order: Order, price: number, time: number): void {
    order.status = 'filled';
    order.filledPrice = price;
    order.filledTime = time;
    this.applyFill(order.side, order.qty, price, time);
    // 成交后按成交价重新标记剩余持仓（全平则归零），避免权益虚高
    this.markToMarket(price);
  }

  /** 成交应用到持仓：开/加/减/反手 */
  private applyFill(side: OrderSide, qty: number, price: number, time: number): void {
    if (!this.position) {
      this.position = { side: side === 'buy' ? 'long' : 'short', qty, avgPrice: price };
      this.entryTime = time;
      return;
    }
    const p = this.position;
    const sameDir = (side === 'buy') === (p.side === 'long');
    if (sameDir) {
      // 加仓
      const totalQty = p.qty + qty;
      p.avgPrice = (p.avgPrice * p.qty + price * qty) / totalQty;
      p.qty = totalQty;
      return;
    }
    // 反向：先平掉部分或全部
    const closeQty = Math.min(qty, p.qty);
    const pnl = (p.side === 'long' ? price - p.avgPrice : p.avgPrice - price) * closeQty;
    this.realizedPnL += pnl;
    this.trades.unshift({
      id: `trd_${++seq}`,
      side: p.side,
      qty: closeQty,
      entryPrice: p.avgPrice,
      exitPrice: price,
      pnl,
      entryTime: this.entryTime,
      exitTime: time,
    });
    p.qty -= closeQty;
    if (p.qty <= 1e-12) {
      const rest = qty - closeQty;
      this.position = null;
      this.entryTime = 0;
      if (rest > 1e-12) {
        this.position = { side: side === 'buy' ? 'long' : 'short', qty: rest, avgPrice: price };
        this.entryTime = time;
      }
    }
  }

  private markToMarket(price: number): void {
    if (!this.position) {
      this.unrealizedPnL = 0;
      return;
    }
    const p = this.position;
    this.unrealizedPnL = (p.side === 'long' ? price - p.avgPrice : p.avgPrice - price) * p.qty;
  }

  summary(): TradeSummary {
    const finalEquity = this.equity;
    const netPnL = finalEquity - this.balance;
    // 保本单（pnl === 0，典型为「止损价 = 开仓均价」的 break-even stop）不构成
    // 真实亏损：亏损统计只计 pnl < 0，保本单单独计数供 UI 明示（用户口径 2026-10-08）
    const wins = this.trades.filter((t) => t.pnl > 0);
    const losses = this.trades.filter((t) => t.pnl < 0);
    const breakEvens = this.trades.filter((t) => t.pnl === 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    let peak = this.balance;
    let maxDd = 0;
    for (const pt of this.equityCurve) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = peak > 0 ? (peak - pt.equity) / peak : 0;
      if (dd > maxDd) maxDd = dd;
    }
    return {
      initialBalance: this.balance,
      finalEquity,
      netPnL,
      returnPct: this.balance > 0 ? (netPnL / this.balance) * 100 : 0,
      totalTrades: this.trades.length,
      winTrades: wins.length,
      loseTrades: losses.length,
      breakEvenTrades: breakEvens.length,
      winRate: this.trades.length > 0 ? (wins.length / this.trades.length) * 100 : 0,
      // 无亏损交易（grossLoss === 0，含全胜与全部保本）时给确定值 0：Infinity 经
      // JSON 序列化会变 null 且不可比较，0 可序列化；UI 以「无亏损」明示该语义，
      // 此处的 0 不是「盈亏比为零」而是「无亏损交易、比值不适用」（用户口径 2026-10-08）
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
      maxDrawdownPct: maxDd * 100,
      avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
      avgLoss: losses.length > 0 ? -grossLoss / losses.length : 0,
      openPosition: this.position ? { ...this.position } : null,
      unrealizedPnL: this.unrealizedPnL,
      pendingOrders: this.pendingOrders.length,
    };
  }
}
