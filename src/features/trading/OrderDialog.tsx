import { useState } from 'react';
import type { OrderType, OrderSide, OrderSpec } from './paperEngine';
import { ORDER_TYPE_LABELS } from './orderLabels';
import { useTradeSettingsStore } from '@/store/tradeSettingsStore';
import { radius } from '@/ui/tokens';

/** 挂单对话框：限价 / 止损 / 止损限价 下单表单（颜色走 --buy/--sell token）
 *  数量初值与止损价偏移取交易偏好（三期-B2）；本组件常驻 Modal 内，每次打开重新挂载即重新播种。 */
export function OrderDialog({ price, onSubmit }: { price: number; onSubmit: (spec: OrderSpec) => void }) {
  const defaultQty = useTradeSettingsStore((s) => s.defaultQty);
  const stopOffsetPct = useTradeSettingsStore((s) => s.stopOffsetPct);
  const [type, setType] = useState<OrderType>('limit');
  const [side, setSide] = useState<OrderSide>('buy');
  const [qty, setQty] = useState(String(defaultQty));
  const [limitPrice, setLimitPrice] = useState(price > 0 ? price.toFixed(2) : '');
  const [stopPrice, setStopPrice] = useState(price > 0 ? (price * (1 + stopOffsetPct / 100)).toFixed(2) : '');

  const submit = () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;
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
          style={{
            ...chipStyle,
            flex: 1,
            background: side === 'buy' ? 'var(--buy)' : 'var(--panel-2)',
            color: side === 'buy' ? 'var(--on-updown)' : 'var(--text-dim)',
          }}
        >
          买入
        </button>
        <button
          onClick={() => setSide('sell')}
          style={{
            ...chipStyle,
            flex: 1,
            background: side === 'sell' ? 'var(--sell)' : 'var(--panel-2)',
            color: side === 'sell' ? 'var(--on-updown)' : 'var(--text-dim)',
          }}
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

const chipStyle: React.CSSProperties = {
  height: 24,
  padding: '0 10px',
  border: 'none',
  borderRadius: radius.sm,
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
  borderRadius: radius.sm,
  color: 'var(--text)',
  fontSize: 12,
  padding: '0 6px',
};
