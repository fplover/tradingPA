import { useState } from 'react';
import { useOrderMenuStore } from '@/store/orderMenuStore';
import { useTradeStore } from './tradeStore';

/** 图表点击下单浮窗（TV 风格）：市价/限价 + 买/卖 + 数量 + 价格 */
export function ChartOrderMenu({ decimals }: { decimals: number }) {
  const { open, price, time, x, y, close } = useOrderMenuStore();
  const place = useTradeStore((s) => s.place);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('limit');
  const [qty, setQty] = useState('0.01');
  const [limitPrice, setLimitPrice] = useState('');

  if (!open) return null;

  const submit = () => {
    const q = Math.max(0, Number(qty) || 0);
    if (q <= 0 || price <= 0) return;
    if (type === 'market') {
      place({ type: 'market', side, qty: q }, price, time);
    } else {
      const lp = Number(limitPrice) || price;
      place({ type: 'limit', side, qty: q, limitPrice: lp }, price, time);
    }
    close();
  };

  // 靠近右/下边缘时翻转，避免超出视口
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - 260);

  return (
    <div style={{ ...overlayStyle }} onPointerDown={close}>
      <div style={{ ...menuStyle, left, top }} onPointerDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button
            onClick={() => setSide('buy')}
            style={{ ...segStyle, flex: 1, background: side === 'buy' ? 'var(--buy)' : 'var(--panel-2)', color: side === 'buy' ? 'var(--on-updown)' : 'var(--text-dim)' }}
          >
            买入
          </button>
          <button
            onClick={() => setSide('sell')}
            style={{ ...segStyle, flex: 1, background: side === 'sell' ? 'var(--sell)' : 'var(--panel-2)', color: side === 'sell' ? 'var(--on-updown)' : 'var(--text-dim)' }}
          >
            卖出
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button onClick={() => setType('limit')} style={{ ...segStyle, flex: 1, background: type === 'limit' ? 'var(--accent)' : 'var(--panel-2)', color: type === 'limit' ? 'var(--text-on-accent)' : 'var(--text-dim)' }}>
            限价
          </button>
          <button onClick={() => setType('market')} style={{ ...segStyle, flex: 1, background: type === 'market' ? 'var(--accent)' : 'var(--panel-2)', color: type === 'market' ? 'var(--text-on-accent)' : 'var(--text-dim)' }}>
            市价
          </button>
        </div>

        <label style={fieldStyle}>
          数量
          <input value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} />
        </label>
        {type === 'limit' && (
          <label style={fieldStyle}>
            价格
            <input
              value={limitPrice || price.toFixed(decimals)}
              onChange={(e) => setLimitPrice(e.target.value)}
              style={inputStyle}
            />
          </label>
        )}
        <div style={{ color: 'var(--text-faint)', fontSize: 10, margin: '2px 0 8px' }}>
          点击价 {price.toFixed(decimals)}
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button style={{ ...segStyle, background: 'var(--panel-2)', color: 'var(--text-dim)' }} onClick={close}>
            取消
          </button>
          <button style={{ ...segStyle, background: side === 'buy' ? 'var(--buy)' : 'var(--sell)', color: 'var(--on-updown)' }} onClick={submit}>
            下单
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
};

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  width: 224,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 12,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
  zIndex: 41,
};

const segStyle: React.CSSProperties = {
  height: 24,
  border: 'none',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: 'var(--text-dim)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 24,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
  padding: '0 6px',
};
