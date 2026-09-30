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
  Expand,
  Fan,
  Radius,
  Timer,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import type { DrawingTypeId } from '@/engine/drawing/types';

export type ToolbarItem = DrawingTypeId | 'cursor' | 'magnet';

/** 悬停目标：工具组在 GROUPS 中的下标，或底部两个带 caret 的控件 */
export type HoverTarget = number | 'magnet' | 'remove';

export const ICONS: Record<ToolbarItem, LucideIcon> = {
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
  'fib-extension': Expand,
  'fib-fan': Fan,
  'fib-arc': Radius,
  'fib-timezone': Timer,
  'fib-auto': WandSparkles,
  magnet: Magnet,
};

export interface ToolGroup {
  items: ToolbarItem[];
  /** caret 的 tooltip，TV zh 文案 */
  title: string;
}

/** 工具分组：多变体组只显示当前变体，flyout 列出全部变体 */
export const GROUPS: ToolGroup[] = [
  { items: ['cursor'], title: '游标' },
  { items: ['trendline', 'ray', 'info-line', 'hline', 'vline', 'arrow'], title: '趋势线工具' },
  { items: ['channel'], title: '通道工具' },
  { items: ['fib', 'fib-extension', 'fib-fan', 'fib-arc', 'fib-timezone', 'fib-auto'], title: '江恩和斐波那契工具' },
  { items: ['rect', 'ellipse', 'path'], title: '几何形状' },
  { items: ['text'], title: '文本工具' },
];

export const TOOL_LABELS: Record<ToolbarItem, string> = {
  cursor: '光标',
  trendline: '趋势线',
  ray: '射线',
  hline: '水平线',
  vline: '垂直线',
  arrow: '箭头',
  'info-line': '信息线',
  channel: '平行通道',
  fib: '斐波那契回撤',
  'fib-extension': '斐波那契扩展',
  'fib-fan': '斐波那契扇形',
  'fib-arc': '斐波那契弧线',
  'fib-timezone': '斐波那契时区',
  'fib-auto': 'Auto Fib（自动回撤）',
  rect: '矩形',
  ellipse: '椭圆',
  path: '路径',
  text: '文本',
  magnet: '磁吸（吸附 OHLC）',
};

/** TV 的 flyout 行内快捷键提示（仅这七个工具有 selectHotkey） */
export const HOTKEYS: Partial<Record<ToolbarItem, string>> = {
  trendline: 'Alt + T',
  hline: 'Alt + H',
  ray: 'Alt + J',
  vline: 'Alt + V',
  fib: 'Alt + F',
  rect: 'Alt + Shift + R',
};

export const shownOf = (group: ToolGroup, activeTool: string | null): ToolbarItem =>
  group.items.includes('cursor') ? 'cursor' : (group.items.find((t) => t === activeTool) ?? group.items[0]);

export const isGroupActive = (group: ToolGroup, activeTool: string | null): boolean => {
  const shown = shownOf(group, activeTool);
  return shown === 'cursor' ? activeTool === null : activeTool === shown;
};
