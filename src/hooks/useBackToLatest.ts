// 「回到最新」开合状态源（自 Chart.tsx 拆出）：轮询检测视口离开右边缘 → 显示按钮
// （TradingView 同位置）。按钮 DOM 见 BackToLatestButton.tsx（与 Chart.tsx 内联版本逐字一致）。
import { useEffect, useState } from 'react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';

/** 离开右边缘时显示「回到最新」（TradingView 同位置按钮） */
export function useBackToLatest(rendererRef: { current: ChartRenderer | null }): boolean {
  const [atRight, setAtRight] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = rendererRef.current;
      if (r) setAtRight(r.atRightEdge);
    }, 300);
    return () => window.clearInterval(id);
  }, [rendererRef]);
  return atRight;
}
