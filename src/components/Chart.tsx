import { useEffect, useRef, useState } from 'react';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { SelectionPopupInfo } from '@/engine/renderer/selectionPopup';
import type { Bar, ChartTypeId } from '@/types/market';
import type { MarketId } from '@/types/instrument';
import { getIndicatorDef } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useDrawingStore } from '@/store/drawingStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useReplayStore } from '@/store/replayStore';
import { useTradeStore } from '@/features/trading/tradeStore';
import { useOrderMenuStore } from '@/store/orderMenuStore';
import { syncBus } from '@/store/syncBus';
import { registerChartRenderer, unregisterChartRenderer } from '@/hooks/useTvShortcuts';
import { BackToLatestButton } from '@/hooks/BackToLatestButton';
import { useBackToLatest } from '@/hooks/useBackToLatest';
import { useChartCommands } from '@/hooks/useChartCommands';
import { useLazyLoad } from '@/hooks/useLazyLoad';
import { useLiveTick } from '@/hooks/useLiveTick';
import { isPurePrepend, seriesKey } from './chartPrepend';

interface ChartProps {
  bars: Bar[];
  symbol?: string;
  interval?: string;
  decimals?: number;
  /** 周期 id，用于指标按周期可见性 */
  timeframeId?: string;
  /** 市场（图例开/闭市圆点） */
  market?: MarketId;
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
  /** 双击最新价线 → 打开图表设置（TV 行为） */
  onPriceLineDblClick?: () => void;
  /** 右键命中画线（画线 id + 屏幕坐标） */
  onDrawingMenu?: (id: string, clientX: number, clientY: number) => void;
  /** 选中画线/指标（引擎上报锚点 canvas 坐标；null = 取消选中，浮动工具栏随之消失） */
  onSelectionPopup?: (info: SelectionPopupInfo | null) => void;
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
  market,
  exchange,
  liveTickMs,
  chartType = 'candles',
  logScale = false,
  onRendererReady,
  onNeedsMoreHistory,
  onChartContextMenu,
  onLegendMenu,
  onDrawingMenu,
  onSelectionPopup,
  onPriceLineDblClick,
  sync = false,
}: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const lastBarRef = useRef<Bar | undefined>(bars[bars.length - 1]);
  const barsRef = useRef<Bar[]>(bars);
  const prevBarsRef = useRef<Bar[]>(bars);
  /** 上一批数据所属的「标的|周期」——前插判定必须同标同周期，否则只能整序列替换 */
  const prevKeyRef = useRef<string>(`${symbol ?? ''}|${interval ?? ''}`);

  useEffect(() => {
    lastBarRef.current = bars[bars.length - 1];
    barsRef.current = bars;
  }, [bars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ChartRenderer(canvas, bars, { symbol, interval, decimals, exchange, timeframeId });
    rendererRef.current = renderer;
    // B1：图表级快捷键（缩放/平移/画线等）统一经 useTvShortcuts 的注册表作用到各渲染器
    registerChartRenderer(renderer);
    onRendererReady?.(renderer);
    if (import.meta.env.DEV) {
      (window as unknown as { __chartRenderer?: ChartRenderer }).__chartRenderer = renderer;
    }
    renderer.setChartType(chartType);
    renderer.setLogScale(logScale);
    renderer.start();
    return () => {
      unregisterChartRenderer(renderer);
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
    const key = seriesKey(symbol, interval);
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = key;
    prevBarsRef.current = bars;

    // 左侧翻页判定见 chartPrepend.isPurePrepend 的注释（第四轮审查修复）：
    // 必须同标的同周期 + 旧首柱出现在新数组 index>0 + 后缀逐根时间一致，三者同时成立
    // 才前插；否则整序列替换。修复前只判第二条，换品种时会命中并把两个标的拼在一起。
    if (isPurePrepend(prev, bars, prevKey, key)) {
      const at = bars.findIndex((b) => b.time === prev[0].time);
      renderer.prependBars(bars.slice(0, at));
    } else {
      renderer.setData(bars);
    }
  }, [bars, symbol, interval]);

  // Shift+滚轮：图表左右平移（TV 官方映射）。渲染器自身的 wheel 监听挂在 canvas 上，
  // 这里在 window 捕获阶段抢先处理并阻断传播，避免与「普通滚轮缩放」叠加。
  useEffect(() => {
    const onWheelCapture = (e: WheelEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const canvas = canvasRef.current;
      if (!canvas || !(e.target instanceof Node) || !canvas.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      rendererRef.current?.pan(e.deltaY > 0 ? 12 : -12);
    };
    window.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheelCapture, { capture: true });
  }, []);

  // store / props → renderer 命令下发（图例/类型/对数轴/工具/指标/交易/复盘/主题）
  useChartCommands({ rendererRef, symbol, interval, decimals, exchange, timeframeId, market, chartType, logScale });

  // 实时模拟：以该间隔抖动最后一根 K 线（M5 替换为真实 WS）
  useLiveTick(rendererRef, lastBarRef, liveTickMs);

  // 懒加载检测：视口接近数据左边缘时通知外部
  useLazyLoad(rendererRef, onNeedsMoreHistory);

  // 交易可视化：交互回调（引擎 → store 写回）。四个菜单 prop 由 ChartWorkspace 每次渲染
  // 以内联函数下发（底层都是 store setter，身份稳定）：直接入依赖会让整套首帧注册的
  // 回调每渲染重摘重绑；经 latest-ref 在事件期读最新回调，行为与首帧捕获完全一致。
  const menuCallbacksRef = useRef({
    onChartContextMenu,
    onLegendMenu,
    onDrawingMenu,
    onSelectionPopup,
  });
  useEffect(() => {
    menuCallbacksRef.current = { onChartContextMenu, onLegendMenu, onDrawingMenu, onSelectionPopup };
  });

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
      menuCallbacksRef.current.onChartContextMenu?.(price, _time, clientX, clientY);
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
    // AVWAP 锚点持久化（P2-D③）：引擎落锚后写回 indicatorStore params
    // （store 为意图源；renderer 重建/布局切换时经 useChartCommands 全量下发不丢锚）。
    // 同值短路在 store.setAnchorTime 内，store→engine→store 不回环。
    rendererRef.current?.setIndicatorParamsCallback((uid, params) => {
      const found = (rendererRef.current?.listIndicators() ?? []).find((l) => l.uid === uid);
      if (found && typeof params.anchorTime === 'number') {
        useIndicatorStore.getState().setAnchorTime(found.id, params.anchorTime);
      }
    });
    // 双击画线 → 画线设置
    rendererRef.current?.setDrawingSettingsCallback((drawingId) =>
      useDrawingStore.getState().setSettingsFor(drawingId),
    );
    // 图例区右键 → 图例菜单
    rendererRef.current?.setLegendMenuCallback((x, y) => menuCallbacksRef.current.onLegendMenu?.(x, y));
    // 右键画线 → 画线菜单
    rendererRef.current?.setDrawingMenuCallback((drawingId, x, y) =>
      menuCallbacksRef.current.onDrawingMenu?.(drawingId, x, y),
    );
    // 选中画线/指标 → 浮动工具栏锚点（TV 行为；引擎在取消选中时发 null）
    rendererRef.current?.setSelectionPopupCallback((info) => menuCallbacksRef.current.onSelectionPopup?.(info));
    return () => {
      rendererRef.current?.setTradeCallbacks({});
      rendererRef.current?.setChartClickCallback(null);
      rendererRef.current?.setContextMenuCallback(null);
      rendererRef.current?.setStudyActionCallback(null);
      rendererRef.current?.setToolFinishedCallback(null);
      rendererRef.current?.setIndicatorParamsCallback(null);
      rendererRef.current?.setDrawingSettingsCallback(null);
      rendererRef.current?.setLegendMenuCallback(null);
      rendererRef.current?.setDrawingMenuCallback(null);
      // 摘除：引擎签名委托 tracker.subscribe（不接受 null），传空函数等效退订；
      // 订阅随 renderer 实例销毁一并回收，无跨实例残留
      rendererRef.current?.setSelectionPopupCallback(() => {});
      rendererRef.current?.setPaneActionCallback(null);
      rendererRef.current?.setPriceLineDblClickCallback(null);
    };
  }, []);

  // 双击最新价线 → 打开图表设置（回调变更时重绑）
  useEffect(() => {
    rendererRef.current?.setPriceLineDblClickCallback(() => onPriceLineDblClick?.());
    return () => rendererRef.current?.setPriceLineDblClickCallback(null);
  }, [onPriceLineDblClick]);

  // 多图表联动：十字光标时间 + 视口广播。
  // 载荷为时间空间 {fromTime, toTime}（TV 时间轴同步语义）；sourceId 显式防环；
  // 30Hz 限频统一在 syncBus（原每实例 32ms 闭包已上移，此处只做桥接不做策略）。
  useEffect(() => {
    if (!sync) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const sourceId = Symbol('chart-sync');
    const offViewport = syncBus.onViewport((range) => renderer.setViewportTimeRange(range), sourceId);
    const offCrosshair = syncBus.onCrosshair((t) => renderer.setSyncCrosshair(t), sourceId);
    renderer.onCrosshairTime((t) => syncBus.emitCrosshair(t, sourceId));
    renderer.onViewportCommit(() => syncBus.emitViewport(renderer.getViewportTimeRange(), sourceId));
    return () => {
      offViewport();
      offCrosshair();
      renderer.onCrosshairTime(null);
      renderer.onViewportCommit(null);
    };
  }, [sync]);

  // 离开右边缘时显示「回到最新」（TradingView 同位置按钮）
  const atRight = useBackToLatest(rendererRef);

  // 多图表：画布可聚焦（Tab/Shift+Tab 切换单元格，TV 行为），聚焦态描边标示当前单元格
  const layout = useLayoutStore((s) => s.layout);
  const [chartFocused, setChartFocused] = useState(false);
  const multi = layout > 1;

  return (
    <>
      <canvas
        ref={canvasRef}
        data-tv-chart=""
        tabIndex={multi ? 0 : -1}
        onFocus={() => setChartFocused(true)}
        onBlur={() => setChartFocused(false)}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          outline: multi && chartFocused ? '2px solid var(--accent)' : 'none',
          outlineOffset: -2,
        }}
      />
      {!atRight && <BackToLatestButton rendererRef={rendererRef} />}
    </>
  );
}
