import { useState } from 'react';
import { useWatchlistStore } from '@/store/watchlistStore';

/** 自选股面板：列表 + 搜索 + 添加/删除 */
export function Watchlist() {
  const symbols = useWatchlistStore((s) => s.symbols);
  const active = useWatchlistStore((s) => s.active);
  const setActive = useWatchlistStore((s) => s.setActive);
  const add = useWatchlistStore((s) => s.add);
  const remove = useWatchlistStore((s) => s.remove);
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');

  const filtered = symbols.filter((s) => s.includes(query.toUpperCase()));

  return (
    <div style={panelStyle}>
      <div style={{ color: '#d1d4dc', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>自选股</div>
      <input
        placeholder="搜索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={inputStyle}
      />
      <div style={{ maxHeight: 260, overflowY: 'auto', margin: '6px 0' }}>
        {filtered.map((s) => (
          <div
            key={s}
            onClick={() => setActive(s)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '5px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              color: s === active ? '#2962ff' : '#d1d4dc',
              background: s === active ? '#2a2e39' : 'transparent',
            }}
          >
            <span>{s}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove(s);
              }}
              style={miniBtn}
              title="移除"
            >
              ×
            </button>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: '#787b86', fontSize: 11, padding: 4 }}>无匹配</div>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          placeholder="添加符号如 LINKUSDT"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          style={btnStyle}
          onClick={() => {
            if (input.trim()) {
              add(input.trim());
              setActive(input.trim().toUpperCase());
              setInput('');
            }
          }}
        >
          添加
        </button>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  left: 48,
  top: 8,
  width: 200,
  background: '#1e222d',
  border: '1px solid #2a2e39',
  borderRadius: 6,
  padding: 10,
  zIndex: 18,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#131722',
  border: '1px solid #2a2e39',
  borderRadius: 4,
  color: '#d1d4dc',
  padding: '4px 8px',
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  background: '#2a2e39',
  color: '#d1d4dc',
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const miniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#787b86',
  cursor: 'pointer',
  fontSize: 12,
};
