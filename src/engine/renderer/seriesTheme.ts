import { theme } from '../theme';

/**
 * 系列线色（阶梯线/带标记线形/HLC 面积）：与线形/面积同族，
 * 取设计令牌 --accent（global.css 双主题定义，与 UI 强调色同源）；
 * 无 DOM 环境（单测 node 环境）或令牌缺失时回落主题涨色。
 */
let lineColorCache = '';
let lineColorCacheKey = '';
export function seriesLineColor(): string {
  if (typeof document === 'undefined') return theme.up;
  const key = document.body.className;
  if (key !== lineColorCacheKey || lineColorCache === '') {
    const v = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    lineColorCache = v !== '' ? v : theme.up;
    lineColorCacheKey = key;
  }
  return lineColorCache;
}
