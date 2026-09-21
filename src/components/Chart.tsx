import { useEffect, useRef } from 'react';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Bar } from '@/types/market';

interface ChartProps {
  bars: Bar[];
}

/** React 只负责挂载/卸载引擎，渲染循环完全不经过 React */
export function Chart({ bars }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ChartRenderer(canvas, bars);
    rendererRef.current = renderer;
    if (import.meta.env.DEV) {
      (window as unknown as { __chartRenderer?: ChartRenderer }).__chartRenderer = renderer;
    }
    renderer.start();
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setData(bars);
  }, [bars]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
    />
  );
}
