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
      <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>自选股</div>
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
              color: s === active ? 'var(--accent)' : 'var(--text)',
              background: s === active ? 'var(--panel-2)' : 'transparent',
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
        {filtered.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: 4 }}>无匹配</div>}
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
  color: 'var(--text)',
  position: 'absolute',
  left: 48,
  top: 8,
  width: 200,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 10,
  zIndex: 18,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const miniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  fontSize: 12,
};
