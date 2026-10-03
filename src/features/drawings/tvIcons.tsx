// React 19 移除了全局 JSX 命名空间，返回类型须显式从 react 引入该命名空间
import type { CSSProperties, JSX, ReactNode } from 'react';

/** TV 风格画线工具栏自绘图标集（替代 lucide 通用图标）：统一 viewBox 24×24、
 *  stroke=currentColor、stroke-width 1.5、fill=none、round linecap/linejoin
 *  ——细线、几何精确、无填充的 TV 图标语言。描边色继承 CSS color，
 *  激活/悬停变色由调用方 style 控制（与既有 LucideIcon 调用处兼容）。
 *  按族分三个文件：tvIcons.tsx（基础 + 控件族）、tvIconsDraw.tsx（线条/几何/测量/百分比）、
 *  tvIconsFib.tsx（文本/Fib/江恩/艾略特）；本文件汇总 re-export，调用方只引此处。 */

export interface TvIconProps {
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

/** 自绘图标组件类型（画线工具栏本地类型，替代 LucideIcon） */
export type TvIconComponent = (props: TvIconProps) => JSX.Element;

/** 统一 svg 外壳：各图标只提供内部几何路径 */
export function TvIcon({
  size = 24,
  strokeWidth = 1.5,
  style,
  className,
  children,
}: TvIconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** 光标（游标工具）：标准指针箭头轮廓 */
export function TvCursor({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M5 3.5v14l4.5-3.2 2.9 5.3 2.6-1.4-2.9-5.3h6.9L5 3.5z" />
    </TvIcon>
  );
}

/** 磁吸（吸附 OHLC）：U 形磁铁 + 两极横脚 */
export function TvMagnet({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M6.5 5v7.5a5.5 5.5 0 0 0 11 0V5" />
      <path d="M4 5h5M15 5h5" />
    </TvIcon>
  );
}

/** 保持绘图模式：指针箭头 + 底部基线（画完不退出工具的意象） */
export function TvStayMode({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M6 4v11.5l3.4-2.6 2.3 4.2 2.3-1.2-2.3-4.2H16L6 4z" />
      <path d="M4 20.5h16" />
    </TvIcon>
  );
}

/** 锁定：挂锁Body + 闭合锁梁 + 钥匙孔 */
export function TvLock({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <rect x="6" y="10.5" width="12" height="9.5" rx="1.5" />
      <path d="M9 10.5V8a3 3 0 0 1 6 0v2.5" />
      <circle cx="12" cy="15.2" r="1.2" />
    </TvIcon>
  );
}

/** 解锁：挂锁Body + 右端翘起的开锁梁 */
export function TvUnlock({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <rect x="6" y="10.5" width="12" height="9.5" rx="1.5" />
      <path d="M9 10.5V8a3 3 0 0 1 5.6-1.5" />
      <circle cx="12" cy="15.2" r="1.2" />
    </TvIcon>
  );
}

/** 显示所有绘图：眼睛轮廓 + 瞳孔 */
export function TvEye({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </TvIcon>
  );
}

/** 隐藏所有绘图：眼睛轮廓 + 反斜杠 */
export function TvEyeOff({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <path d="M4 4l16 16" />
    </TvIcon>
  );
}

/** 清空全部：垃圾桶（盖 + 提手 + 桶身 + 两条内棱） */
export function TvTrash({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10 10.5v6M14 10.5v6" />
    </TvIcon>
  );
}

/** caret（flyout/底部菜单开关）：右向 V 形箭头，展开时由调用方旋转 180° */
export function TvCaret({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M9.5 5.5 15.5 12l-6 6.5" />
    </TvIcon>
  );
}

// 线条/几何/测量/百分比 与 文本/Fib/江恩/艾略特 两族图标（供 ICONS 统一从本模块引入）
export * from './tvIconsDraw';
export * from './tvIconsFib';
