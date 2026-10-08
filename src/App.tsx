import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Instrument } from '@/types/instrument';
import { useChartConfigStore } from '@/store/chartConfigStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useLayoutStore, setLayoutBridges } from '@/store/layoutStore';
import { useUiStore } from '@/store/uiStore';
import { useThemeStore } from '@/store/themeStore';
import { selectActiveInstrument, useWatchlistStore } from '@/store/watchlistStore';
import { useQuotePolling, useQuoteStore } from '@/store/quoteStore';
import { useReplayStore } from '@/store/replayStore';
import { useAlertWatcher } from '@/features/alerts/useAlertWatcher';
import { buildCommands } from '@/features/command/commandRegistry';
import { CommandPalette } from '@/features/command/CommandPalette';
import { useChartSeries } from '@/features/market/useChartSeries';
import { ToastProvider } from '@/features/ui/Toast';
import { LayoutGrid } from '@/features/layout/LayoutGrid';
import { TopBar } from '@/features/layout/TopBar';
import { ChartWorkspace } from '@/features/layout/ChartWorkspace';
import { ChartDialogs } from '@/features/layout/ChartDialogs';
import { RightSide } from '@/features/rightbar/RightSide';
import { SymbolSearchDialog } from '@/features/watchlist/SymbolSearchDialog';
import { useTradeStore } from '@/features/trading/tradeStore';
import { useTvShortcuts } from '@/hooks/useTvShortcuts';
import { decimalsFor } from '@/data/format';

/**
 * 应用外壳（P2-C 释放 App.tsx）：只做装配——store 订阅、布局桥接注册、快捷键/命令
 * 接线、回放驱动与各区域组件拼装。图表配置在 chartConfigStore、对话框开关在 uiStore、
 * 布局/单元格/联动在 layoutStore（均自本文件下沉，行为与原 App state 版逐字一致）。
 */
export default function App() {
  const timeframe = useChartConfigStore((s) => s.timeframe);
  const chartType = useChartConfigStore((s) => s.chartType);
  const setTimeframe = useChartConfigStore((s) => s.setTimeframe);
  const setChartType = useChartConfigStore((s) => s.setChartType);
  const toggleLog = useChartConfigStore((s) => s.toggleLog);
  const togglePercent = useChartConfigStore((s) => s.togglePercent);

  const layout = useLayoutStore((s) => s.layout);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const volumeActive = useIndicatorStore((s) => s.active.some((a) => a.id === 'vol'));

  const lists = useWatchlistStore((s) => s.lists);
  const activeListId = useWatchlistStore((s) => s.activeListId);
  const activeInstrument = useWatchlistStore(selectActiveInstrument);
  const replayIndex = useReplayStore((s) => s.index);

  const series = useChartSeries(activeInstrument, timeframe);
  const bars = series.bars;

  // 报价轮询覆盖「当前列表全部品种 + 图表品种」，图表品种可能不在列表里
  const polled = useMemo(() => {
    const map = new Map<string, Instrument>();
    for (const l of lists) {
      if (l.id !== activeListId) continue;
      for (const i of l.items) map.set(i.id, i);
    }
    if (activeInstrument) map.set(activeInstrument.id, activeInstrument);
    return [...map.values()];
  }, [lists, activeListId, activeInstrument]);
  useQuotePolling(polled);

  const activeQuote = useQuoteStore((s) => (activeInstrument ? s.quotes[activeInstrument.id] : undefined));
  const lastPrice = activeQuote?.price ?? (bars.length > 0 ? bars[bars.length - 1].close : 0);
  const decimals = decimalsFor(lastPrice, activeInstrument?.decimals ?? 2);

  // 价格警报（P1-C）：报价/K 线更新即采样检查——价格源 + 已挂指标 plot 值源，
  // 条件 greater/less/crossUp/crossDown、once/every 频率、过期、暂停均在 store 纯逻辑处理
  useAlertWatcher(activeInstrument?.symbol, bars, lastPrice);

  const [renderer, setRenderer] = useState<ChartRenderer | null>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  // 主图画线暂存：renderer 未就绪（刷新恢复早于 Chart 挂载）或重建（StrictMode 双挂载 /
  // 布局档位切换回单图）时由 onRendererReady 补放
  const pendingDrawingsRef = useRef<string | null>(null);
  const wasReplaying = useRef(false);
  const lastFedBarTime = useRef(0);
  const prevReplayIndex = useRef<number | null>(null);

  // B8：向 layoutStore 注册桥接。周期/图表类型已下沉 chartConfigStore——getChartState 同步
  // 读 store（zustand setState 即时生效），原 App state + useLayoutEffect 补 ref 的 <1 帧
  // 竞态窗口（QA advisory #7：周期切换同帧 Ctrl+S 存进上一周期）结构性消除；
  // 画线暂存补放逻辑保持原样。
  useEffect(() => {
    setLayoutBridges({
      getChartState: () => {
        const c = useChartConfigStore.getState();
        return { timeframe: c.timeframe, chartType: c.chartType };
      },
      setChartState: (tf, ct) => {
        useChartConfigStore.getState().setTimeframe(tf);
        useChartConfigStore.getState().setChartType(ct);
      },
      getDrawings: () => rendererRef.current?.exportDrawings() ?? null,
      applyDrawings: (raw) => {
        // 始终记录最近一次下发的画线：renderer 未就绪或重建时由 onRendererReady 补放
        pendingDrawingsRef.current = raw;
        rendererRef.current?.importDrawings(raw);
      },
    });
    return () => setLayoutBridges(null);
  }, []);

  // B8：刷新后自动恢复上次激活布局（无存档时 consumePendingRestore 返回 null，走默认）
  useEffect(() => {
    const id = useLayoutStore.getState().consumePendingRestore();
    if (id) useLayoutStore.getState().loadLayout(id);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  // 截图直接读 renderer state（handleRendererReady 内与 rendererRef 同步赋值）：
  // 经 ref 读取会被 react-hooks/refs 判定为「渲染期可能读 ref」而告警；
  // 截图只由命令面板/快捷键/顶栏点击等用户事件触发，state 读数与 ref 逐字等价。
  // useCallback 包裹：传给 buildCommands 的普通闭包会被编译器保守视为「可能在渲染期
  // 执行」，其内的 Date.now() 随之触发 purity 告警；memo 化回调即表明延迟执行语义。
  const handleScreenshot = useCallback(() => {
    if (!renderer) return;
    const a = document.createElement('a');
    a.href = renderer.screenshot();
    a.download = `tradingpa-${activeInstrument?.symbol ?? 'chart'}-${Date.now()}.png`;
    a.click();
  }, [renderer, activeInstrument]);

  // P1-E：命令注册表——周期/类型/布局档位从常量表派生，store 类动作直接调 store
  const commands = buildCommands({
    timeframe,
    chartType,
    volumeActive,
    setTimeframe,
    setChartType,
    toggleVolume: () => {
      const st = useIndicatorStore.getState();
      if (st.active.some((a) => a.id === 'vol')) st.remove('vol');
      else st.add('vol');
    },
    openIndicators: () => setPanelOpen(true),
    toggleLog,
    togglePercent,
    toggleTheme: () => useThemeStore.getState().toggle(),
    toggleFullscreen,
    screenshot: handleScreenshot,
    openGoToDate: () => useUiStore.getState().setGoToDateOpen(true),
    openShortcuts: () => useUiStore.getState().setShortcutsOpen(true),
    openChartSettings: () => useUiStore.getState().setChartSettingsOpen(true),
    openReport: () => useUiStore.getState().setReportOpen(true),
    startReplay: () => {
      if (bars.length >= 10) useReplayStore.getState().enterSelect();
    },
    reload: series.reload,
    setLayout: (l) => useLayoutStore.getState().setLayout(l),
  });

  // B1：TV 默认快捷键统一注册（原 App.tsx 与 Chart.tsx 的图表级按键收敛于此）
  const { applyInterval } = useTvShortcuts({
    rendererRef,
    onAddToWatchlist: () => {
      if (activeInstrument) useWatchlistStore.getState().add(activeInstrument);
    },
    onToggleHideDrawings: () => useChartConfigStore.getState().toggleHideDrawings(),
    onToggleLog: toggleLog,
    onTogglePercent: togglePercent,
    onScreenshot: handleScreenshot,
    onOpenShortcuts: () => useUiStore.getState().setShortcutsOpen(true),
    onOpenIndicators: () => setPanelOpen(true),
    onOpenGoToDate: () => useUiStore.getState().setGoToDateOpen(true),
    onApplyInterval: (t) => setTimeframe(t),
    onToggleFullscreen: toggleFullscreen,
    onOpenCommandPalette: () => useUiStore.getState().setCommandOpen(true),
  });

  // 回放联动：新会话重置引擎；每根回放 K 线驱动挂单触发与盈亏
  useEffect(() => {
    if (replayIndex !== null && prevReplayIndex.current === null) {
      lastFedBarTime.current = 0;
      useTradeStore.getState().reset();
    }
    prevReplayIndex.current = replayIndex;
    if (replayIndex === null) {
      if (wasReplaying.current) {
        wasReplaying.current = false;
        if (useTradeStore.getState().engine.trades.length > 0) useUiStore.getState().setReportOpen(true);
      }
      return;
    }
    wasReplaying.current = true;
    const bar = bars[replayIndex];
    if (!bar || bar.time === lastFedBarTime.current) return;
    lastFedBarTime.current = bar.time;
    useTradeStore.getState().onBar(bar);
  }, [replayIndex, bars]);

  /** 主图 renderer 就绪：登记 + 补放刷新恢复暂存的画线后清空 */
  const handleRendererReady = (r: ChartRenderer | null) => {
    rendererRef.current = r;
    setRenderer(r);
    if (r && pendingDrawingsRef.current) {
      r.importDrawings(pendingDrawingsRef.current);
      pendingDrawingsRef.current = null;
    }
  };

  const commandOpen = useUiStore((s) => s.commandOpen);
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={100}>
      <ToastProvider>
        <div
          style={{ width: '100vw', height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}
        >
          <TopBar rendererRef={rendererRef} series={series} barsCount={bars.length} onScreenshot={handleScreenshot} />
          {layout === 1 ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <ChartWorkspace
                bars={bars}
                series={series}
                instrument={activeInstrument}
                decimals={decimals}
                renderer={renderer}
                rendererRef={rendererRef}
                onRendererReady={handleRendererReady}
              />
              <RightSide renderer={renderer} alertSymbol={activeInstrument?.symbol ?? ''} alertPrice={lastPrice} />
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <LayoutGrid />
            </div>
          )}
          <SymbolSearchDialog />
          <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} commands={commands} />
          <ChartDialogs bars={bars} renderer={renderer} instrument={activeInstrument} applyInterval={applyInterval} />
        </div>
      </ToastProvider>
    </Tooltip.Provider>
  );
}
