import { useState } from 'react';
import { useAlertStore, type PriceAlert } from '@/store/alertStore';

interface AlertPanelProps {
  symbol: string;
  currentPrice: number;
}

/** 价格警报面板：新建（价格+方向）+ 列表 + 触发状态 */
export function AlertPanel({ symbol, currentPrice }: AlertPanelProps) {
  const alerts = useAlertStore((s) => s.alerts);
  const add = useAlertStore((s) => s.add);
  const remove = useAlertStore((s) => s.remove);
  const clearTriggered = useAlertStore((s) => s.clearTriggered);
  const [price, setPrice] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');

  const submit = () => {
    const p = Number(price);
    if (!p || p <= 0) return;
    add({ symbol, price: p, direction });
    setPrice('');
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: '#d1d4dc', fontSize: 12 }}>价格警报</strong>
        <span style={{ color: '#787b86', fontSize: 10 }}>当前 {currentPrice > 0 ? currentPrice.toFixed(2) : '--'}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <input
          type="number"
          placeholder="价格"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={inputStyle}
        />
        <select value={direction} onChange={(e) => setDirection(e.target.value as 'above' | 'below')} style={{ ...inputStyle, width: 76 }}>
          <option value="above">上穿</option>
          <option value="below">下穿</option>
        </select>
        <button style={btnStyle} onClick={submit}>
          添加
        </button>
      </div>
      {alerts.length === 0 && <div style={{ color: '#787b86', fontSize: 11 }}>暂无警报</div>}
      {alerts.map((a) => (
        <AlertRow key={a.id} alert={a} onRemove={() => remove(a.id)} />
      ))}
      {alerts.some((a) => a.triggered) && (
        <button style={{ ...btnStyle, width: '100%', marginTop: 6 }} onClick={clearTriggered}>
          清除已触发
        </button>
      )}
    </div>
  );
}

function AlertRow({ alert, onRemove }: { alert: PriceAlert; onRemove: () => void }) {
  const color = alert.triggered ? '#ff9800' : alert.direction === 'above' ? '#26a69a' : '#ef5350';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 6px',
        fontSize: 11,
        color: '#d1d4dc',
        borderBottom: '1px solid #2a2e39',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        {alert.symbol} {alert.direction === 'above' ? '≥' : '≤'} {alert.price}
        {alert.triggered && <span style={{ color: '#ff9800' }}> · 已触发</span>}
      </span>
      <button onClick={onRemove} style={miniBtn}>
        ×
      </button>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: 8,
  width: 240,
  background: '#1e222d',
  border: '1px solid #2a2e39',
  borderRadius: 6,
  padding: 10,
  zIndex: 18,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: '#131722',
  border: '1px solid #2a2e39',
  borderRadius: 4,
  color: '#d1d4dc',
  padding: '4px 6px',
  fontSize: 11,
};

const btnStyle: React.CSSProperties = {
  background: '#2a2e39',
  color: '#d1d4dc',
  border: 'none',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
};

const miniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#787b86',
  cursor: 'pointer',
  fontSize: 12,
};
