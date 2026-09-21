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
};

export const theme: ChartTheme = { ...darkTheme };

export type ThemeName = 'dark' | 'light';

export function setTheme(name: ThemeName): void {
  Object.assign(theme, name === 'dark' ? darkTheme : lightTheme);
  document.body.style.background = theme.background;
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(`theme-${name}`);
}
