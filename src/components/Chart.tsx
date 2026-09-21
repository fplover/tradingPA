import { useEffect, useRef } from 'react';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Bar, ChartTypeId } from '@/types/market';
import type { ParamValue } from '@/indicators/core/types';
import { getIndicatorDef } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';

function defaultsFor(id: string): Record<string, ParamValue> {
  const def = getIndicatorDef(id);
  const out: Record<string, ParamValue> = {};
  if (def) for (const p of def.params) out[p.key] = p.default;
  return out;
}

interface ChartProps {
  bars: Bar[];
  symbol?: string;
  interval?: string;
  decimals?: number;
  /** 实时模拟：以该间隔抖动最后一根 K 线（M5 替换为真实 WS） */
  liveTickMs?: number;
  chartType?: ChartTypeId;
  logScale?: boolean;
  showVolume?: boolean;
}

/** React 只负责挂载/卸载引擎与同步配置，渲染循环完全不经过 React */
export function Chart({
  bars,
  symbol = 'BTC/USDT',
  interval = '1m',
  decimals = 2,
  liveTickMs,
  chartType = 'candles',
  logScale = false,
  showVolume = true,
}: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const lastBarRef = useRef<Bar | undefined>(bars[bars.length - 1]);

  useEffect(() => {
    lastBarRef.current = bars[bars.length - 1];
  }, [bars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ChartRenderer(canvas, bars, { symbol, interval, decimals });
    rendererRef.current = renderer;
    if (import.meta.env.DEV) {
      (window as unknown as { __chartRenderer?: ChartRenderer }).__chartRenderer = renderer;
    }
    renderer.setChartType(chartType);
    renderer.setLogScale(logScale);
    renderer.setVolumePaneVisible(showVolume);
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

  useEffect(() => {
    rendererRef.current?.setLegend({ symbol, interval, decimals });
  }, [symbol, interval, decimals]);

  useEffect(() => {
    rendererRef.current?.setChartType(chartType);
  }, [chartType]);

  useEffect(() => {
    rendererRef.current?.setLogScale(logScale);
  }, [logScale]);

  useEffect(() => {
    rendererRef.current?.setVolumePaneVisible(showVolume);
  }, [showVolume]);

  // 指标同步：store 为意图源，renderer 为实例源（按 id 对齐，去重/移除/改参）
  const activeIndicators = useIndicatorStore((s) => s.active);
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const current = renderer.listIndicators();
    const desiredIds = new Set(activeIndicators.map((a) => a.id));
    for (const cur of current) {
      if (!desiredIds.has(cur.id)) renderer.removeIndicator(cur.uid);
    }
    for (const des of activeIndicators) {
      const cur = current.find((c) => c.id === des.id);
      if (!cur) {
        renderer.addIndicator(des.id, des.params as Record<string, ParamValue>);
      } else if (JSON.stringify(cur.params) !== JSON.stringify({ ...defaultsFor(des.id), ...des.params })) {
        renderer.updateIndicatorParams(cur.uid, des.params as Record<string, ParamValue>);
      }
    }
  }, [activeIndicators]);

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
  }, [liveTickMs]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
    />
  );
}
