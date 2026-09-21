import type { Bar } from '@/types/market';

/**
 * 生成随机游走 OHLCV 模拟数据（M0 原型用，M5 替换为交易所实时数据）。
 */
export function generateMockBars(count: number, intervalMs = 60_000): Bar[] {
  const bars: Bar[] = [];
  const now = Date.now();
  let price = 100 + Math.random() * 50;
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs;
    const open = price;
    const drift = (Math.random() - 0.5) * price * 0.004;
    const close = Math.max(0.01, open + drift);
    const high = Math.max(open, close) + Math.random() * price * 0.003;
    const low = Math.min(open, close) - Math.random() * price * 0.003;
    const volume = 100 + Math.random() * 900;
    bars.push({ time, open, high, low, close, volume });
    price = close;
  }
  return bars;
}
