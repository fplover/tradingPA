/** 主题：深色（默认）/ 浅色。theme 为可变单例，绘制时读取当前值。 */

/** TradingView 字体栈：canvas 无 -apple-system 解析，Trebuchet MS 置首保证跨平台一致 */
export const TV_FONT = "'Trebuchet MS', -apple-system, BlinkMacSystemFont, Roboto, Ubuntu, Arial, sans-serif";

export interface ChartTheme {
  background: string;
  grid: string;
  axisText: string;
  axisLine: string;
  crosshair: string;
  up: string;
  down: string;
  upWick: string;
  downWick: string;
  border: string;
  tooltipBg: string;
  /** 价格轴「自动」恢复按钮底色（tooltipBg 在浅色主题为深色——轴标签专用；
   *  本令牌跟随主题：深色面板灰 / 浅色纯白） */
  autoBtnBg: string;
  /** 图例主文字（代码/数值） */
  legendText: string;
  /** 图例次文字（O/H/L/C 标签、周期、交易所） */
  legendDim: string;
  /** 十字光标轴标签文字色（浅色主题用深色底+白字） */
  axisLabelText: string;
  /** 选中面板的淡色高亮背景 */
  paneActive: string;
  /** 品牌强调色（与全局 CSS --accent 同源：选K预览线/剪刀徽章/限价单/线族默认色） */
  accent: string;
  /** accent 底上的文字/图标描边（与全局 CSS --text-on-accent 同源） */
  onAccent: string;
  /** 语义警示色（止损单橙） */
  warn: string;
  /** 选K预览线右侧淡蒙层（"未来"区域提示） */
  accentMask: string;
  /** 信息线标签底色（存量同值，浅色主题待分化） */
  infoLabelBg: string;
  /** Volume Profile 直方图涨/跌段（对齐 up/down 色系半透明，P1-F） */
  profileUp: string;
  profileDown: string;
  /** POC 横线与价签 */
  profilePoc: string;
  /** VAH/VAL 虚线 */
  profileVa: string;
  /** 画布水印文字（TV 画布页：主价格面板居中「代码 · 周期」大号半透明，P2） */
  watermark: string;
}

const darkTheme: ChartTheme = {
  background: '#131722',
  grid: '#1e222d',
  axisText: '#b2b5be',
  axisLine: '#2a2e39',
  crosshair: '#758696',
  up: '#26a69a',
  down: '#ef5350',
  upWick: '#26a69a',
  downWick: '#ef5350',
  border: '#2a2e39',
  tooltipBg: '#1e222d',
  autoBtnBg: '#1e222d',
  legendText: '#d1d4dc',
  legendDim: '#868993',
  axisLabelText: '#b2b5be',
  /** 选中面板高亮：必须极淡且中性，否则整块画布会被染上底色 */
  paneActive: 'rgba(255, 255, 255, 0.02)',
  accent: '#2962ff',
  onAccent: '#ffffff',
  warn: '#ff9800',
  accentMask: 'rgba(41, 98, 255, 0.06)',
  infoLabelBg: '#2a2e39', // 存量同值，浅色主题待分化
  profileUp: 'rgba(38, 166, 154, 0.5)',
  profileDown: 'rgba(239, 83, 80, 0.5)',
  profilePoc: '#ff9800',
  profileVa: 'rgba(255, 152, 0, 0.5)',
  /** 水印：深色底上取轴文字色 12% 透明度，大号居中仍不干扰行情 */
  watermark: 'rgba(178, 181, 190, 0.12)',
};

const lightTheme: ChartTheme = {
  background: '#ffffff',
  grid: '#e0e3eb',
  axisText: '#50535e',
  axisLine: '#e0e3eb',
  crosshair: '#9598a1',
  up: '#26a69a',
  down: '#ef5350',
  upWick: '#26a69a',
  downWick: '#ef5350',
  border: '#e0e3eb',
  tooltipBg: '#131722',
  autoBtnBg: '#ffffff',
  legendText: '#131722',
  legendDim: '#5d606b',
  /** 浅色主题的光标轴标签用深色底白字，白底上才看得清 */
  axisLabelText: '#ffffff',
  paneActive: 'rgba(19, 23, 34, 0.02)',
  accent: '#2962ff',
  onAccent: '#ffffff',
  warn: '#ff9800',
  accentMask: 'rgba(41, 98, 255, 0.06)',
  infoLabelBg: '#2a2e39', // 存量同值，浅色主题待分化
  profileUp: 'rgba(38, 166, 154, 0.45)',
  profileDown: 'rgba(239, 83, 80, 0.45)',
  profilePoc: '#ff9800',
  profileVa: 'rgba(255, 152, 0, 0.6)',
  /** 水印：白底上取轴文字色 12% 透明度（与深色主题等强度，观感对齐 TV） */
  watermark: 'rgba(80, 83, 94, 0.12)',
};

export const theme: ChartTheme = { ...darkTheme };

export type ThemeName = 'dark' | 'light';

export function setTheme(name: ThemeName): void {
  Object.assign(theme, name === 'dark' ? darkTheme : lightTheme);
  document.body.style.background = theme.background;
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(`theme-${name}`);
}
