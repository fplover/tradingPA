import { useMemo, useState } from 'react';
import { Star, X } from 'lucide-react';
import { indicatorsByCategory } from '@/indicators/registry';
import type { IndicatorDef } from '@/indicators/core/types';
import { useIndicatorStore } from '@/store/indicatorStore';
import { fontSize, space } from '@/ui/tokens';

/** 指标选择面板：TV 形态——搜索 + 收藏置顶 + 分类列表 + 每行星标 */
export function IndicatorPanel() {
  const groups = useMemo(() => indicatorsByCategory(), []);
  const [query, setQuery] = useState('');
  const active = useIndicatorStore((s) => s.active);
  const favorites = useIndicatorStore((s) => s.favorites);
  const add = useIndicatorStore((s) => s.add);
  const toggleFavorite = useIndicatorStore((s) => s.toggleFavorite);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);

  const q = query.toLowerCase();
  const match = (d: IndicatorDef) => d.name.toLowerCase().includes(q) || d.id.includes(q);
  const allDefs = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const favItems = allDefs.filter((d) => favorites.includes(d.id) && match(d));
  const filtered = groups
    .map((g) => ({ ...g, items: g.items.filter((d) => match(d) && !favorites.includes(d.id)) }))
    .filter((g) => g.items.length > 0);

  const row = (def: IndicatorDef) => {
    const isActive = active.some((a) => a.id === def.id);
    const isFav = favorites.includes(def.id);
    return (
      <div
        key={def.id}
        className="tv-menu-item"
        onClick={() => add(def.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          padding: `5px ${space.sm}px`,
          cursor: 'pointer',
          color: isActive ? 'var(--accent)' : 'var(--text)',
          fontSize: fontSize.md,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(def.id);
          }}
          title={isFav ? '取消收藏' : '收藏'}
          aria-label={isFav ? `取消收藏 ${def.name}` : `收藏 ${def.name}`}
          style={{
            display: 'flex',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: isFav ? 'var(--accent)' : 'var(--text-faint)',
          }}
        >
          <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
        </button>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.name}</span>
        <span style={{ color: 'var(--text-faint)', fontSize: fontSize.sm, flexShrink: 0 }}>{def.overlay ? '主图' : '副图'}</span>
      </div>
    );
  };

  return (
    <div
      className="tv-scroll"
      style={{
        color: 'var(--text)',
        position: 'absolute',
        top: 40,
        left: 8,
        width: 280,
        maxHeight: 'calc(100% - 60px)',
        overflowY: 'auto',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '4px 0',
        zIndex: 20,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
      }}
    >
      <div style={{ display: 'flex', gap: space.sm, padding: `${space.sm}px ${space.sm}px ${space.xs}px` }}>
        <input
          placeholder="搜索指标"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索指标"
          style={{
            flex: 1,
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            padding: '4px 8px',
            fontSize: fontSize.md,
          }}
        />
        <button onClick={() => setPanelOpen(false)} style={closeBtnStyle} title="关闭" aria-label="关闭指标面板">
          <X size={13} />
        </button>
      </div>

      {favItems.length > 0 && (
        <div style={{ marginBottom: space.sm }}>
          <div style={groupLabelStyle}>收藏</div>
          {favItems.map(row)}
        </div>
      )}
      {filtered.map((g) => (
        <div key={g.category} style={{ marginBottom: space.sm }}>
          <div style={groupLabelStyle}>{g.category}</div>
          {g.items.map(row)}
        </div>
      ))}
      {filtered.length === 0 && favItems.length === 0 && (
        <div style={{ color: 'var(--text-faint)', fontSize: fontSize.md, padding: `${space.sm}px ${space.md}px` }}>无匹配指标</div>
      )}
      <div style={{ color: 'var(--text-faint)', fontSize: fontSize.sm, padding: `${space.xs}px ${space.md}px ${space.sm}px` }}>
        共 {allDefs.length} 个指标（含自定义）
      </div>
    </div>
  );
}

const groupLabelStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  padding: `4px ${space.md}px`,
};

const closeBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
};
