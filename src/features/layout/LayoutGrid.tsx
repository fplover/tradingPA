import { useLayoutStore, LAYOUTS } from '@/store/layoutStore';
import { ChartCell } from './ChartCell';

/** 布局切换按钮组（工具栏常驻） */
export function LayoutButtons() {
  const layout = useLayoutStore((s) => s.layout);
  const setLayout = useLayoutStore((s) => s.setLayout);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {LAYOUTS.map((l) => (
        <button
          key={l.id}
          onClick={() => setLayout(l.id)}
          style={{
            background: layout === l.id ? 'var(--accent)' : 'var(--panel-2)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {l.label}
        </button>
      ))}
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
