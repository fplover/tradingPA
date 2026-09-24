/** 主题：深色（默认）/ 浅色。theme 为可变单例，绘制时读取当前值。 */
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
  /** 图例主文字（代码/数值） */
  legendText: string;
  /** 图例次文字（O/H/L/C 标签、周期、交易所） */
  legendDim: string;
  /** 选中面板的淡色高亮背景 */
  paneActive: string;
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
  legendText: '#d1d4dc',
  legendDim: '#787b86',
  /** 选中面板高亮：必须极淡且中性，否则整块画布会被染上底色 */
  paneActive: 'rgba(255, 255, 255, 0.02)',
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
  tooltipBg: '#f0f3fa',
  legendText: '#131722',
  legendDim: '#787b86',
  paneActive: 'rgba(19, 23, 34, 0.02)',
};

export const theme: ChartTheme = { ...darkTheme };

export type ThemeName = 'dark' | 'light';

export function setTheme(name: ThemeName): void {
  Object.assign(theme, name === 'dark' ? darkTheme : lightTheme);
  document.body.style.background = theme.background;
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(`theme-${name}`);
}
