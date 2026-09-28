/** 画线锚点：世界坐标（时间 + 价格），与缩放平移无关 */
export interface DrawingPoint {
  time: number;
  price: number;
}

export type DrawingTypeId =
  | 'trendline'
  | 'ray'
  | 'hline'
  | 'vline'
  | 'arrow'
  | 'info-line'
  | 'channel'
  | 'rect'
  | 'ellipse'
  | 'path'
  | 'text'
  | 'fib'
  | 'fib-extension'
  | 'fib-fan'
  | 'fib-arc'
  | 'fib-timezone'
  | 'fib-auto';

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  /** 虚线线型（TV 样式页 Line style） */
  dash?: boolean;
  /** 填充类工具的背景色（含透明度） */
  fillColor?: string;
  /** 文本内容 */
  text?: string;
  fontSize?: number;
}

export interface Drawing {
  id: string;
  type: DrawingTypeId;
  points: DrawingPoint[];
  style: DrawingStyle;
  locked: boolean;
  visible: boolean;
}

export interface DrawingToolDef {
  id: DrawingTypeId;
  label: string;
  /** 需要的锚点数（path 为 0 = 任意，双击/回车结束） */
  points: number;
  /** 默认样式 */
  defaultStyle: DrawingStyle;
}

export const DRAWING_TOOLS: DrawingToolDef[] = [
  { id: 'trendline', label: '趋势线', points: 2, defaultStyle: { color: '#2962ff', lineWidth: 2 } },
  { id: 'ray', label: '射线', points: 2, defaultStyle: { color: '#2962ff', lineWidth: 2 } },
  { id: 'hline', label: '水平线', points: 1, defaultStyle: { color: '#ef5350', lineWidth: 1 } },
  { id: 'vline', label: '垂直线', points: 1, defaultStyle: { color: '#ef5350', lineWidth: 1 } },
  { id: 'arrow', label: '箭头', points: 2, defaultStyle: { color: '#26a69a', lineWidth: 2 } },
  { id: 'info-line', label: '信息线', points: 2, defaultStyle: { color: '#ff9800', lineWidth: 1 } },
  { id: 'channel', label: '平行通道', points: 3, defaultStyle: { color: '#2962ff', lineWidth: 1, fillColor: '#2962ff22' } },
  { id: 'rect', label: '矩形', points: 2, defaultStyle: { color: '#2962ff', lineWidth: 1, fillColor: '#2962ff22' } },
  { id: 'ellipse', label: '椭圆', points: 2, defaultStyle: { color: '#2962ff', lineWidth: 1, fillColor: '#2962ff22' } },
  { id: 'path', label: '路径', points: 0, defaultStyle: { color: '#2962ff', lineWidth: 2 } },
  { id: 'text', label: '文本', points: 1, defaultStyle: { color: '#d1d4dc', lineWidth: 1, text: '文本', fontSize: 12 } },
  { id: 'fib', label: '斐波那契回撤', points: 2, defaultStyle: { color: '#787b86', lineWidth: 1 } },
  // 斐波那契家族（B6）：样式与既有 fib 同源（TV 默认灰 #787B86）
  { id: 'fib-extension', label: '斐波那契扩展', points: 3, defaultStyle: { color: '#787b86', lineWidth: 1 } },
  { id: 'fib-fan', label: '斐波那契扇形', points: 2, defaultStyle: { color: '#787b86', lineWidth: 1 } },
  { id: 'fib-arc', label: '斐波那契弧线', points: 2, defaultStyle: { color: '#787b86', lineWidth: 1 } },
  { id: 'fib-timezone', label: '斐波那契时区', points: 1, defaultStyle: { color: '#787b86', lineWidth: 1 } },
  // Auto Fib：放置时无锚点点击，由 ChartRenderer 按可见区间 swing 一次生成 2 点对象
  { id: 'fib-auto', label: 'Auto Fib（自动回撤）', points: 0, defaultStyle: { color: '#787b86', lineWidth: 1 } },
];

export function getToolDef(id: DrawingTypeId): DrawingToolDef {
  return DRAWING_TOOLS.find((t) => t.id === id) ?? DRAWING_TOOLS[0];
}

/** Shift 拖动约束工具（TV：限制水平/垂直）：线类工具 + 斐波那契家族。
 *  hline/vline 天然单轴无需约束；rect/ellipse/path/text/channel 不约束（TV 同） */
const CONSTRAINABLE_TOOLS: ReadonlySet<DrawingTypeId> = new Set<DrawingTypeId>([
  'trendline',
  'ray',
  'arrow',
  'info-line',
  'fib',
  'fib-extension',
  'fib-fan',
  'fib-arc',
]);

export function isConstrainableTool(id: DrawingTypeId): boolean {
  return CONSTRAINABLE_TOOLS.has(id);
}

/** 序列化（对象树/导入导出用） */
export function serializeDrawings(drawings: readonly Drawing[]): string {
  return JSON.stringify(drawings);
}

export function deserializeDrawings(raw: string): Drawing[] {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (d): d is Drawing =>
        typeof d?.id === 'string' && typeof d?.type === 'string' && Array.isArray(d?.points),
    );
  } catch {
    return [];
  }
}
