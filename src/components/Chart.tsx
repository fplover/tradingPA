import { useEffect, useRef, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Bar, ChartTypeId } from '@/types/market';
import type { IndicatorOptions } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useDrawingStore } from '@/store/drawingStore';
import { useThemeStore } from '@/store/themeStore';
import { useReplayStore } from '@/store/replayStore';
import { useTradeStore } from '@/features/trading/tradeStore';
import { useOrderMenuStore } from '@/store/orderMenuStore';
import { syncBus } from '@/store/syncBus';

interface ChartProps {
  bars: Bar[];
  symbol?: string;
  interval?: string;
  decimals?: number;
  /** 周期 id，用于指标按周期可见性 */
  timeframeId?: string;
  /** 交易所名，图例行展示 */
  exchange?: string;
  /** 实时模拟：以该间隔抖动最后一根 K 线（M5 替换为真实 WS） */
  liveTickMs?: number;
  chartType?: ChartTypeId;
  logScale?: boolean;
  onRendererReady?: (renderer: ChartRenderer | null) => void;
  /** 视口滚动到数据左边缘时触发（懒加载更早历史） */
  onNeedsMoreHistory?: () => void;
  /** 非回放时右键图表（价格/时间/屏幕坐标） */
  onChartContextMenu?: (price: number, time: number, clientX: number, clientY: number) => void;
  /** 图例区右键（屏幕坐标） */
  onLegendMenu?: (clientX: number, clientY: number) => void;
  /** 右键命中画线（画线 id + 屏幕坐标） */
  onDrawingMenu?: (id: string, clientX: number, clientY: number) => void;
  /** 参与多图表联动（十字光标/视口同步） */
  sync?: boolean;
}

/** React 只负责挂载/卸载引擎与同步配置，渲染循环完全不经过 React */
export function Chart({
  bars,
  symbol = 'BTC/USDT',
  interval = '1m',
  decimals = 2,
  timeframeId,
  exchange,
  liveTickMs,
  chartType = 'candles',
  logScale = false,
  onRendererReady,
  onNeedsMoreHistory,
  onChartContextMenu,
  onLegendMenu,
  onDrawingMenu,
  sync = false,
}: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const lastBarRef = useRef<Bar | undefined>(bars[bars.length - 1]);
  const barsRef = useRef<Bar[]>(bars);
  const prevBarsRef = useRef<Bar[]>(bars);

  useEffect(() => {
    lastBarRef.current = bars[bars.length - 1];
    barsRef.current = bars;
  }, [bars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ChartRenderer(canvas, bars, { symbol, interval, decimals, exchange, timeframeId });
    rendererRef.current = renderer;
    onRendererReady?.(renderer);
    if (import.meta.env.DEV) {
      (window as unknown as { __chartRenderer?: ChartRenderer }).__chartRenderer = renderer;
    }
    renderer.setChartType(chartType);
    renderer.setLogScale(logScale);
    renderer.start();
    return () => {
      onRendererReady?.(null);
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const prev = prevBarsRef.current;
    prevBarsRef.current = bars;
    // 左侧翻页：新数据全是更早的 K 线时走前插，保持视口不跳回右边缘
    const at = prev.length > 0 ? bars.findIndex((b) => b.time === prev[0].time) : -1;
    if (at > 0) renderer.prependBars(bars.slice(0, at));
    else renderer.setData(bars);
  }, [bars]);

  useEffect(() => {
    rendererRef.current?.setLegend({ symbol, interval, decimals, exchange, timeframeId });
  }, [symbol, interval, decimals, exchange, timeframeId]);

  useEffect(() => {
    rendererRef.current?.setChartType(chartType);
  }, [chartType]);

  useEffect(() => {
    rendererRef.current?.setLogScale(logScale);
  }, [logScale]);

  // 画线工具/磁吸同步
  const activeTool = useDrawingStore((s) => s.activeTool);
  const magnet = useDrawingStore((s) => s.magnet);
  const setActiveToolStore = useDrawingStore((s) => s.setActiveTool);
  useEffect(() => {
    rendererRef.current?.setActiveTool(activeTool as Parameters<ChartRenderer['setActiveTool']>[0]);
  }, [activeTool]);

  useEffect(() => {
    rendererRef.current?.setMagnet(magnet);
  }, [magnet]);

  // 键盘快捷键：Esc 取消 / Delete 删除 / Ctrl+Z 撤销 / Ctrl+Y 重做 / Enter 完成路径
  // +/- 缩放、←/→ 平移（对齐 TradingView）；菜单/弹窗打开时不劫持方向键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (target && target.closest('[role="menu"], [role="dialog"], [role="listbox"]')) return;
      const renderer = rendererRef.current;
      if (!renderer) return;
      if (e.key === 'Escape') {
        renderer.cancelPlacing();
        setActiveToolStore(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        renderer.removeSelectedDrawing();
      } else if (e.key === 'Enter') {
        renderer.finishPlacing();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        renderer.undoDrawing();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        renderer.redoDrawing();
      } else if (e.key === '+' || e.key === '=') {
        renderer.zoom(1.2);
      } else if (e.key === '-' || e.key === '_') {
        renderer.zoom(1 / 1.2);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        renderer.pan(-3);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        renderer.pan(3);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveToolStore]);

  // 指标同步：store 为意图源，renderer 为实例源（按 id 对齐，增删与全量选项下发）
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

  // 懒加载检测：视口接近数据左边缘时通知外部
  useEffect(() => {
    if (!onNeedsMoreHistory) return;
    const id = setInterval(() => {
      const renderer = rendererRef.current;
      if (renderer && renderer.viewportFirst < 30) onNeedsMoreHistory();
    }, 500);
    return () => clearInterval(id);
  }, [onNeedsMoreHistory]);

  // 交易可视化：数据同步 + 交互回调
  const tradeVersion = useTradeStore((s) => s.version);
  useEffect(() => {
    rendererRef.current?.setTradeVisual(useTradeStore.getState().visual());
  }, [tradeVersion]);

  useEffect(() => {
    rendererRef.current?.setTradeCallbacks({
      onOrderMove: (id, price) => useTradeStore.getState().updateOrderPrice(id, price),
      onOrderCancel: (id) => useTradeStore.getState().cancel(id),
      onPositionTpSl: (tp, sl) => useTradeStore.getState().setPositionTPSL(tp, sl),
      // 持仓详情块 × ：按当前回放 bar 收盘价市价平仓
      onPositionClose: () => {
        const idx = useReplayStore.getState().index;
        const list = barsRef.current;
        const bar = idx !== null ? list[idx] : list[list.length - 1];
        if (bar) useTradeStore.getState().closePosition(bar.close, bar.time);
      },
    });
    rendererRef.current?.setChartClickCallback((price, time, clientX, clientY) => {
      useOrderMenuStore.getState().openMenu(price, time, clientX, clientY);
    });
    rendererRef.current?.setContextMenuCallback((price, _time, clientX, clientY) => {
      onChartContextMenu?.(price, _time, clientX, clientY);
    });
    rendererRef.current?.setPaneActionCallback((action, indicatorId) => {
      if (action === 'settings') useIndicatorStore.getState().setSettingsFor(indicatorId);
      else useIndicatorStore.getState().remove(indicatorId);
    });
    rendererRef.current?.setStudyActionCallback((action, uid) => {
      const found = (rendererRef.current?.listIndicators() ?? []).find((l) => l.uid === uid);
      if (!found) return;
      const store = useIndicatorStore.getState();
      if (action === 'settings') {
        store.setSettingsFor(found.id);
        return;
      }
      if (action === 'remove') {
        store.remove(found.id);
        return;
      }
      const def = getIndicatorDef(found.id);
      const entry = store.active.find((a) => a.id === found.id);
      if (!def || !entry) return;
      const allHidden = def.plots.every((p) => entry.styles?.[p.key]?.hidden === true);
      const styles: Record<string, { hidden: boolean }> = {};
      for (const p of def.plots) styles[p.key] = { hidden: !allHidden };
      store.updateInstance(found.id, { styles });
    });
    // 放置完成后：未开「保持绘图模式」则退回光标（TV 行为）
    rendererRef.current?.setToolFinishedCallback(() => {
      const ds = useDrawingStore.getState();
      if (!ds.stayMode) ds.setActiveTool(null);
    });
    // 双击画线 → 画线设置
    rendererRef.current?.setDrawingSettingsCallback((drawingId) => useDrawingStore.getState().setSettingsFor(drawingId));
    // 图例区右键 → 图例菜单
    rendererRef.current?.setLegendMenuCallback((x, y) => onLegendMenu?.(x, y));
    // 右键画线 → 画线菜单
    rendererRef.current?.setDrawingMenuCallback((drawingId, x, y) => onDrawingMenu?.(drawingId, x, y));
    return () => {
      rendererRef.current?.setTradeCallbacks({});
      rendererRef.current?.setChartClickCallback(null);
      rendererRef.current?.setContextMenuCallback(null);
      rendererRef.current?.setStudyActionCallback(null);
      rendererRef.current?.setToolFinishedCallback(null);
      rendererRef.current?.setDrawingSettingsCallback(null);
      rendererRef.current?.setLegendMenuCallback(null);
      rendererRef.current?.setDrawingMenuCallback(null);
      rendererRef.current?.setPaneActionCallback(null);
    };
  }, []);



  // 复盘模式：订阅 store（index → 隐藏未来 K 线；selectMode → 图表点击定位）
  const replayIndex = useReplayStore((s) => s.index);
  const replaySelectMode = useReplayStore((s) => s.selectMode);
  const setReplayIndexStore = useReplayStore((s) => s.setIndex);
  const setReplaySelectMode = useReplayStore((s) => s.setSelectMode);
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

  // 主题切换：立即重绘画布（不等 rAF，避免图表区滞后于界面）
  const themeName = useThemeStore((s) => s.name);
  useEffect(() => {
    rendererRef.current?.redraw();
  }, [themeName]);

  // 多图表联动：十字光标时间 + 视口广播
  useEffect(() => {
    if (!sync) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    let lastEmit = 0;
    const offViewport = syncBus.onViewport((v) => renderer.setSyncViewport(v));
    const offCrosshair = syncBus.onCrosshair((t) => renderer.setSyncCrosshair(t));
    renderer.onCrosshairTime((t) => {
      const now = performance.now();
      if (now - lastEmit < 32) return; // 限频，避免刷屏
      lastEmit = now;
      syncBus.emitCrosshair(t);
    });
    renderer.onViewportCommit((v) => syncBus.emitViewport(v));
    return () => {
      offViewport();
      offCrosshair();
      renderer.onCrosshairTime(null);
      renderer.onViewportCommit(null);
    };
  }, [sync]);

  // 离开右边缘时显示「回到最新」（TradingView 同位置按钮）
  const [atRight, setAtRight] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = rendererRef.current;
      if (r) setAtRight(r.atRightEdge);
    }, 300);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
      {!atRight && (
        <button
          onClick={() => rendererRef.current?.scrollToRealtime()}
          title="回到最新"
          aria-label="回到最新"
          style={gotoLatestStyle}
        >
          <ChevronsRight size={14} />
        </button>
      )}
    </>
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
  borderRadius: 4,
  cursor: 'pointer',
  zIndex: 12,
};
