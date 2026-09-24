import { Square, Columns2, Grid2x2, Grid3x3, Table, type LucideIcon } from 'lucide-react';
import { useLayoutStore, LAYOUTS, type LayoutId } from '@/store/layoutStore';
import { ToolbarSelect } from '@/ui/ToolbarSelect';
import { ChartCell } from './ChartCell';

const LAYOUT_ICONS: Record<LayoutId, LucideIcon> = {
  1: Square,
  2: Columns2,
  4: Grid2x2,
  6: Grid3x3,
  8: Table,
};

/** 布局切换：单个下拉（TradingView 顶栏右侧的布局菜单） */
export function LayoutMenu() {
  const layout = useLayoutStore((s) => s.layout);
  const setLayout = useLayoutStore((s) => s.setLayout);
  const current = LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0];
  const Icon = LAYOUT_ICONS[current.id];
  return (
    <ToolbarSelect
      ariaLabel="切换布局"
      value={String(current.id)}
      label={current.label}
      icon={<Icon size={14} />}
      align="end"
      minWidth={96}
      onChange={(v) => setLayout(Number(v) as LayoutId)}
      options={LAYOUTS.map((l) => ({ value: String(l.id), label: l.label }))}
    />
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
