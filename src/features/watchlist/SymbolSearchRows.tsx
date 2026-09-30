import { MARKETS } from '@/types/instrument';
import type { SearchHit } from '@/data/sources/types';
import { fontSize, space } from '@/ui/tokens';
import { badgeStyle } from './symbolSearchStyles';

interface ResultRowProps {
  hit: SearchHit;
  query: string;
  selected: boolean;
  addMode: boolean;
  onHover: () => void;
  onChoose: () => void;
  /** React 18 函数组件不能直接收 ref，用具名 prop 传回调 */
  rowRef: (el: HTMLDivElement | null) => void;
}

export function ResultRow({ hit, query, selected, addMode, onHover, onChoose, rowRef }: ResultRowProps) {
  const inst = hit.instrument;
  const market = MARKETS[inst.market];
  return (
    <div
      ref={rowRef}
      role="option"
      aria-selected={selected}
      onClick={onChoose}
      onMouseEnter={onHover}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        minHeight: 46,
        padding: `6px ${space.md}px`,
        cursor: 'pointer',
        background: selected ? 'var(--panel-2)' : 'transparent',
      }}
    >
      {selected && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--accent)' }} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Highlight text={inst.symbol} query={query} />
        </div>
        <div style={{ fontSize: fontSize.sm, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Highlight text={inst.name} query={query} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexShrink: 0 }}>
        {market.label !== inst.exchange && <span style={{ fontSize: fontSize.sm, color: 'var(--text-faint)' }}>{inst.exchange}</span>}
        <span style={badgeStyle}>{market.label}</span>
      </div>

      <span style={{ width: 20, textAlign: 'center', color: 'var(--accent)', fontSize: 16, flexShrink: 0 }}>{addMode ? '+' : ''}</span>
    </div>
  );
}

/** 命中片段高亮：让扫读时能立刻定位匹配的是代码还是名称 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const at = lower.indexOf(query.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ color: 'var(--accent)' }}>{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-block',
        minWidth: 17,
        padding: '0 4px',
        marginRight: 3,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        borderRadius: 3,
        fontSize: fontSize.xs,
        lineHeight: '16px',
        textAlign: 'center',
        color: 'var(--text-dim)',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </kbd>
  );
}
