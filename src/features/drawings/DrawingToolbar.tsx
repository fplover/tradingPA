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
    <div style={toolbarStyle}>
      {GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: 'contents' }}>
          {gi > 0 && <div style={sepStyle} />}
          {group.map((id) => {
            const Icon = ICONS[id];
            const active = id === 'cursor' ? activeTool === null : activeTool === id;
            return (
              <button
                key={id}
                title={TOOL_LABELS[id]}
                onClick={() => setActiveTool(id === 'cursor' ? null : id)}
                style={{
                  ...btnStyle,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--text-on-accent)' : 'var(--text-dim)',
                }}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              </button>
            );
          })}
        </div>
      ))}
      <div style={sepStyle} />
      <button
        title={TOOL_LABELS.magnet}
        onClick={() => setMagnet(!magnet)}
        style={{
          ...btnStyle,
          background: magnet ? 'var(--accent)' : 'transparent',
          color: magnet ? 'var(--text-on-accent)' : 'var(--text-dim)',
        }}
      >
        <Magnet size={16} strokeWidth={magnet ? 2.2 : 1.8} />
      </button>
      <button
        title="删除选中画线（Delete）"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))}
        style={{ ...btnStyle, color: 'var(--text-dim)' }}
      >
        <Trash2 size={16} strokeWidth={1.8} />
      </button>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  position: 'absolute',
  left: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 5,
  zIndex: 15,
};

const btnStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
};

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '3px 2px',
};
