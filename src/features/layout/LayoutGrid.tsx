import { useRef } from 'react';
import { Square, Columns2, Grid2x2, Grid3x3, Table, type LucideIcon } from 'lucide-react';
import { useLayoutStore, LAYOUTS, type LayoutId, type SyncChannel } from '@/store/layoutStore';
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

/** 联动开关条（P2-C）：syncBus 品种/周期/画线三 channel 的发布侧开关，随布局快照持久 */
const SYNC_CHANNELS: Array<{ channel: SyncChannel; label: string; title: string }> = [
  { channel: 'symbol', label: '品种', title: '品种同步：任一单元格切换品种时联动其余单元格' },
  { channel: 'interval', label: '周期', title: '周期同步：任一单元格切换周期时联动其余单元格' },
  { channel: 'drawings', label: '画线', title: '画线同步：任一单元格增删改画线时整量同步到其余单元格' },
];

function SyncToggleStrip() {
  const values: Record<SyncChannel, boolean> = {
    symbol: useLayoutStore((s) => s.syncSymbol),
    interval: useLayoutStore((s) => s.syncInterval),
    drawings: useLayoutStore((s) => s.syncDrawings),
  };
  const setSyncChannel = useLayoutStore((s) => s.setSyncChannel);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 26,
        padding: '0 6px',
        flexShrink: 0,
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>联动</span>
      {SYNC_CHANNELS.map((c) => (
        <button
          key={c.channel}
          onClick={() => {
            setSyncChannel(c.channel, !values[c.channel]);
            useLayoutStore.getState().commitMeta();
          }}
          title={c.title}
          aria-label={c.title}
          aria-pressed={values[c.channel]}
          style={{
            height: 18,
            padding: '0 7px',
            fontSize: 11,
            background: values[c.channel] ? 'var(--accent)' : 'transparent',
            color: values[c.channel] ? 'var(--text-on-accent)' : 'var(--text-faint)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** 多图表网格：最大化时只渲染聚焦单元格；行列比例动态化（分隔条拖拽，进快照刷新后持久） */
export function LayoutGrid() {
  const layout = useLayoutStore((s) => s.layout);
  const maximizedCell = useLayoutStore((s) => s.maximizedCell);
  const colRatios = useLayoutStore((s) => s.colRatios);
  const rowRatios = useLayoutStore((s) => s.rowRatios);
  const def = LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0];
  const gridRef = useRef<HTMLDivElement>(null);
  const maximized = maximizedCell !== null && maximizedCell < def.id;
  const colR = maximized ? [1] : colRatios;
  const rowR = maximized ? [1] : rowRatios;

  /** 起拖：记录起点与相邻两轨原值；pointermove 按容器尺寸把像素位移换算为比例增量；
   *  pointerup 落盘（commitMeta 写回激活布局快照，刷新后经恢复路径持久）。 */
  const startDrag = (axis: 'col' | 'row', index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const size = axis === 'col' ? rect.width : rect.height;
    if (size <= 0) return;
    const ratios = axis === 'col' ? colR : rowR;
    const total = ratios.reduce((a, b) => a + b, 0);
    const r0 = ratios[index];
    const r1 = ratios[index + 1];
    const startPos = axis === 'col' ? e.clientX : e.clientY;
    const onMove = (ev: PointerEvent) => {
      const delta = (((axis === 'col' ? ev.clientX : ev.clientY) - startPos) / size) * total;
      useLayoutStore.getState().resizeTrack(axis, index, r0 + delta, r1 - delta);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      useLayoutStore.getState().commitMeta();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <SyncToggleStrip />
      <div
        ref={gridRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: colR.map((r) => `${r}fr`).join(' '),
          gridTemplateRows: rowR.map((r) => `${r}fr`).join(' '),
          position: 'relative',
        }}
      >
        {maximized ? (
          <ChartCell index={maximizedCell as number} />
        ) : (
          Array.from({ length: def.id }, (_, i) => <ChartCell key={i} index={i} />)
        )}
        {/* 边缘分隔条：列间 + 行间各 n-1 条（最大化时隐藏） */}
        {!maximized &&
          colR.slice(0, -1).map((_, i) => (
            <Grip key={`col-${i}`} axis="col" index={i} ratios={colR} onPointerDown={startDrag('col', i)} />
          ))}
        {!maximized &&
          rowR.slice(0, -1).map((_, i) => (
            <Grip key={`row-${i}`} axis="row" index={i} ratios={rowR} onPointerDown={startDrag('row', i)} />
          ))}
      </div>
    </div>
  );
}

/** 分隔条：按比例定位到轨道边界，6px 命中区 + 1px 视觉线 */
function Grip({
  axis,
  index,
  ratios,
  onPointerDown,
}: {
  axis: 'col' | 'row';
  index: number;
  ratios: number[];
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const total = ratios.reduce((a, b) => a + b, 0);
  const before = ratios.slice(0, index + 1).reduce((a, b) => a + b, 0);
  const pct = (before / total) * 100;
  const vertical = axis === 'col';
  return (
    <div
      role="separator"
      aria-label={`拖拽调整第 ${index + 1} 与第 ${index + 2} ${vertical ? '列' : '行'}比例`}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        ...(vertical
          ? { left: `calc(${pct}% - 3px)`, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }
          : { top: `calc(${pct}% - 3px)`, left: 0, right: 0, height: 6, cursor: 'row-resize' }),
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
      }}
    >
      <span
        style={{
          background: 'var(--border)',
          ...(vertical ? { width: 1, height: '100%' } : { height: 1, width: '100%' }),
        }}
      />
    </div>
  );
}
