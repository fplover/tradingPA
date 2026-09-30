// store / props 状态 → renderer 命令式 API 的单向下发（自 Chart.tsx 拆出，单文件 ≤300 行红线）。
// 覆盖：图例、图表类型、对数轴、画线工具/磁吸、指标同步、交易可视化、复盘、主题重绘。
// 渲染循环完全不经过 React；引擎 → store 的回调写回仍在 Chart.tsx。
import { useEffect } from 'react';
import type { ChartTypeId } from '@/types/market';
import type { MarketId } from '@/types/instrument';
import type { IndicatorOptions } from '@/indicators/core/instance';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { useDrawingStore } from '@/store/drawingStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useReplayStore } from '@/store/replayStore';
import { useThemeStore } from '@/store/themeStore';
import { useTradeStore } from '@/features/trading/tradeStore';

export interface ChartCommandsOptions {
  rendererRef: { current: ChartRenderer | null };
  symbol: string;
  interval: string;
  decimals: number;
  exchange?: string;
  timeframeId?: string;
  market?: MarketId;
  chartType: ChartTypeId;
  logScale: boolean;
}

export function useChartCommands(options: ChartCommandsOptions): void {
  const { rendererRef, symbol, interval, decimals, exchange, timeframeId, market, chartType, logScale } = options;

  // 画线工具/磁吸同步
  const activeTool = useDrawingStore((s) => s.activeTool);
  const magnet = useDrawingStore((s) => s.magnet);

  // 指标同步：store 为意图源，renderer 为实例源（按 id 对齐，增删与全量选项下发）
  const activeIndicators = useIndicatorStore((s) => s.active);

  // 交易可视化：数据同步
  const tradeVersion = useTradeStore((s) => s.version);

  // 复盘模式：订阅 store（index → 隐藏未来 K 线；selectMode → 图表点击定位）
  const replayIndex = useReplayStore((s) => s.index);
  const replaySelectMode = useReplayStore((s) => s.selectMode);
  const setReplayIndexStore = useReplayStore((s) => s.setIndex);
  const setReplaySelectMode = useReplayStore((s) => s.setSelectMode);

  // 主题切换：立即重绘画布（不等 rAF，避免图表区滞后于界面）
  const themeName = useThemeStore((s) => s.name);

  useEffect(() => {
    rendererRef.current?.setLegend({ symbol, interval, decimals, exchange, timeframeId, market });
  }, [symbol, interval, decimals, exchange, timeframeId, market]);

  useEffect(() => {
    rendererRef.current?.setChartType(chartType);
  }, [chartType]);

  useEffect(() => {
    rendererRef.current?.setLogScale(logScale);
  }, [logScale]);

  useEffect(() => {
    rendererRef.current?.setActiveTool(activeTool as Parameters<ChartRenderer['setActiveTool']>[0]);
  }, [activeTool]);

  useEffect(() => {
    rendererRef.current?.setMagnet(magnet);
  }, [magnet]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const current = renderer.listIndicators();
    const desiredIds = new Set(activeIndicators.map((a) => a.id));
    for (const cur of current) {
      if (!desiredIds.has(cur.id)) renderer.removeIndicator(cur.uid);
    }
    for (const des of activeIndicators) {
      const options: IndicatorOptions = {
        params: des.params,
        styles: des.styles,
        precision: des.precision,
        displayName: des.displayName,
        visibleTimeframes: des.visibleTimeframes,
      };
      const cur = current.find((c) => c.id === des.id);
      if (!cur) renderer.addIndicator(des.id, options);
      else renderer.updateIndicator(cur.uid, options);
    }
  }, [activeIndicators]);

  useEffect(() => {
    rendererRef.current?.setTradeVisual(useTradeStore.getState().visual());
  }, [tradeVersion]);

  useEffect(() => {
    rendererRef.current?.setReplayIndex(replayIndex);
  }, [replayIndex]);

  useEffect(() => {
    rendererRef.current?.setBarSelectMode(replaySelectMode, (idx) => {
      setReplayIndexStore(idx);
      setReplaySelectMode(false);
    });
    return () => rendererRef.current?.setBarSelectMode(false, null);
  }, [replaySelectMode, setReplayIndexStore, setReplaySelectMode]);

  useEffect(() => {
    rendererRef.current?.redraw();
  }, [themeName]);
}
