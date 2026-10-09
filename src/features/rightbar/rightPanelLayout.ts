/**
 * 右侧面板窄屏几何（二期-F，纯函数供单测）：
 * 桌面（非窄屏）维持原样——面板内联占位挤压图表（零像素变化）；
 * 窄屏改为固定覆盖层——不再挤压图表宽度，宽度钳制 ≤ 85vw（CSS 单位，浏览器
 * 自行按视口收敛）防遮死，覆盖层锚定在顶栏（TOPBAR_H）之下、图标轨（RAIL_W）之左。
 */

export const TOPBAR_H = 38; // 与 TopBar topBarStyle.height 同源
export const RAIL_W = 38; // 与 RightSide nav width 同源
export const PANEL_MAX_VW = '85vw'; // 窄屏面板最大占视口宽（CSS 单位）

export interface PanelBox {
  position: 'fixed' | 'relative';
  width: number;
  /** fixed 模式专属 */
  top?: number;
  bottom?: number;
  right?: number;
  maxWidth?: string;
  /** relative 模式占位高度（fixed 模式省略） */
  height?: string | number;
  flexShrink?: 0;
}

/** 面板容器几何：窄屏覆盖层 / 桌面内联占位（透传原样式，不改桌面布局） */
export function rightPanelBox(narrow: boolean, width: number): PanelBox {
  if (!narrow) {
    return { position: 'relative', width, height: '100%', flexShrink: 0 };
  }
  return {
    position: 'fixed',
    width,
    top: TOPBAR_H + 1, // 顶栏 1px 下边框之下
    bottom: 0,
    right: RAIL_W,
    maxWidth: PANEL_MAX_VW,
  };
}
