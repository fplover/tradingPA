// 实时模拟轮询（自 Chart.tsx 拆出）：以固定间隔抖动最后一根 K 线（M5 替换为真实 WS）。
import { useEffect } from 'react';
import type { Bar } from '@/types/market';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';

export function useLiveTick(
  rendererRef: { current: ChartRenderer | null },
  lastBarRef: { current: Bar | undefined },
  liveTickMs?: number,
): void {
  useEffect(() => {
    if (!liveTickMs) return;
    const id = setInterval(() => {
      const renderer = rendererRef.current;
      const last = lastBarRef.current;
      if (!renderer || !last) return;
      const close = Math.max(0.01, last.close * (1 + (Math.random() - 0.5) * 0.002));
      const updated: Bar = {
        ...last,
        close,
        high: Math.max(last.high, close),
        low: Math.min(last.low, close),
        volume: last.volume + Math.random() * 5,
      };
      lastBarRef.current = updated;
      renderer.updateBar(updated);
    }, liveTickMs);
    return () => clearInterval(id);
  }, [rendererRef, lastBarRef, liveTickMs]);
}
