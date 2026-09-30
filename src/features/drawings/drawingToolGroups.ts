import {
  TvAnchoredText,
  TvArc,
  TvArrow,
  TvArrowMark,
  TvChannel,
  TvCurve,
  TvCursor,
  TvEllipse,
  TvElliottWave,
  TvFib,
  TvFibArc,
  TvFibAuto,
  TvFibExtension,
  TvFibFan,
  TvFibTimezone,
  TvGannBox,
  TvGannFan,
  TvGannLine,
  TvHline,
  TvInfoLine,
  TvMagnet,
  TvMeasure,
  TvNote,
  TvPath,
  TvPercentLine,
  TvPolygon,
  TvPriceLabel,
  TvRay,
  TvRect,
  TvText,
  TvTrendline,
  TvVline,
  type TvIconComponent,
} from './tvIcons';
import type { DrawingTypeId } from '@/engine/drawing/types';

export type ToolbarItem = DrawingTypeId | 'cursor' | 'magnet';

/** 悬停目标：工具组在 GROUPS 中的下标，或底部两个带 caret 的控件 */
export type HoverTarget = number | 'magnet' | 'remove';

/** 画线工具栏图标（TV 风自绘 SVG；lucide-react 仅服务其余界面，不卸载） */
export const ICONS: Record<ToolbarItem, TvIconComponent> = {
  cursor: TvCursor,
  trendline: TvTrendline,
  ray: TvRay,
  hline: TvHline,
  vline: TvVline,
  arrow: TvArrow,
  'info-line': TvInfoLine,
  channel: TvChannel,
  rect: TvRect,
  ellipse: TvEllipse,
  path: TvPath,
  text: TvText,
  fib: TvFib,
  'fib-extension': TvFibExtension,
  'fib-fan': TvFibFan,
  'fib-arc': TvFibArc,
  'fib-timezone': TvFibTimezone,
  'fib-auto': TvFibAuto,
  // P2-B 文字类 4 种
  note: TvNote,
  'price-label': TvPriceLabel,
  'anchored-text': TvAnchoredText,
  'arrow-mark': TvArrowMark,
  // P2-B 测量 + 百分比线（八分法，与 measure 同组）
  measure: TvMeasure,
  'percent-line': TvPercentLine,
  // P2-B 几何 3 种
  polygon: TvPolygon,
  arc: TvArc,
  curve: TvCurve,
  // P2-B 江恩 3 件（扇形与 fib-fan 图标做区分：中心点四角放射）
  'gann-fan': TvGannFan,
  'gann-line': TvGannLine,
  'gann-box': TvGannBox,
  // P2-B 艾略特波浪
  'elliott-wave': TvElliottWave,
  magnet: TvMagnet,
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
  // P2-B：江恩 3 件并入「江恩和斐波那契工具」组（TV 同名合并组）
  { items: ['fib', 'fib-extension', 'fib-fan', 'fib-arc', 'fib-timezone', 'fib-auto', 'gann-fan', 'gann-line', 'gann-box'], title: '江恩和斐波那契工具' },
  { items: ['rect', 'ellipse', 'path', 'polygon', 'arc', 'curve'], title: '几何形状' },
  { items: ['text', 'anchored-text', 'note', 'price-label', 'arrow-mark'], title: '文本工具' },
  { items: ['measure', 'percent-line'], title: '预测和测量工具' },
  { items: ['elliott-wave'], title: '艾略特波浪' },
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
  note: '便签',
  'price-label': '价格标签',
  'anchored-text': '锚定文本',
  'arrow-mark': '箭头标记',
  measure: '测量',
  'percent-line': '百分比线',
  polygon: '多边形',
  arc: '圆弧',
  curve: '曲线',
  'gann-fan': '江恩扇形',
  'gann-line': '江恩线',
  'gann-box': '江恩箱',
  'elliott-wave': '艾略特波浪',
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
