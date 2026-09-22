import { Square, Columns2, Grid2x2, Grid3x3, Table, type LucideIcon } from 'lucide-react';
import { useLayoutStore, LAYOUTS, type LayoutId } from '@/store/layoutStore';
import { ChartCell } from './ChartCell';

const LAYOUT_ICONS: Record<LayoutId, LucideIcon> = {
  1: Square,
  2: Columns2,
  4: Grid2x2,
  6: Grid3x3,
  8: Table,
};

/** 布局切换按钮组（工具栏常驻，图标 + tooltip） */
export function LayoutButtons() {
  const layout = useLayoutStore((s) => s.layout);
  const setLayout = useLayoutStore((s) => s.setLayout);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {LAYOUTS.map((l) => {
        const Icon = LAYOUT_ICONS[l.id];
        const active = layout === l.id;
        return (
          <button
            key={l.id}
            title={`布局：${l.label}`}
            onClick={() => setLayout(l.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 26,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--text-on-accent)' : 'var(--text-dim)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}

/** 多图表网格 */
export function LayoutGrid() {
  const layout = useLayoutStore((s) => s.layout);
  const def = LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${def.cols}, 1fr)`,
        gridTemplateRows: `repeat(${def.rows}, 1fr)`,
      }}
    >
      {Array.from({ length: def.id }, (_, i) => (
        <ChartCell key={i} index={i} />
      ))}
    </div>
  );
}
