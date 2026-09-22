import { useState } from 'react';
import { Plus, X, FileText } from 'lucide-react';
import { useTradeStore } from './tradeStore';
import { Modal, Tab, TabList } from '@/ui/primitives';
import * as Tabs from '@radix-ui/react-tabs';
import type { OrderType, OrderSide } from './paperEngine';

const fmtQty = (q: number) => String(Number(q.toFixed(8)));

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  market: '市价',
  limit: '限价',
  stop: '止损',
  'stop-limit': '止损限价',
};

interface TradePanelProps {
  price: number;
  time: number;
  onReport: () => void;
}

/** 回放交易面板（底部）：挂单入口 + 挂单/持仓/成交页签 */
export function TradePanel({ price, time, onReport }: TradePanelProps) {
  const version = useTradeStore((s) => s.version);
  const engine = useTradeStore((s) => s.engine);
  const place = useTradeStore((s) => s.place);
  const cancel = useTradeStore((s) => s.cancel);

  const [tab, setTab] = useState<'pending' | 'position' | 'trades'>('pending');
  const [dialogOpen, setDialogOpen] = useState(false);

  void version;
  const qtyNum = 0.01; // 挂单对话框默认数量
  const pending = engine.pendingOrders;
  const position = engine.position;
  const pnlColor = (v: number) => (v >= 0 ? '#26a69a' : '#ef5350');

  return (
    <div style={panelStyle}>
      {/* 头部：标题 + 权益 + 入口 */}
      <div style={headerStyle}>
        <strong style={{ color: 'var(--text)', fontSize: 12 }}>回放交易面板</strong>
        <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>
          权益 {engine.equity.toFixed(2)} · 浮动 <b style={{ color: pnlColor(engine.unrealizedPnL) }}>{engine.unrealizedPnL >= 0 ? '+' : ''}{engine.unrealizedPnL.toFixed(2)}</b>
        </span>
        <div style={{ flex: 1 }} />
        <button style={iconBtn} title="限价 / 止损挂单" onClick={() => setDialogOpen(true)}>
          <Plus size={13} />
        </button>
        <button style={iconBtn} title="交易报告" onClick={onReport}>
          <FileText size={13} />
        </button>
      </div>

      {/* 页签 + 列表 */}
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabList>
          {(
            [
              ['pending', `挂单 (${pending.length})`],
              ['position', position ? `持仓 (${fmtQty(position.qty)})` : '持仓'],
              ['trades', `成交 (${engine.trades.length})`],
            ] as const
          ).map(([key, label]) => (
            <Tab key={key} value={key} active={tab === key}>
              {label}
            </Tab>
          ))}
        </TabList>

        <div style={listStyle}>
          <Tabs.Content value="pending">
            {pending.length === 0 ? (
              <Empty text="无挂单" />
            ) : (
              pending.map((o) => (
                <Row key={o.id}>
                  <span style={{ color: o.side === 'buy' ? '#26a69a' : '#ef5350' }}>{o.side === 'buy' ? '买' : '卖'}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{ORDER_TYPE_LABELS[o.type]}</span>
                  <span style={{ color: 'var(--text)' }}>{fmtQty(o.qty)}</span>
                  <span style={{ color: 'var(--text-faint)' }}>
                    {o.limitPrice ? `限 ${o.limitPrice}` : ''} {o.stopPrice ? `止 ${o.stopPrice}` : ''}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button style={iconBtn} title="撤单" onClick={() => cancel(o.id)}>
                    <X size={12} />
                  </button>
                </Row>
              ))
            )}
          </Tabs.Content>

          <Tabs.Content value="position">
            {position ? (
              <Row>
                <span style={{ color: position.side === 'long' ? '#26a69a' : '#ef5350' }}>{position.side === 'long' ? '多' : '空'}</span>
                <span style={{ color: 'var(--text)' }}>{fmtQty(position.qty)}</span>
                <span style={{ color: 'var(--text-dim)' }}>@ {position.avgPrice.toFixed(2)}</span>
                <div style={{ flex: 1 }} />
                <b style={{ color: pnlColor(engine.unrealizedPnL) }}>
                  {engine.unrealizedPnL >= 0 ? '+' : ''}{engine.unrealizedPnL.toFixed(2)}
                </b>
              </Row>
            ) : (
              <Empty text="无持仓" />
            )}
          </Tabs.Content>

          <Tabs.Content value="trades">
            {engine.trades.length === 0 ? (
              <Empty text="无成交" />
            ) : (
              engine.trades.slice(0, 20).map((t) => (
                <Row key={t.id}>
                  <span style={{ color: t.side === 'long' ? '#26a69a' : '#ef5350' }}>{t.side === 'long' ? '多' : '空'}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{fmtQty(t.qty)}</span>
                  <span style={{ color: 'var(--text-faint)' }}>
                    {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}
                  </span>
                  <div style={{ flex: 1 }} />
                  <b style={{ color: pnlColor(t.pnl) }}>
                    {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                  </b>
                </Row>
              ))
            )}
          </Tabs.Content>
        </div>
      </Tabs.Root>

      <Modal open={dialogOpen} onOpenChange={setDialogOpen} title="挂单" width={280}>
        <OrderDialog
          price={price}
          qtyNum={qtyNum}
          onSubmit={(spec) => {
            place(spec, price, time);
            setDialogOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}

/** 挂单对话框：限价 / 止损 / 止损限价 */
function OrderDialog({
  price,
  qtyNum,
  onSubmit,
}: {
  price: number;
  qtyNum: number;
  onSubmit: (spec: { type: OrderType; side: OrderSide; qty: number; limitPrice?: number; stopPrice?: number }) => void;
}) {
  const [type, setType] = useState<OrderType>('limit');
  const [side, setSide] = useState<OrderSide>('buy');
  const [qty, setQty] = useState(String(qtyNum || 0.01));
  const [limitPrice, setLimitPrice] = useState(price > 0 ? price.toFixed(2) : '');
  const [stopPrice, setStopPrice] = useState(price > 0 ? (price * 1.01).toFixed(2) : '');

  const submit = () => {
    const q = Number(qty);
    if (q <= 0) return;
    onSubmit({
      type,
      side,
      qty: q,
      limitPrice: type === 'stop' ? undefined : Number(limitPrice) || undefined,
      stopPrice: type === 'limit' ? undefined : Number(stopPrice) || undefined,
    });
  };

  return (
    <div>
      {/* 类型 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['limit', 'stop', 'stop-limit'] as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              ...chipStyle,
              background: type === t ? 'var(--accent)' : 'var(--panel-2)',
              color: type === t ? 'var(--text-on-accent)' : 'var(--text-dim)',
            }}
          >
            {ORDER_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* 方向 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button
          onClick={() => setSide('buy')}
          style={{ ...chipStyle, flex: 1, background: side === 'buy' ? '#26a69a' : 'var(--panel-2)', color: side === 'buy' ? '#fff' : 'var(--text-dim)' }}
        >
          买入
        </button>
        <button
          onClick={() => setSide('sell')}
          style={{ ...chipStyle, flex: 1, background: side === 'sell' ? '#ef5350' : 'var(--panel-2)', color: side === 'sell' ? '#fff' : 'var(--text-dim)' }}
        >
          卖出
        </button>
      </div>

      <label style={fieldLabel}>
        数量
        <input value={qty} onChange={(e) => setQty(e.target.value)} style={fieldInput} />
      </label>
      {type !== 'stop' && (
        <label style={fieldLabel}>
          限价
          <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} style={fieldInput} />
        </label>
      )}
      {type !== 'limit' && (
        <label style={fieldLabel}>
          止损价
          <input value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} style={fieldInput} />
        </label>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
        <button style={{ ...chipStyle, background: 'var(--accent)', color: 'var(--text-on-accent)' }} onClick={submit}>
          下单
        </button>
      </div>
      <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 6 }}>
        当前价 {price > 0 ? price.toFixed(2) : '--'} · 挂单在回放触及价格时成交
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', fontSize: 11, borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: '10px 2px', textAlign: 'center' }}>{text}</div>;
}

const panelStyle: React.CSSProperties = {
  background: 'var(--panel)',
  borderTop: '1px solid var(--border)',
  padding: '6px 10px 8px',
  flexShrink: 0,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
};

const iconBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  padding: 2,
  borderRadius: 4,
};

const listStyle: React.CSSProperties = {
  maxHeight: 108,
  overflowY: 'auto',
};

const chipStyle: React.CSSProperties = {
  height: 24,
  padding: '0 10px',
  border: 'none',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
};

const fieldLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: 'var(--text-dim)',
  marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
  flex: 1,
  height: 24,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
  padding: '0 6px',
};
