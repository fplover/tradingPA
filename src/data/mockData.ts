import type { Bar } from '@/types/market';

/**
 * 生成随机游走 OHLCV 模拟数据（M0-M4 原型用，M5 替换为交易所实时数据）。
 */
export function generateMockBars(
  count: number,
  intervalMs = 60_000,
  startPrice = 30_000,
  volatility = 0.004,
): Bar[] {
  const bars: Bar[] = [];
  const now = Date.now();
  let price = startPrice;
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs;
    const open = price;
    const drift = (Math.random() - 0.5) * price * volatility;
    const close = Math.max(0.01, open + drift);
    const high = Math.max(open, close) + Math.random() * price * volatility * 0.75;
    const low = Math.min(open, close) - Math.random() * price * volatility * 0.75;
    const volume = 100 + Math.random() * 900;
    bars.push({ time, open, high, low, close, volume });
    price = close;
  }
  return bars;
}
