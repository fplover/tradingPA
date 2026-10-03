import type { JSX } from 'react';

import { TvIcon, type TvIconProps } from './tvIcons';

/** 文本族 5 种 + Fib 家族 6 种 + 江恩 3 件 + 艾略特波浪（TV 风自绘图标）。
 *  视觉区分度（重点）：
 *  - fib 回撤   = 4 线组 + 左锚刻度；扩展 = 三锚点折线 + 右侧线组；扇形 = 左下角起点 3 射线；
 *  - fib 弧线   = 基线 + 单弧；时区 = 等距渐远竖线；auto = 星杖（魔杖 + 双闪光）；
 *  - 江恩扇形   = 中心点向四角的放射（与 fib 扇形的「单角 3 射线」区分）；
 *  - 江恩线     = 斜线 + 两道刻度；江恩箱 = 方格 + 十字；
 *  - 艾略特     = 5-3 锯齿波；文本 = 大写 T；锚定文本 = T + 下锚点；便签 = 折角便签；
 *  - 价格标签   = 吊牌；箭头标记 = 折角箭头。 */

/** 文本：大写 T */
export function TvText({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M5 6h14M12 6v12" />
    </TvIcon>
  );
}

/** 锚定文本：T + 下引线 + 锚点圆 */
export function TvAnchoredText({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M6 4.5h11M11.5 4.5V12" />
      <path d="M11.5 12v3" />
      <circle cx="11.5" cy="17.5" r="1.8" />
    </TvIcon>
  );
}

/** 便签：右上折角便签 + 折线 */
export function TvNote({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M5.5 4.5h11l3 3v12h-14z" />
      <path d="M16.5 4.5v3h3" />
    </TvIcon>
  );
}

/** 价格标签：吊牌（牌身 + 挂孔 + 牌内一行） */
export function TvPriceLabel({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <rect x="3.5" y="8" width="14" height="8" rx="1.5" />
      <circle cx="7" cy="12" r="1.2" />
      <path d="M10.5 12h4.5" />
    </TvIcon>
  );
}

/** 箭头标记：折角箭头（先上后右再箭头） */
export function TvArrowMark({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 20v-7a4 4 0 0 1 4-4h8" />
      <path d="M12 4.5 16.5 9 12 13.5" />
    </TvIcon>
  );
}

/** fib 回撤：4 线组 + 左锚刻度（横线组 + 左侧竖刻度） */
export function TvFib({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 5.5v13" />
      <path d="M7 7h13M7 10.5h13M7 14h13M7 17.5h13" />
    </TvIcon>
  );
}

/** fib 扩展：三锚点折线 + 右侧水平线组 */
export function TvFibExtension({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M3 17.5 8 8l4.5 4.5" />
      <path d="M15 7.5h6M15 11h6M15 14.5h6" />
    </TvIcon>
  );
}

/** fib 扇形：左下角起点 + 3 条放射线 */
export function TvFibFan({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M6.5 18 20 6.5M6.5 18 20 11.5M6.5 18 20 16.5" />
      <rect x="3.5" y="16.5" width="3" height="3" />
    </TvIcon>
  );
}

/** fib 弧线：基线 + 单弧（圆心在基线左下端） */
export function TvFibArc({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4.5 19.5 17.5 6.5" />
      <path d="M17.5 6.5A13 13 0 0 1 4.5 19.5" />
    </TvIcon>
  );
}

/** fib 时区：等距渐远竖线（fib 数列间隔意象） */
export function TvFibTimezone({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M5 4.5v15M9 4.5v15M13.5 4.5v15M19 4.5v15" />
    </TvIcon>
  );
}

/** Auto Fib：星杖（斜置魔杖 + 双十字闪光） */
export function TvFibAuto({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4 19.5 13.5 10" />
      <path d="M17 4v5M14.5 6.5h5" />
      <path d="M19.5 9.8v2.4M18.3 11h2.4" />
    </TvIcon>
  );
}

/** 江恩扇形：中心点向四角放射（与 fib 扇形「单角 3 射线」区分） */
export function TvGannFan({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M12 12 4.5 4.5M12 12 12 4M12 12 19.5 4.5M12 12 20.5 12" />
      <circle cx="12" cy="12" r="1.2" />
    </TvIcon>
  );
}

/** 江恩线：斜线 + 两道垂直刻度（角度尺意象） */
export function TvGannLine({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M4.5 19 18.5 6.5" />
      <path d="M8.2 13.7 10.2 16M12.8 9.6 14.8 11.8" />
    </TvIcon>
  );
}

/** 江恩箱：方格 + 十字分隔 */
export function TvGannBox({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M12 4v16M4 12h16" />
    </TvIcon>
  );
}

/** 艾略特波浪：5-3 锯齿波 */
export function TvElliottWave({ size, strokeWidth }: TvIconProps): JSX.Element {
  return (
    <TvIcon size={size} strokeWidth={strokeWidth}>
      <path d="M3 14.5 6.5 7.5 10 12 13.5 5.5 17 10 21 6.5" />
    </TvIcon>
  );
}
