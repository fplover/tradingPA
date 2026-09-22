/** 回放模拟交易引擎（纯逻辑，无框架依赖）：订单 / 挂单 / 持仓 / 盈亏 / 报告 */

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
}

export interface Position {
  side: 'long' | 'short';
  qty: number;
  avgPrice: number;
  /** 止盈价（图表拖拽手柄设置） */
  takeProfit?: number;
  /** 止损价（图表拖拽手柄设置） */
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

/**
 * 模拟交易引擎：
 * - market 立即成交；limit/stop/stop-limit 挂单，由 onBar 按 high/low 触发
 * - buy/sell 可开仓、加仓、反向减仓；平仓市价成交
 * - 每根 bar 标记持仓浮动盈亏并记录权益曲线
 */
export class PaperTradingEngine {
  balance: number;
  realizedPnL = 0;
  position: Position | null = null;
  unrealizedPnL = 0;
  orders: Order[] = [];
  trades: ClosedTrade[] = [];
  equityCurve: EquityPoint[] = [];
  /** 持仓开仓时间（报告用） */
  private entryTime = 0;

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

  /** 下订单：market 立即按 refPrice 成交，其余挂单 */
  place(spec: OrderSpec, refPrice: number, time: number): Order {
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
    if (this.orders.length > 100) this.orders.length = 100;
    return order;
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

  /** 每根 K 线检查止盈止损触发（多：触 TP 平多/触 SL 平多；空反之） */
  private checkTpSl(bar: { high: number; low: number; time: number }): void {
    const p = this.position;
    if (!p) return;
    const long = p.side === 'long';
    if (p.takeProfit !== undefined) {
      const hit = long ? bar.high >= p.takeProfit : bar.low <= p.takeProfit;
      if (hit) {
        this.closePosition(p.takeProfit, bar.time);
        return;
      }
    }
    if (p.stopLoss !== undefined) {
      const hit = long ? bar.low <= p.stopLoss : bar.high >= p.stopLoss;
      if (hit) {
        this.closePosition(p.stopLoss, bar.time);
      }
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

  /** 每根 K 线调用：标记盈亏 + 检查挂单触发 */
  onBar(bar: { time: number; high: number; low: number; close: number }): void {
    this.markToMarket(bar.close);
    this.checkTpSl(bar);
    for (const order of this.pendingOrders) {
      const fill = this.checkTrigger(order, bar);
      if (fill !== null) this.fill(order, fill, bar.time);
    }
    this.equityCurve.push({ time: bar.time, equity: this.equity });
    if (this.equityCurve.length > 5000) this.equityCurve.shift();
  }

  /** 返回成交价；未触发返回 null */
  private checkTrigger(order: Order, bar: { high: number; low: number }): number | null {
    const limit = order.limitPrice;
    const stop = order.stopPrice;
    switch (order.type) {
      case 'limit':
        if (order.side === 'buy' && limit !== undefined && bar.low <= limit) return limit;
        if (order.side === 'sell' && limit !== undefined && bar.high >= limit) return limit;
        return null;
      case 'stop':
        if (order.side === 'buy' && stop !== undefined && bar.high >= stop) return stop;
        if (order.side === 'sell' && stop !== undefined && bar.low <= stop) return stop;
        return null;
      case 'stop-limit': {
        // 先触价，再检查限价是否可达（均未满足则继续挂单）
        const triggered =
          order.side === 'buy'
            ? stop !== undefined && bar.high >= stop
            : stop !== undefined && bar.low <= stop;
        if (!triggered) return null;
        if (order.side === 'buy' && limit !== undefined && bar.low <= limit) return limit;
        if (order.side === 'sell' && limit !== undefined && bar.high >= limit) return limit;
        return null;
      }
      default:
        return null;
    }
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
    const wins = this.trades.filter((t) => t.pnl > 0);
    const losses = this.trades.filter((t) => t.pnl <= 0);
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
      winRate: this.trades.length > 0 ? (wins.length / this.trades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      maxDrawdownPct: maxDd * 100,
      avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
      avgLoss: losses.length > 0 ? -grossLoss / losses.length : 0,
      openPosition: this.position ? { ...this.position } : null,
      unrealizedPnL: this.unrealizedPnL,
      pendingOrders: this.pendingOrders.length,
    };
  }
}
