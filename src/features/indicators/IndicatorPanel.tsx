import { useMemo, useState } from 'react';
import { indicatorsByCategory } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';

/** 指标选择面板：分类 + 搜索 + 添加 */
export function IndicatorPanel() {
  const groups = useMemo(() => indicatorsByCategory(), []);
  const [query, setQuery] = useState('');
  const active = useIndicatorStore((s) => s.active);
  const add = useIndicatorStore((s) => s.add);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);

  const filtered = groups
    .map((g) => ({ ...g, items: g.items.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) || d.id.includes(query.toLowerCase())) }))
    .filter((g) => g.items.length > 0);

  return (
    <div
      style={{
        color: 'var(--text)',
        position: 'absolute',
        top: 40,
        left: 8,
        width: 260,
        maxHeight: 'calc(100% - 60px)',
        overflowY: 'auto',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 10,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          placeholder="搜索指标"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            padding: '4px 8px',
            fontSize: 12,
          }}
        />
        <button onClick={() => setPanelOpen(false)} style={btnStyle}>
          关闭
        </button>
      </div>
      {filtered.map((g) => (
        <div key={g.category} style={{ marginBottom: 10 }}>
          <div style={{ color: 'var(--text-faint)', fontSize: 11, margin: '4px 0' }}>{g.category}</div>
          {g.items.map((def) => {
            const isActive = active.some((a) => a.id === def.id);
            return (
              <div
                key={def.id}
                onClick={() => add(def.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  fontSize: 12,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{def.name}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>{def.overlay ? '主图' : '副图'}</span>
              </div>
            );
          })}
        </div>
      ))}
      {filtered.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>无匹配指标</div>}
      <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 8 }}>
        共 {groups.reduce((s, g) => s + g.items.length, 0)} 个内置指标
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
