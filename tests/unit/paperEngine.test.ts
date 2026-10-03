import { describe, expect, it } from 'vitest';
import { PaperTradingEngine } from '@/features/trading/paperEngine';

const bar = (time: number, o: number, h: number, l: number, c: number) => ({
  time,
  open: o,
  high: h,
  low: l,
  close: c,
});

describe('PaperTradingEngine 市价单', () => {
  it('市价买入立即开多并标记浮动盈亏', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 2 }, 100, 1);
    expect(e.position).toEqual({ side: 'long', qty: 2, avgPrice: 100 });
    e.onBar(bar(2, 100, 110, 99, 105));
    expect(e.unrealizedPnL).toBeCloseTo((105 - 100) * 2, 10);
    expect(e.equity).toBeCloseTo(10_010, 10);
  });

  it('平仓实现盈亏并清空持仓', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    const trade = e.closePosition(110, 2);
    expect(trade!.pnl).toBe(10);
    expect(e.realizedPnL).toBe(10);
    expect(e.position).toBeNull();
    expect(e.equity).toBe(10_010);
  });

  it('加仓按加权均价', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 120, 2);
    expect(e.position!.avgPrice).toBe(110);
    expect(e.position!.qty).toBe(2);
  });

  it('反向单先平后开', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.place({ type: 'market', side: 'sell', qty: 2 }, 120, 2);
    // 平掉 1 份多（赚 20），剩余 1 份开空 @120
    expect(e.realizedPnL).toBe(20);
    expect(e.position).toEqual({ side: 'short', qty: 1, avgPrice: 120 });
    expect(e.trades.length).toBe(1);
  });
});

describe('PaperTradingEngine 挂单触发', () => {
  it('限价买入：跌到限价才成交', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'limit', side: 'buy', qty: 1, limitPrice: 95 }, 100, 1);
    e.onBar(bar(2, 100, 101, 98, 99)); // 没到 95
    expect(e.pendingOrders.length).toBe(1);
    e.onBar(bar(3, 99, 99, 94, 96)); // 触及 95
    expect(e.pendingOrders.length).toBe(0);
    expect(e.position!.avgPrice).toBe(95);
  });

  it('止损卖出：跌破止损价触发', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.place({ type: 'stop', side: 'sell', qty: 1, stopPrice: 90 }, 100, 2);
    e.onBar(bar(3, 100, 100, 91, 92)); // 未触及 90
    expect(e.position).not.toBeNull();
    e.onBar(bar(4, 92, 92, 89, 90)); // 跌破 90
    expect(e.position).toBeNull();
    expect(e.trades[0].pnl).toBeCloseTo(-10, 10);
  });

  it('止损限价：触价但限价不可达则继续挂单', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'stop-limit', side: 'buy', qty: 1, stopPrice: 105, limitPrice: 106 }, 100, 1);
    e.onBar(bar(2, 100, 106, 99, 104)); // 触发（high>=105）但最低 99 <= 106 → 可成交
    expect(e.pendingOrders.length).toBe(0);
    expect(e.position!.avgPrice).toBe(106);

    const e2 = new PaperTradingEngine(10_000);
    e2.place({ type: 'stop-limit', side: 'buy', qty: 1, stopPrice: 105, limitPrice: 100 }, 100, 2);
    e2.onBar(bar(3, 100, 106, 104, 105)); // 触发但最低 104 > 100 → 不可达
    expect(e2.pendingOrders.length).toBe(1);
  });

  it('撤单', () => {
    const e = new PaperTradingEngine(10_000);
    const o = e.place({ type: 'limit', side: 'buy', qty: 1, limitPrice: 90 }, 100, 1);
    e.cancel(o!.id);
    expect(e.pendingOrders.length).toBe(0);
    expect(o!.status).toBe('cancelled');
  });

  it('stop-limit 触发后激活限价段：后续 bar 无需再触止损价', () => {
    const e = new PaperTradingEngine(10_000);
    // gap 开盘越过 105 且未到限价 106（low 未下探）→ 激活不成交
    e.place({ type: 'stop-limit', side: 'buy', qty: 1, stopPrice: 105, limitPrice: 106 }, 100, 1);
    e.onBar(bar(2, 107, 108, 106.5, 107));
    expect(e.pendingOrders.length).toBe(1);
    // 下一 bar 价格回落：high 未再触 105，开盘 104 <= 106 → 限价段已激活，按更优开盘价成交
    e.onBar(bar(3, 104, 104.5, 100, 101));
    expect(e.pendingOrders.length).toBe(0);
    expect(e.position!.avgPrice).toBe(104);
  });

  it('挂单成交后记录权益曲线', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'limit', side: 'sell', qty: 1, limitPrice: 110 }, 100, 1);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.onBar(bar(2, 100, 112, 99, 111));
    expect(e.realizedPnL).toBe(10);
    expect(e.equityCurve.length).toBe(1);
    expect(e.equityCurve[0].equity).toBeCloseTo(10_010, 10);
  });
});

describe('PaperTradingEngine 止盈止损', () => {
  it('多单止盈触发：high 触及 TP 按 TP 价平仓', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.setPositionTPSL(110, null);
    e.onBar(bar(2, 100, 105, 99, 104)); // 未触及
    expect(e.position).not.toBeNull();
    e.onBar(bar(3, 104, 111, 103, 110)); // 触及 TP
    expect(e.position).toBeNull();
    expect(e.trades[0].pnl).toBeCloseTo(10, 10);
    expect(e.trades[0].exitPrice).toBe(110);
  });

  it('多单止损触发：low 跌破 SL 按 SL 价平仓', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.setPositionTPSL(null, 95);
    e.onBar(bar(2, 100, 100, 96, 97)); // 未跌破
    expect(e.position).not.toBeNull();
    e.onBar(bar(3, 97, 97, 94, 95)); // 跌破
    expect(e.position).toBeNull();
    expect(e.trades[0].pnl).toBeCloseTo(-5, 10);
  });

  it('空单止盈止损方向相反', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'sell', qty: 1 }, 100, 1);
    e.setPositionTPSL(90, 110);
    e.onBar(bar(2, 100, 100, 96, 97)); // 空单：跌是盈利方向，未触 TP(90)
    expect(e.position).not.toBeNull();
    e.onBar(bar(3, 97, 97, 89, 90)); // 跌至 90 触 TP
    expect(e.position).toBeNull();
    expect(e.trades[0].pnl).toBeCloseTo(10, 10);
  });

  it('挂单改价：限价单拖动后按新价成交', () => {
    const e = new PaperTradingEngine(10_000);
    const o = e.place({ type: 'limit', side: 'buy', qty: 1, limitPrice: 95 }, 100, 1)!;
    e.updateOrderPrice(o.id, 90);
    e.onBar(bar(2, 100, 100, 94, 95)); // 94 > 90 不成交
    expect(e.pendingOrders.length).toBe(1);
    e.onBar(bar(3, 95, 95, 89, 90)); // 触及新价 90
    expect(e.pendingOrders.length).toBe(0);
    expect(e.position!.avgPrice).toBe(90);
  });
});

describe('PaperTradingEngine gap 开盘跳价（TV 语义）', () => {
  it('buy limit：开盘跳低于限价按更优开盘价成交', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'limit', side: 'buy', qty: 1, limitPrice: 95 }, 100, 1);
    e.onBar(bar(2, 90, 91, 88, 89)); // 开盘 90 < 95 → 按开盘 90 成交
    expect(e.pendingOrders.length).toBe(0);
    expect(e.position!.avgPrice).toBe(90);
  });

  it('sell limit：开盘跳高于限价按更优开盘价成交', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.place({ type: 'limit', side: 'sell', qty: 1, limitPrice: 110 }, 100, 2);
    e.onBar(bar(3, 115, 116, 112, 113)); // 开盘 115 > 110 → 按开盘 115 成交
    expect(e.trades[0].exitPrice).toBe(115);
    expect(e.realizedPnL).toBe(15);
  });

  it('sell stop：开盘跳穿触发价按开盘价成交（转市价）', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.place({ type: 'stop', side: 'sell', qty: 1, stopPrice: 90 }, 100, 2);
    e.onBar(bar(3, 85, 86, 84, 85.5)); // 开盘 85 直接低于 90 → 按开盘 85 成交
    expect(e.position).toBeNull();
    expect(e.trades[0].exitPrice).toBe(85);
    expect(e.trades[0].pnl).toBeCloseTo(-15, 10);
  });

  it('buy stop：开盘跳穿触发价按开盘价成交', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'stop', side: 'buy', qty: 1, stopPrice: 105 }, 100, 1);
    e.onBar(bar(2, 107, 108, 106, 107.5)); // 开盘 107 > 105 → 按开盘 107 成交
    expect(e.position!.avgPrice).toBe(107);
  });

  it('stop-limit：gap 开盘越过触发价但未到限价 → 激活后等待，后续按限价成交', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'stop-limit', side: 'buy', qty: 1, stopPrice: 105, limitPrice: 106 }, 100, 1);
    e.onBar(bar(2, 108, 109, 107, 108)); // 开盘越过 105 但 > 限价 106 → 激活不成交
    expect(e.pendingOrders.length).toBe(1);
    expect(e.pendingOrders[0].triggered).toBe(true);
    e.onBar(bar(3, 107, 107, 105, 105.5)); // low <= 106 → 按限价 106 成交
    expect(e.pendingOrders.length).toBe(0);
    expect(e.position!.avgPrice).toBe(106);
  });

  it('stop-limit：gap 开盘落在触发价与限价之间 → 立即按更优开盘价成交', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'stop-limit', side: 'buy', qty: 1, stopPrice: 105, limitPrice: 106 }, 100, 1);
    e.onBar(bar(2, 105.5, 106.2, 105.2, 106)); // 开盘 105.5 ∈ [105, 106] → 按开盘 105.5 成交
    expect(e.pendingOrders.length).toBe(0);
    expect(e.position!.avgPrice).toBe(105.5);
  });
});

describe('PaperTradingEngine 无效单拒绝', () => {
  it('数量非正拒绝', () => {
    const e = new PaperTradingEngine(10_000);
    expect(e.place({ type: 'market', side: 'buy', qty: 0 }, 100, 1)).toBeNull();
    expect(e.place({ type: 'market', side: 'buy', qty: -1 }, 100, 1)).toBeNull();
    expect(e.place({ type: 'market', side: 'buy', qty: NaN }, 100, 1)).toBeNull();
    expect(e.orders.length).toBe(0);
  });

  it('缺限价/触发价/非有限价格拒绝', () => {
    const e = new PaperTradingEngine(10_000);
    expect(e.place({ type: 'limit', side: 'buy', qty: 1 }, 100, 1)).toBeNull();
    expect(e.place({ type: 'limit', side: 'buy', qty: 1, limitPrice: -5 }, 100, 1)).toBeNull();
    expect(e.place({ type: 'limit', side: 'buy', qty: 1, limitPrice: NaN }, 100, 1)).toBeNull();
    expect(e.place({ type: 'stop', side: 'buy', qty: 1 }, 100, 1)).toBeNull();
    expect(e.place({ type: 'stop-limit', side: 'buy', qty: 1, stopPrice: 105 }, 100, 1)).toBeNull();
    expect(e.place({ type: 'stop-limit', side: 'buy', qty: 1, limitPrice: 106 }, 100, 1)).toBeNull();
    expect(e.orders.length).toBe(0);
  });

  it('合法单不受影响（market 立即成交）', () => {
    const e = new PaperTradingEngine(10_000);
    expect(e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1)).not.toBeNull();
    expect(e.position!.avgPrice).toBe(100);
  });
});

describe('PaperTradingEngine 总结报告', () => {
  it('统计胜率/盈亏比/回撤', () => {
    const e = new PaperTradingEngine(10_000);
    // 两笔赢一笔输（经 onBar 记录权益曲线）
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.onBar(bar(2, 100, 110, 99, 110));
    e.closePosition(110, 2); // +10
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 3);
    e.onBar(bar(4, 100, 105, 99, 105));
    e.closePosition(105, 4); // +5
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 5);
    e.onBar(bar(6, 100, 100, 95, 95));
    e.closePosition(95, 6); // -5
    const s = e.summary();
    expect(s.totalTrades).toBe(3);
    expect(s.winTrades).toBe(2);
    expect(s.loseTrades).toBe(1);
    expect(s.winRate).toBeCloseTo((2 / 3) * 100, 6);
    expect(s.netPnL).toBe(10);
    expect(s.profitFactor).toBeCloseTo(15 / 5, 6);
    expect(s.returnPct).toBeCloseTo(0.1, 6);
    expect(s.maxDrawdownPct).toBeGreaterThan(0);
  });

  it('空报告不除零', () => {
    const e = new PaperTradingEngine(10_000);
    const s = e.summary();
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.profitFactor).toBe(0);
    expect(s.maxDrawdownPct).toBe(0);
  });

  it('reset 清空全部状态', () => {
    const e = new PaperTradingEngine(10_000);
    e.place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    e.onBar(bar(2, 100, 101, 99, 100));
    e.reset(50_000);
    expect(e.trades.length).toBe(0);
    expect(e.position).toBeNull();
    expect(e.equityCurve.length).toBe(0);
    expect(e.balance).toBe(50_000);
  });
});
