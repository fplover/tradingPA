/** 设计令牌：间距 / 圆角 / 字阶 / 控件高度 / 层级 / 阴影。
 *  颜色沿用 global.css 的 CSS 变量（--bg/--panel/--text/--accent/...），此处只收拢散落的魔数。 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

/** 字号阶梯（交易界面偏小字号密集信息） */
export const fontSize = {
  xs: 10,
  sm: 11,
  md: 12,
  lg: 13,
  xl: 14,
} as const;

/** 控件高度 */
export const control = {
  hSm: 22,
  h: 26,
  hLg: 30,
  iconBtn: 28,
} as const;

/** 层级（与现有组件对齐） */
export const zIndex = {
  toolbar: 15,
  panel: 16,
  dropdown: 30,
  modal: 60,
  toast: 70,
} as const;

export const shadow = {
  menu: '0 4px 16px rgba(0, 0, 0, 0.35)',
} as const;

/** 数值显示统一用等宽数字（价格/盈亏/数量列对齐） */
export const numeric: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};
