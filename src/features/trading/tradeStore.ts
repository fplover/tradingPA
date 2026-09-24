import { create } from 'zustand';
import { PaperTradingEngine, type OrderSpec, type Position } from './paperEngine';
import type { TradeMarker, TradeVisual } from '@/engine/renderer/drawTrading';

interface TradeStore {
  engine: PaperTradingEngine;
  /** 变更版本号：引擎是可变对象，用它触发 React 重渲染 */
  version: number;
  place: (spec: OrderSpec, refPrice: number, time: number) => void;
  cancel: (id: string) => void;
  closePosition: (refPrice: number, time: number) => void;
  onBar: (bar: { time: number; high: number; low: number; close: number }) => void;
  reset: (balance?: number) => void;
  updateOrderPrice: (id: string, price: number) => void;
  setPositionTPSL: (tp: number | null, sl: number | null) => void;
  /** 构造图表可视化数据（挂单线/持仓线） */
  visual: () => TradeVisual;
}

export const useTradeStore = create<TradeStore>((set, get) => ({
  engine: new PaperTradingEngine(100_000),
  version: 0,
  place: (spec, refPrice, time) => {
    get().engine.place(spec, refPrice, time);
    set((s) => ({ version: s.version + 1 }));
  },
  cancel: (id) => {
    get().engine.cancel(id);
    set((s) => ({ version: s.version + 1 }));
  },
  closePosition: (refPrice, time) => {
    get().engine.closePosition(refPrice, time);
    set((s) => ({ version: s.version + 1 }));
  },
  onBar: (bar) => {
    get().engine.onBar(bar);
    set((s) => ({ version: s.version + 1 }));
  },
  reset: (balance) => {
    get().engine.reset(balance);
    set((s) => ({ version: s.version + 1 }));
  },
  updateOrderPrice: (id, price) => {
    get().engine.updateOrderPrice(id, price);
    set((s) => ({ version: s.version + 1 }));
  },
  setPositionTPSL: (tp, sl) => {
    get().engine.setPositionTPSL(tp, sl);
    set((s) => ({ version: s.version + 1 }));
  },
  visual: () => {
    const e = get().engine;
    const p: Position | null = e.position;
    const entries: TradeMarker[] = [];
    const exits: TradeMarker[] = [];
    // 当前持仓：开仓点一个
    if (p && e.entryTime > 0) {
      entries.push({ time: e.entryTime, price: p.avgPrice, side: p.side === 'long' ? 'buy' : 'sell', kind: 'entry' });
    }
    // 已平仓交易：入场 + 平仓两点（平多记为卖、平空记为买）
    for (const t of e.trades.slice(0, 200)) {
      entries.push({ time: t.entryTime, price: t.entryPrice, side: t.side === 'long' ? 'buy' : 'sell', kind: 'entry' });
      exits.push({ time: t.exitTime, price: t.exitPrice, side: t.side === 'long' ? 'sell' : 'buy', kind: 'exit' });
    }
    return {
      orders: e.pendingOrders.map((o) => ({
        id: o.id,
        side: o.side,
        type: o.type,
        qty: o.qty,
        price: o.limitPrice ?? o.stopPrice,
      })),
      position: p
        ? {
            side: p.side,
            qty: p.qty,
            avgPrice: p.avgPrice,
            takeProfit: p.takeProfit,
            stopLoss: p.stopLoss,
            pnl: e.unrealizedPnL,
          }
        : null,
      entries,
      exits,
    };
  },
}));
