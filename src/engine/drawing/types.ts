import { FIB_EXTENSION_LEVELS, FIB_RETRACEMENT_LEVELS } from './fibMath';
import { PERCENT_LEVELS } from './percentMath';
import { FIB_CHANNEL_LEVELS } from './fibTailMath';
import { PALETTE } from '@/engine/palette';

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
  | 'fib-auto'
  // P2-B 文字类 4 种：便签（多行+背景框）/ 价格标签（锚价注记）/ 锚定文本（time+price）/ 箭头标记
  | 'note'
  | 'price-label'
  | 'anchored-text'
  | 'arrow-mark'
  // P2-B 测量（两点浮层：bar 数/价差/百分比，Esc 取消）
  | 'measure'
  // 百分比线（经典三档分割：0% / 50% / 100%，档位可自定义）：两点落点，与 fib 回撤同构
  | 'percent-line'
  // P2-B 几何 3 种：多边形（N 顶点）/ 圆弧（三点）/ 曲线（贝塞尔锚点+控制柄）
  | 'polygon'
  | 'arc'
  | 'curve'
  // P2-B 江恩 3 件：扇形（1x1/1x2/2x1 角度族）/ 江恩线（1x1）/ 江恩箱
  | 'gann-fan'
  | 'gann-line'
  | 'gann-box'
  // P2-B 艾略特波浪：5-3 标注组（5 上 3 下锚点）
  | 'elliott-wave'
  // 二期-C1 形态家族：ABCD / XABCD 谐波 4 种（比率校验，patternMath）/ 头肩顶底 / 三角收敛扩散
  | 'abc-pattern'
  | 'gartley'
  | 'bat'
  | 'butterfly'
  | 'crab'
  | 'head-shoulders'
  | 'head-shoulders-inverse'
  | 'triangle-pattern'
  | 'triangle-expanding'
  // 二期-C1 斐波那契补尾：通道（档位平行通道组）/ 螺旋（对数螺旋，TV 简化口径登记）
  | 'fib-channel'
  | 'fib-spiral';

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
  /** 自定义分割档位（百分比小数，仅 fib / fib-extension / percent-line 支持）：
   *  undefined = 用工具默认档（见 defaultLevelsFor）；数组即可见档位集合，
   *  删除档 = 从数组移除、新增 = push，保存前去重（同值跳过）且保持用户顺序。 */
  levels?: number[];
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
  { id: 'trendline', label: '趋势线', points: 2, defaultStyle: { color: PALETTE.blue, lineWidth: 2 } },
  { id: 'ray', label: '射线', points: 2, defaultStyle: { color: PALETTE.blue, lineWidth: 2 } },
  { id: 'hline', label: '水平线', points: 1, defaultStyle: { color: PALETTE.red, lineWidth: 1 } },
  { id: 'vline', label: '垂直线', points: 1, defaultStyle: { color: PALETTE.red, lineWidth: 1 } },
  { id: 'arrow', label: '箭头', points: 2, defaultStyle: { color: PALETTE.green, lineWidth: 2 } },
  { id: 'info-line', label: '信息线', points: 2, defaultStyle: { color: PALETTE.orange, lineWidth: 1 } },
  {
    id: 'channel',
    label: '平行通道',
    points: 3,
    defaultStyle: { color: PALETTE.blue, lineWidth: 1, fillColor: PALETTE.blue22 },
  },
  {
    id: 'rect',
    label: '矩形',
    points: 2,
    defaultStyle: { color: PALETTE.blue, lineWidth: 1, fillColor: PALETTE.blue22 },
  },
  {
    id: 'ellipse',
    label: '椭圆',
    points: 2,
    defaultStyle: { color: PALETTE.blue, lineWidth: 1, fillColor: PALETTE.blue22 },
  },
  { id: 'path', label: '路径', points: 0, defaultStyle: { color: PALETTE.blue, lineWidth: 2 } },
  {
    id: 'text',
    label: '文本',
    points: 1,
    defaultStyle: { color: PALETTE.lightGray, lineWidth: 1, text: '文本', fontSize: 12 },
  },
  { id: 'fib', label: '斐波那契回撤', points: 2, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  // 斐波那契家族（B6）：样式与既有 fib 同源（TV 默认灰 #787B86）
  { id: 'fib-extension', label: '斐波那契扩展', points: 3, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'fib-fan', label: '斐波那契扇形', points: 2, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'fib-arc', label: '斐波那契弧线', points: 2, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'fib-timezone', label: '斐波那契时区', points: 1, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  // Auto Fib：放置时无锚点点击，由 ChartRenderer 按可见区间 swing 一次生成 2 点对象
  { id: 'fib-auto', label: 'Auto Fib（自动回撤）', points: 0, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  // P2-B 文字类 4 种（TV 文本工具组）：便签底色为语义黄，文本色深灰
  {
    id: 'note',
    label: '便签',
    points: 1,
    defaultStyle: { color: PALETTE.darkNavy, lineWidth: 1, fillColor: PALETTE.paleYellow, text: '便签', fontSize: 12 },
  },
  {
    id: 'price-label',
    label: '价格标签',
    points: 1,
    defaultStyle: { color: PALETTE.gray, lineWidth: 1, text: '', fontSize: 11 },
  },
  {
    id: 'anchored-text',
    label: '锚定文本',
    points: 1,
    defaultStyle: { color: PALETTE.lightGray, lineWidth: 1, text: '锚定文本', fontSize: 12 },
  },
  {
    id: 'arrow-mark',
    label: '箭头标记',
    points: 1,
    defaultStyle: { color: PALETTE.gray, lineWidth: 2, text: '标记', fontSize: 12 },
  },
  // P2-B 测量（TV Measure）：Shift+点击两点锁轴，浮层 bar 数/价差/百分比
  { id: 'measure', label: '测量', points: 2, defaultStyle: { color: PALETTE.gray, lineWidth: 1, dash: true } },
  // 百分比线（默认 0% / 50% / 100% 三条分割线，档位可自定义）：两点按价格区间画水平线组，默认色同 fib 家族灰
  { id: 'percent-line', label: '百分比线', points: 2, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  // P2-B 几何 3 种：多边形 points:0 = 任意顶点数，双击/回车结束（path 同范式）
  {
    id: 'polygon',
    label: '多边形',
    points: 0,
    defaultStyle: { color: PALETTE.blue, lineWidth: 1, fillColor: PALETTE.blue22 },
  },
  { id: 'arc', label: '圆弧', points: 3, defaultStyle: { color: PALETTE.blue, lineWidth: 2 } },
  { id: 'curve', label: '曲线', points: 4, defaultStyle: { color: PALETTE.blue, lineWidth: 2 } },
  // P2-B 江恩 3 件：扇形/江恩线同 TV 默认灰，箱体带淡填充
  { id: 'gann-fan', label: '江恩扇形', points: 1, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'gann-line', label: '江恩线', points: 1, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  {
    id: 'gann-box',
    label: '江恩箱',
    points: 2,
    defaultStyle: { color: PALETTE.gray, lineWidth: 1, fillColor: PALETTE.gray22 },
  },
  // P2-B 艾略特波浪：5-3 标注组 = 8 锚点（5 上 + 3 下）
  { id: 'elliott-wave', label: '艾略特波浪', points: 8, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  // 二期-C1 形态家族：锚点顺序见 patternMath 头注；谐波默认色同 TV 图式组灰
  { id: 'abc-pattern', label: 'ABCD 形态', points: 4, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'gartley', label: '加特莱', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'bat', label: '蝙蝠', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'butterfly', label: '蝴蝶', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'crab', label: '螃蟹', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'head-shoulders', label: '头肩顶', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'head-shoulders-inverse', label: '头肩底', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'triangle-pattern', label: '三角收敛', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'triangle-expanding', label: '三角扩散', points: 5, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  // 二期-C1 斐波那契补尾：通道档位可自定义（level=1 基准档恰过第三锚点）；螺旋两点
  { id: 'fib-channel', label: '斐波那契通道', points: 3, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
  { id: 'fib-spiral', label: '斐波那契螺旋', points: 2, defaultStyle: { color: PALETTE.gray, lineWidth: 1 } },
];

export function getToolDef(id: DrawingTypeId): DrawingToolDef {
  return DRAWING_TOOLS.find((t) => t.id === id) ?? DRAWING_TOOLS[0];
}

/** 工具默认分割档位（百分比小数；仅 fib / fib-extension / percent-line / fib-channel 支持自定义，其余返回 null）。
 *  与渲染层回退常量同源（fibMath / percentMath / fibTailMath）：d.levels 为 undefined 时渲染即用此处默认值。
 *  注：fib-auto 与 fib 共用回撤渲染，但按需求仅下列四个工具在设置对话框暴露「分割线」分区。 */
export function defaultLevelsFor(id: DrawingTypeId): number[] | null {
  switch (id) {
    case 'fib':
      return [...FIB_RETRACEMENT_LEVELS];
    case 'fib-extension':
      return [...FIB_EXTENSION_LEVELS];
    case 'percent-line':
      return [...PERCENT_LEVELS];
    case 'fib-channel':
      return [...FIB_CHANNEL_LEVELS];
    default:
      return null;
  }
}

/** Shift 拖动约束工具（TV：限制水平/垂直）：线类工具 + 斐波那契家族 + 测量 + 百分比线。
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
  'measure',
  'percent-line',
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
      (d): d is Drawing => typeof d?.id === 'string' && typeof d?.type === 'string' && Array.isArray(d?.points),
    );
  } catch {
    return [];
  }
}
