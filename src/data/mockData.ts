import type { Bar } from '@/types/market';

/** 符号哈希 → 确定性随机种子（多图表共享同一符号时数据一致） */
function seedFrom(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

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

/** 按符号生成确定性模拟数据（多图表布局用） */
export function generateSeededMockBars(
  symbol: string,
  count: number,
  intervalMs = 60_000,
  basePrice = 30_000,
): Bar[] {
  const rand = lcg(seedFrom(symbol));
  const bars: Bar[] = [];
  const now = Date.now();
  const priceScale = 0.5 + rand();
  let price = basePrice * priceScale;
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs;
    const open = price;
    const drift = (rand() - 0.5) * price * 0.004;
    const close = Math.max(0.01, open + drift);
    const high = Math.max(open, close) + rand() * price * 0.003;
    const low = Math.min(open, close) - rand() * price * 0.003;
    const volume = 100 + rand() * 900;
    bars.push({ time, open, high, low, close, volume });
    price = close;
  }
  return bars;
}
