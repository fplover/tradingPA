// 「回到最新」按钮（自 Chart.tsx 拆出）：轮询检测视口离开右边缘 → 显示按钮（TradingView 同位置），
// 点击回右缘。DOM 结构与 Chart.tsx 内联版本逐字一致（title / aria-label / 样式不变）。
import { useEffect, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { icon, radius } from '@/ui/tokens';

/** 离开右边缘时显示「回到最新」（TradingView 同位置按钮） */
export function useBackToLatest(rendererRef: { current: ChartRenderer | null }): boolean {
  const [atRight, setAtRight] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = rendererRef.current;
      if (r) setAtRight(r.atRightEdge);
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  return atRight;
}

export function BackToLatestButton({ rendererRef }: { rendererRef: { current: ChartRenderer | null } }) {
  return (
    <button
      onClick={() => rendererRef.current?.scrollToRealtime()}
      title="回到最新"
      aria-label="回到最新"
      style={gotoLatestStyle}
    >
      <ChevronsRight size={icon.md} />
    </button>
  );
}

const gotoLatestStyle: React.CSSProperties = {
  position: 'absolute',
  right: 72,
  bottom: 30,
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--panel)',
  color: 'var(--text-dim)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  cursor: 'pointer',
  zIndex: 12,
};
