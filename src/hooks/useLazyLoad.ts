// 懒加载检测轮询（自 Chart.tsx 拆出）：视口接近数据左边缘时通知外部拉取更早历史。
import { useEffect } from 'react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';

export function useLazyLoad(
  rendererRef: { current: ChartRenderer | null },
  onNeedsMoreHistory?: () => void,
): void {
  useEffect(() => {
    if (!onNeedsMoreHistory) return;
    const id = setInterval(() => {
      const renderer = rendererRef.current;
      if (renderer && renderer.viewportFirst < 30) onNeedsMoreHistory();
    }, 500);
    return () => clearInterval(id);
  }, [onNeedsMoreHistory]);
}
