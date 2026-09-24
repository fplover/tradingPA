import {
  Crosshair,
  TrendingUp,
  MoveUpRight,
  Minus,
  SeparatorVertical,
  ArrowUpRight,
  Info,
  Rows3,
  RectangleHorizontal,
  Circle,
  PenLine,
  Type,
  Percent,
  Magnet,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { DrawingTypeId } from '@/engine/drawing/types';
import { useDrawingStore } from '@/store/drawingStore';

type ToolbarItem = DrawingTypeId | 'cursor' | 'magnet';

const ICONS: Record<ToolbarItem, LucideIcon> = {
  cursor: Crosshair,
  trendline: TrendingUp,
  ray: MoveUpRight,
  hline: Minus,
  vline: SeparatorVertical,
  arrow: ArrowUpRight,
  'info-line': Info,
  channel: Rows3,
  rect: RectangleHorizontal,
  ellipse: Circle,
  path: PenLine,
  text: Type,
  fib: Percent,
  magnet: Magnet,
};

/** 工具分组（组间加分隔线，对齐 TradingView 左侧工具栏结构） */
const GROUPS: ToolbarItem[][] = [
  ['cursor'],
  ['trendline', 'ray', 'info-line', 'hline', 'vline', 'arrow'],
  ['channel'],
  ['fib'],
  ['rect', 'ellipse', 'path'],
  ['text'],
];

const TOOL_LABELS: Record<ToolbarItem, string> = {
  cursor: '光标',
  trendline: '趋势线',
  ray: '射线',
  hline: '水平线',
  vline: '垂直线',
  arrow: '箭头',
  'info-line': '信息线',
  channel: '平行通道',
  fib: '斐波那契回撤',
  rect: '矩形',
  ellipse: '椭圆',
  path: '路径',
  text: '文本',
  magnet: '磁吸（吸附 OHLC）',
};

/** 左侧画线工具栏：lucide 图标 + tooltip + 分组分隔 */
export function DrawingToolbar() {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const magnet = useDrawingStore((s) => s.magnet);
  const setMagnet = useDrawingStore((s) => s.setMagnet);

  return (
    <div style={toolbarStyle} aria-label="画线工具">
      {GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: 'contents' }}>
          {gi > 0 && <div style={sepStyle} />}
          {group.map((id) => {
            const Icon = ICONS[id];
            const active = id === 'cursor' ? activeTool === null : activeTool === id;
            return (
              <button
                key={id}
                className="rail-btn"
                data-active={active}
                title={TOOL_LABELS[id]}
                aria-label={TOOL_LABELS[id]}
                aria-pressed={active}
                onClick={() => setActiveTool(id === 'cursor' ? null : id)}
                style={btnStyle}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              </button>
            );
          })}
        </div>
      ))}
      <div style={sepStyle} />
      <button
        className="rail-btn"
        data-active={magnet}
        title={TOOL_LABELS.magnet}
        aria-label={TOOL_LABELS.magnet}
        aria-pressed={magnet}
        onClick={() => setMagnet(!magnet)}
        style={btnStyle}
      >
        <Magnet size={16} strokeWidth={magnet ? 2.2 : 1.8} />
      </button>
      <button
        className="rail-btn"
        title="删除选中画线（Delete）"
        aria-label="删除选中画线"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))}
        style={{ ...btnStyle, marginTop: 'auto' }}
      >
        <Trash2 size={16} strokeWidth={1.8} />
      </button>
    </div>
  );
}

/** 独立列而非浮层：TV 的工具栏占据图表左侧一列，不遮挡画布与图例 */
const toolbarStyle: React.CSSProperties = {
  width: 38,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '6px 0',
  background: 'var(--panel)',
  borderRight: '1px solid var(--border)',
  overflowY: 'auto',
};

const btnStyle: React.CSSProperties = {
  border: 'none',
  flexShrink: 0,
};

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '3px 2px',
};
