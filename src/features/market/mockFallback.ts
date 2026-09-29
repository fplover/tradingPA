import type { Bar, Timeframe } from '@/types/market';
import type { FeedStatus } from '@/data/feed/types';
import { generateSeededMockBars } from '@/data/mockData';

function mockInterval(tf: Timeframe): number {
  if (tf.seconds > 0) return tf.seconds * 1000;
  return tf.calendar === 'week' ? 7 * 86_400_000 : 30 * 86_400_000;
}

export interface MockFallbackDeps {
  onReady: () => void;
  setMode: (m: 'live' | 'mock') => void;
  setStatus: (s: FeedStatus) => void;
  setStatusDetail: (d: string) => void;
  setHistory: (bars: Bar[]) => void;
}

/**
 * 组装 degradeToMock：数据源不可达时切到种子模拟数据，五连调用顺序与文案逐字固定。
 * inst/tf 在工厂入参处一次性捕获，与调用方 effect 作用域闭包语义一致。
 */
export function createMockFallback(
  deps: MockFallbackDeps,
  inst: { id: string },
  tf: Timeframe,
): (reason: string) => void {
  return (reason: string) => {
    deps.onReady();
    deps.setMode('mock');
    deps.setStatus('error');
    deps.setStatusDetail(`${reason}，已切换到模拟数据`);
    deps.setHistory(generateSeededMockBars(inst.id, 600, mockInterval(tf), 100));
  };
}
