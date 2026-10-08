import { useEffect, useMemo, useRef, useState } from 'react';
import { Star, X } from 'lucide-react';
import { indicatorsByCategory } from '@/indicators/registry';
import type { IndicatorDef } from '@/indicators/core/types';
import { useIndicatorStore } from '@/store/indicatorStore';
import { TemplateSection } from './TemplateSection';
import { fontSize, icon, radius, shadow, space } from '@/ui/tokens';

/** 指标选择面板：TV 形态——搜索 + 扁平列表（收藏置顶）+ 每行星标 + ↑↓/Enter，
 *  底部内嵌「模板」分区（命名保存 / 应用 / 重命名 / 删除，TV 指标对话框 Templates 形态）。
 *  挂载在 TopBar 指标按钮正下方（需求②）：定位由外层 relative 容器承担，
 *  根元素退为 static、maxHeight 60vh，列表区 flex:1 内部滚动。 */
export function IndicatorPanel() {
  const groups = useMemo(() => indicatorsByCategory(), []);
  const allDefs = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const active = useIndicatorStore((s) => s.active);
  const favorites = useIndicatorStore((s) => s.favorites);
  const add = useIndicatorStore((s) => s.add);
  const toggleFavorite = useIndicatorStore((s) => s.toggleFavorite);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const items = useMemo(() => {
    const matched = allDefs.filter((d) => !q || d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
    return matched.sort((a, b) => {
      const fa = favorites.includes(a.id) ? 0 : 1;
      const fb = favorites.includes(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }, [allDefs, q, favorites]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  const choose = (def: IndicatorDef) => add(def.id);

  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    rowRefs.current[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const row = (def: IndicatorDef, i: number) => {
    const isActive = active.some((a) => a.id === def.id);
    const isFav = favorites.includes(def.id);
    return (
      <div
        key={def.id}
        ref={(el) => {
          rowRefs.current[i] = el;
        }}
        className="tv-menu-item"
        role="option"
        aria-selected={i === sel}
        onClick={() => choose(def)}
        onMouseEnter={() => setSel(i)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          padding: `5px ${space.sm}px`,
          cursor: 'pointer',
          color: isActive ? 'var(--accent)' : 'var(--text)',
          fontSize: fontSize.md,
          background: i === sel ? 'var(--panel-2)' : 'transparent',
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(def.id);
          }}
          title={isFav ? '从收藏中移除' : '添加到收藏'}
          aria-label={isFav ? `从收藏中移除 ${def.name}` : `添加到收藏 ${def.name}`}
          style={{
            display: 'flex',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: isFav ? 'var(--accent)' : 'var(--text-faint)',
            flexShrink: 0,
          }}
        >
          <Star size={icon.md} fill={isFav ? 'currentColor' : 'none'} />
        </button>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Highlight text={def.name} query={q} />
        </span>
        <span style={{ color: 'var(--text-faint)', fontSize: fontSize.sm, flexShrink: 0 }}>
          {def.category} · {def.overlay ? '主图' : '副图'}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        color: 'var(--text)',
        width: 300,
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: radius.md,
        boxShadow: shadow.popover,
      }}
    >
      <div
        style={{ display: 'flex', gap: space.sm, padding: `${space.sm}px ${space.sm}px ${space.xs}px`, flexShrink: 0 }}
      >
        <input
          ref={inputRef}
          placeholder="搜索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => (items.length ? (s + 1) % items.length : 0));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (items[sel]) choose(items[sel]);
            } else if (e.key === 'Escape') {
              setPanelOpen(false);
            }
          }}
          aria-label="搜索指标"
          style={{
            flex: 1,
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: radius.sm,
            color: 'var(--text)',
            padding: '4px 8px',
            fontSize: fontSize.md,
          }}
        />
        <button onClick={() => setPanelOpen(false)} style={closeBtnStyle} title="关闭" aria-label="关闭指标面板">
          <X size={icon.md} />
        </button>
      </div>

      <div
        ref={listRef}
        className="tv-scroll"
        role="listbox"
        aria-label="指标列表"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}
      >
        {items.map(row)}
        {items.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: fontSize.md, padding: `${space.sm}px ${space.md}px` }}>
            没有符合您搜索条件的指标.
          </div>
        )}
      </div>

      <div
        style={{
          color: 'var(--text-faint)',
          fontSize: fontSize.sm,
          padding: `${space.xs}px ${space.md}px ${space.sm}px`,
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        共 {allDefs.length} 个指标（含自定义）
      </div>

      <TemplateSection />
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ color: 'var(--accent)' }}>{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

const closeBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: radius.sm,
  cursor: 'pointer',
  flexShrink: 0,
};
