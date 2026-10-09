import type { JSX } from 'react';

import { TvIcon, type TvIconProps } from './tvIcons';

/** 二期-C1 形态家族 9 种 + 斐波那契补尾 2 种（TV 风自绘图标）。
 *  视觉区分度（重点）：
 *  - ABCD    = 4 点锯齿（三段折线）；谐波 4 变体同为 5 点锯齿，以 D 点相对 A 点
 *    的深度区分：加特莱 D 回到 XA 深度 / 蝙蝠略浅 / 蝴蝶 D 越过 XA / 螃蟹 D 大幅越过；
 *  - 头肩顶   = 双肩谷 + 高头曲线；头肩底镜像；
 *  - 三角收敛  = 两线右端汇聚；三角扩散 = 两线右端张开（左端汇聚）；
 *  - fib 通道 = 平行三线组；fib 螺旋 = 渐开螺旋。 */

/** ABCD 形态：4 点锯齿 */
export function TvAbcPattern({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M4 18l5-11 4 9 7-12" />
    </TvIcon>
  );
}

/** 加特莱：5 点锯齿，D 点回到 XA 深度（末点低于 C 高于 A） */
export function TvGartley({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M3 19l4-13 4 8 4-6 6 10" />
    </TvIcon>
  );
}

/** 蝙蝠：5 点锯齿，D 点略浅于 A */
export function TvBat({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M3 17l4-11 4 7 4-5 6 8" />
    </TvIcon>
  );
}

/** 蝴蝶：5 点锯齿，D 点越过 A（末点更低） */
export function TvButterfly({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M4 16l4-11 4 7 4-5 5 12" />
    </TvIcon>
  );
}

/** 螃蟹：5 点锯齿，D 点大幅越过 A（末点最低且离 C 更远） */
export function TvCrab({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M5 15l3-10 4 7 4-5 4 14" />
    </TvIcon>
  );
}

/** 头肩顶：左肩-颈-头-颈-右肩 + 基线 */
export function TvHeadShoulders({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M3 17h18" />
      <path d="M4 16l2-5 3 4 3-9 3 9 3-4 2 5" />
    </TvIcon>
  );
}

/** 头肩底：头肩顶镜像 */
export function TvHeadShouldersInverse({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M3 7h18" />
      <path d="M4 8l2 5 3-4 3 9 3-9 3 4 2-5" />
    </TvIcon>
  );
}

/** 三角收敛：两线右端汇聚 */
export function TvTrianglePattern({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M4 6l16 6M4 18l16-6" />
    </TvIcon>
  );
}

/** 三角扩散：两线右端张开 */
export function TvTriangleExpanding({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M4 12l16-6M4 12l16 6" />
    </TvIcon>
  );
}

/** 斐波那契通道：平行三线组 */
export function TvFibChannel({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M4 19L19 6" />
      <path d="M4 14L19 1.5" />
      <path d="M6 23L21 10.5" />
    </TvIcon>
  );
}

/** 斐波那契螺旋：渐开螺旋 */
export function TvFibSpiral({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M12 12c1.6 0 2.6 1 2.6 2.5S13 17.4 11 17.4 7.2 15.4 7.2 13 9.2 8.4 12 8.4s5.8 2.3 5.8 5.8-2.6 6.8-7 6.8" />
    </TvIcon>
  );
}

/** 二期-C2 杂项四工具图标 */

/** 预测形态：实线锚段 + 虚线投影箭头 */
export function TvForecast({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M3 19l6-8" />
      <path d="M9 11l9-6" strokeDasharray="2.5 2.5" />
      <path d="M18 5l2.5 1-1 2.5" />
    </TvIcon>
  );
}

/** 圆形：正圆 + 中线 */
export function TvCircle({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <circle cx="12" cy="12" r="8" />
    </TvIcon>
  );
}

/** 价格注记：旗标 + 右向虚线 */
export function TvPriceNote({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M4 12h16" strokeDasharray="2.5 2.5" />
      <path d="M8 12l-3-3.5h6z" />
    </TvIcon>
  );
}

/** 图标标记：星形（SVG 矢量图标集代表，非 emoji） */
export function TvIconMark({ size, strokeWidth, ...rest }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.1L12 17l-5.6 3 1.2-6.1L3 9.6l6.3-.8z" />
    </TvIcon>
  );
}
