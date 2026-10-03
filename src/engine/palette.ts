/**
 * 图表调色板（TV 默认色数据源）。
 *
 * 定位：**这些不是「渲染路径硬编码」，而是用户可在指标/画线设置里改的默认值数据**。
 * 集中到此处后，P0 规则「渲染路径禁硬编码 hex」才可机械审计——
 * grep 渲染路径（engine/renderer、engine/drawing 的 draw*）应无 `'#` 字面量，
 * 需要默认色的地方一律经 PALETTE 取值。
 *
 * 不并入此处：
 *   - `src/engine/theme.ts`：主题 token 定义本身（token 值必须有落点）
 *   - `src/indicators/pine/series.ts`：Pine `color.*` 语言常量表——
 *     那是语言规格映射（color.red → #f44336），不可随主题/品牌调整
 *
 * 命名即色值：后缀两位十六进制为 alpha（22≈13% / 55≈33% / 80≈50% / 88≈53%），
 * 与迁移前逐字符一致。**改这里的值会同时改变所有以它为默认的指标/画线**，
 * 因此任何改动都必须重跑黄金截图（21 面 + 画线家族面）。
 */
export const PALETTE = {
  // 主色系
  blue: '#2962ff',
  blue22: '#2962ff22',
  blue88: '#2962ff88',

  // 涨/多方
  green: '#26a69a',
  green55: '#26a69a55',
  green80: '#26a69a80',
  green88: '#26a69a88',

  // 跌/空方
  red: '#ef5350',
  red55: '#ef535055',
  red80: '#ef535080',

  // 其余 TV 调色板
  orange: '#ff9800',
  orange88: '#ff980088',
  amber: '#ffc107',
  deepOrange: '#ff5722',
  pink: '#e91e63',
  pink88: '#e91e6388',
  magenta: '#9c27b0',
  purple: '#7e57c2',
  indigo: '#3f51b5',
  cyan: '#00bcd4',
  brown: '#795548',
  midGreen: '#4caf50',
  lightGreen: '#8bc34a',

  // 中性
  gray: '#787b86',
  gray22: '#787b8622',
  lightGray: '#d1d4dc',
  darkNavy: '#131722',

  // 便签
  paleYellow: '#fff9c4',

  // 恒白（非主题色）：canvas 上「背景恒白」的少量元素（画线手柄、涨跌幅徽章文字等）。
  // 之所以集中在此而非走 theme token，是因为它**刻意不随主题变化**——
  // 集中后 canvas 渲染路径零 hex 字面量，P0 规则可机械审计。
  white: '#ffffff',
} as const;

export type PaletteColor = (typeof PALETTE)[keyof typeof PALETTE];
