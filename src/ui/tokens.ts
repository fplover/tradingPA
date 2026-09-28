/** 设计令牌：间距 / 圆角 / 字阶 / 图标尺寸 / 控件高度 / 层级 / 阴影。
 *  颜色沿用 global.css 的 CSS 变量（--bg/--panel/--text/--accent/...），此处只收拢散落的魔数。
 *
 *  圆角四档（TV 规格）：xs 3 = tooltip/轴标签/徽章；sm 4 = 按钮/输入框/小控件；
 *  md 6 = 下拉菜单/flyout/浮层；lg 8 = 模态对话框/大弹窗。
 *  图标四档：sm 12 = 微标（旗标/排序箭头/行内提示）；md 14 = 菜单项/面板控件；
 *  lg 16 = 顶栏与面板头部按钮；xl 18 = 画线工具/右侧图标轨。
 *  阴影四档：tooltip < popover < menu < modal，按浮层级配。 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  /** tooltip / 轴标签 / 徽章 */
  xs: 3,
  /** 按钮 / 输入框 / 小控件 */
  sm: 4,
  /** 下拉菜单 / flyout / 浮层 */
  md: 6,
  /** 模态对话框 / 大弹窗 */
  lg: 8,
} as const;

/** 字号阶梯：对齐 TradingView（正文 14 / 密集行 13 / 元信息 12 / 微标签 11） */
export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 14,
  xl: 15,
} as const;

/** 图标尺寸四档（lucide-react size 属性统一引用，禁止散落魔数） */
export const icon = {
  /** 微标：旗标 / 排序箭头 / 行内提示图标 */
  sm: 12,
  /** 菜单项 / 面板控件图标 */
  md: 14,
  /** 顶栏与面板头部按钮图标 */
  lg: 16,
  /** 画线工具 / 右侧图标轨图标 */
  xl: 18,
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
  /** tooltip：最轻，贴附触发元素 */
  tooltip: '0 1px 4px rgba(0, 0, 0, 0.3)',
  /** 小浮层：flyout / 指标面板 */
  popover: '0 2px 4px rgba(0, 0, 0, 0.2)',
  /** 下拉菜单 */
  menu: '0 4px 16px rgba(0, 0, 0, 0.35)',
  /** 模态对话框：最深，与页面分层 */
  modal: '0 8px 32px rgba(0, 0, 0, 0.45)',
} as const;

/** 数值显示统一用等宽数字（价格/盈亏/数量列对齐） */
export const numeric: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};
