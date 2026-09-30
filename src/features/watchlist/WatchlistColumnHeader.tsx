import { ArrowDown, ArrowUp } from 'lucide-react';
import { COLUMNS, type ColumnId, type SortDir, type SortKey } from '@/store/watchlistStore';
import { COLUMN_WIDTH } from './watchlistShared';
import { fontSize, space } from '@/ui/tokens';

interface ColumnHeaderProps {
  columns: ColumnId[];
  sort: { key: SortKey; dir: SortDir };
  onCycleSort: (key: SortKey) => void;
}

/** 列头：横向随内容滚动，纵向吸顶 */
export function ColumnHeader({ columns, sort, onCycleSort }: ColumnHeaderProps) {
  return (
    <div style={{ ...columnHeaderStyle, position: 'sticky', top: 0, zIndex: 1, background: 'var(--panel)' }}>
      <SortLabel label="代码" sortKey="symbol" sort={sort} onSort={() => onCycleSort('symbol')} flex />
      {columns.map((c) => (
        <SortLabel
          key={c}
          label={COLUMNS.find((x) => x.id === c)?.label ?? c}
          sortKey={c}
          sort={sort}
          onSort={() => onCycleSort(c)}
          width={COLUMN_WIDTH[c]}
        />
      ))}
      <span style={{ width: 18, flexShrink: 0 }} />
    </div>
  );
}

function SortLabel({
  label,
  sortKey,
  sort,
  onSort,
  width,
  flex,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: () => void;
  width?: number;
  flex?: boolean;
}) {
  const active = sort.key === sortKey && sort.dir !== 'manual';
  return (
    <button
      onClick={onSort}
      title={`按${label}排序（升序 → 降序 → 手动排列）`}
      style={{
        ...(flex ? { flex: 1, minWidth: 0 } : { width, flexShrink: 0 }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: flex ? 'flex-start' : 'flex-end',
        gap: 3,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontSize: fontSize.sm,
        color: active ? 'var(--text)' : 'var(--text-faint)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );
}

const columnHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 24,
  padding: `0 ${space.xs}px 0 ${space.md}px`,
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};
