import { TvIcon, type TvIconProps } from './tvIcons';

/** 线条族 8 种 + 测量/百分比线 + 几何族 6 种（TV 风自绘图标）。
 *  视觉区分度：趋势线 = 两端方锚点；射线 = 起点方锚 + 末端箭头；箭头 = 无锚纯箭头；
 *  信息线 = 线 + 末端价签；通道 = 双平行线 + 端部连接；路径 = 自由曲线；
 *  水平/垂直 = 单轴直线；fib 回撤 = 4 线组 + 左锚刻度；百分比线 = 3 条长短不一横线 + % 号。 */

/** 趋势线：两端方锚点 + 对角线 */
export function TvTrendline({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M6.5 17.5 17.5 6.5" />
      <rect x="5" y="16" width="3" height="3" />
      <rect x="16" y="5" width="3" height="3" />
    </TvIcon>
  );
}

/** 射线：起点方锚 + 斜线 + 末端箭头 */
export function TvRay({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M8 15.5 16 7.5" />
      <path d="M16 7.5 14.5 12M16 7.5 11.5 9" />
      <rect x="4" y="15.5" width="3" height="3" />
    </TvIcon>
  );
}

/** 箭头：斜线 + 大箭头（无锚点，与射线区分） */
export function TvArrow({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4.5 19.5 15.5 8.5" />
      <path d="M15.5 8.5 14 13.3M15.5 8.5 10.7 10" />
    </TvIcon>
  );
}

/** 水平线：单轴水平直线 */
export function TvHline({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 12h16" />
    </TvIcon>
  );
}

/** 垂直线：单轴垂直直线 */
export function TvVline({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M12 4v16" />
    </TvIcon>
  );
}

/** 信息线：斜线 + 末端价签（标签内一行文字意象） */
export function TvInfoLine({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M3.5 17.5 11 10" />
      <rect x="11" y="4.5" width="9" height="6.5" rx="1" />
      <path d="M13.5 7.8h4" />
    </TvIcon>
  );
}

/** 平行通道：双平行斜线 + 两端连接线（平行四边形） */
export function TvChannel({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 14.5 16 5.5M8 18.5 20 9.5" />
      <path d="M4 14.5 8 18.5M16 5.5 20 9.5" />
    </TvIcon>
  );
}

/** 路径：自由画笔曲线（贝塞尔抖动线） */
export function TvPath({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M3.5 14.5C6 9.5 8.5 8.5 11 10c4.5 6 7.5 4 10-0.5" />
    </TvIcon>
  );
}

/** 测量：斜置直尺 + 三档刻度（预测和测量工具组） */
export function TvMeasure({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <g transform="rotate(-45 12 12)">
        <rect x="3.5" y="8.5" width="17" height="7" rx="1" />
        <path d="M7 8.5v3M12 8.5v4.5M17 8.5v3" />
      </g>
    </TvIcon>
  );
}

/** 百分比线：三条长短不一的水平线 + 右端 % 号（与 fib 回撤的「4 线组 + 左锚刻度」明确区分） */
export function TvPercentLine({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M3 7h8M3 12h9M3 17h7" />
      <circle cx="14.5" cy="15" r="1.7" />
      <circle cx="18.5" cy="9" r="1.7" />
      <path d="M13.5 16.5 19.5 7.5" />
    </TvIcon>
  );
}

/** 矩形：圆角矩形 */
export function TvRect({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <rect x="4" y="6.5" width="16" height="11" rx="1" />
    </TvIcon>
  );
}

/** 椭圆：横放椭圆 */
export function TvEllipse({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </TvIcon>
  );
}

/** 多边形：五边形闭合折线 */
export function TvPolygon({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M12 4 19.5 9.5 16 18.5 8 18.5 4.5 9.5z" />
    </TvIcon>
  );
}

/** 圆弧：四分之一圆弧（圆心左下） */
export function TvArc({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M5 19.5A14.5 14.5 0 0 0 19.5 5" />
    </TvIcon>
  );
}

/** 曲线：贝塞尔 S 曲线 + 两个控制点 + 虚线控制柄 */
export function TvCurve({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 16.5C8 4 16 20 20 7.5" />
      <path d="M4 16.5 8 4M20 7.5 16 20" strokeDasharray="2.5 2" />
      <circle cx="8" cy="4" r="1.2" />
      <circle cx="16" cy="20" r="1.2" />
    </TvIcon>
  );
}
