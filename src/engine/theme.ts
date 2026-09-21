/** TradingView 深色主题（默认） */
export const darkTheme = {
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
} as const;

export type Theme = typeof darkTheme;

export const theme: Theme = darkTheme;
