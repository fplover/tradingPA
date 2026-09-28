import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Camera, CandlestickChart, ChevronDown, FileCode2, LoaderCircle, Maximize2, Play, Redo2, RefreshCw, Save, Search, Settings2, FolderOpen, Moon, Sun, Undo2 } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Chart } from '@/components/Chart';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Instrument } from '@/types/instrument';
import { MARKETS } from '@/types/instrument';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useLayoutStore, setLayoutBridges } from '@/store/layoutStore';
import { LayoutSaveMenu } from '@/features/layout/LayoutSaveMenu';
import { useThemeStore } from '@/store/themeStore';
import { selectActiveInstrument, useWatchlistStore } from '@/store/watchlistStore';
import { useQuotePolling, useQuoteStore } from '@/store/quoteStore';
import { useReplayStore } from '@/store/replayStore';
import { useAlertStore } from '@/store/alertStore';
import { decimalsFor } from '@/data/format';
import { useChartSeries } from '@/features/market/useChartSeries';
import { useRightDockStore } from '@/features/rightbar/rightPanelStore';
import { useDrawingStore } from '@/store/drawingStore';
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { IndicatorSettingsDialog } from '@/features/indicators/IndicatorSettingsDialog';
import { ActiveIndicatorChips } from '@/features/indicators/ActiveIndicatorChips';
import { DrawingToolbar } from '@/features/drawings/DrawingToolbar';
import { DrawingSettingsDialog } from '@/features/drawings/DrawingSettingsDialog';
import { DrawingContextMenu } from '@/features/drawings/DrawingContextMenu';
import { LayoutGrid, LayoutMenu } from '@/features/layout/LayoutGrid';
import { ReplayBar } from '@/features/replay/ReplayBar';
import { RightSide } from '@/features/rightbar/RightSide';
import { StatusBar } from '@/features/market/StatusBar';
import { ChartContextMenu, type ChartMenuState } from '@/features/market/ChartContextMenu';
import { ChartSettingsDialog } from '@/features/settings/ChartSettingsDialog';
import { ShortcutsDialog } from '@/features/settings/ShortcutsDialog';
import { LegendContextMenu } from '@/features/indicators/LegendContextMenu';
import { PineEditorPanel } from '@/features/pine/PineEditorPanel';
import { usePineStore } from '@/store/pineStore';
import type { LegendOptions } from '@/engine/renderer/drawCrosshair';
import { DEFAULT_LEGEND_OPTIONS } from '@/engine/renderer/drawCrosshair';
import { SymbolSearchDialog } from '@/features/watchlist/SymbolSearchDialog';
import { useSymbolSearchStore } from '@/features/watchlist/searchStore';
import { IconButton } from '@/ui/primitives';
import { ToolbarSelect, type ToolbarOption } from '@/ui/ToolbarSelect';
import { TradePanel } from '@/features/trading/TradePanel';
import { ChartOrderMenu } from '@/features/trading/ChartOrderMenu';
import { SummaryReport } from '@/features/trading/SummaryReport';
import { useTradeStore } from '@/features/trading/tradeStore';
import { fontSize, space } from '@/ui/tokens';

function tfGroup(id: TimeframeId): string {
  if (id.endsWith('s')) return '秒';
  if (id.endsWith('m')) return '分钟';
  if (id.endsWith('H')) return '小时';
  return '日及以上';
}

const TF_OPTIONS: ToolbarOption[] = TIMEFRAMES.map((t) => ({ value: t.id, label: t.label, group: tfGroup(t.id) }));
const CT_OPTIONS: ToolbarOption[] = CHART_TYPES.map((c) => ({ value: c.id, label: c.label, group: c.timeBased ? '常规' : '特殊' }));

function ThemeButton() {
  const name = useThemeStore((s) => s.name);
  const toggle = useThemeStore((s) => s.toggle);
  return (
    <IconButton onClick={toggle} title={name === 'dark' ? '切换到浅色' : '切换到深色'}>
      {name === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </IconButton>
  );
}

/** 顶栏品种按钮：点击打开符号搜索，与 TradingView 图表左上角品种名一致 */
function SymbolButton({ instrument }: { instrument: Instrument | null }) {
  const openSearch = useSymbolSearchStore((s) => s.openSearch);
  const quote = useQuoteStore((s) => (instrument ? s.quotes[instrument.id] : undefined));
  if (!instrument) {
    return (
      <button className="tv-icon-btn" style={symbolBtnStyle} onClick={() => openSearch('switch')} title="搜索品种">
        选择品种
      </button>
    );
  }
  const dir = (quote?.changePct ?? 0) > 0 ? 'var(--up)' : (quote?.changePct ?? 0) < 0 ? 'var(--down)' : 'var(--text-faint)';
  return (
    <button
      className="tv-icon-btn"
      style={{ ...symbolBtnStyle, height: 'auto', padding: '2px 8px' }}
      onClick={() => openSearch('switch')}
      title="搜索品种（/ 或 Ctrl+K）"
      aria-label={`当前品种 ${instrument.symbol} ${instrument.name}，点击搜索其他品种`}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: fontSize.xl, fontWeight: 700, color: 'var(--text)' }}>{instrument.symbol}</span>
        <span style={{ fontSize: fontSize.sm, color: 'var(--text-faint)' }}>
          {instrument.name} · {MARKETS[instrument.market].label}
        </span>
        {quote && (
          <span style={{ fontSize: fontSize.md, color: dir, fontWeight: 600 }}>
            {quote.price.toFixed(decimalsFor(quote.price, instrument.decimals))}
          </span>
        )}
      </span>
      <ChevronDown size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
    </button>
  );
}

export default function App() {
  const [timeframe, setTimeframe] = useState<TimeframeId>('1m');
  const [chartType, setChartType] = useState<ChartTypeId>('candles');
  const [logScale, setLogScale] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [percent, setPercent] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [hideDrawings, setHideDrawings] = useState(false);
  const [renderer, setRenderer] = useState<ChartRenderer | null>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  // B8 布局存取：周期/图表类型经 ref 供 store 桥接读取；主图画线在 renderer 未就绪时暂存
  const timeframeRef = useRef(timeframe);
  const chartTypeRef = useRef(chartType);
  const pendingDrawingsRef = useRef<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [chartMenu, setChartMenu] = useState<ChartMenuState | null>(null);
  const [legendMenu, setLegendMenu] = useState<{ x: number; y: number } | null>(null);
  const [drawingMenu, setDrawingMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const pineOpen = usePineStore((s) => s.panelOpen);
  const setPineOpen = usePineStore((s) => s.setPanelOpen);
  const [gridVisible, setGridVisible] = useState(true);
  const [hideStudies, setHideStudies] = useState(false);
  const [legendOpts, setLegendOpts] = useState<LegendOptions>({ ...DEFAULT_LEGEND_OPTIONS });
  const wasReplaying = useRef(false);
  const lastFedBarTime = useRef(0);
  const prevReplayIndex = useRef<number | null>(null);

  const layout = useLayoutStore((s) => s.layout);
  const panelOpen = useIndicatorStore((s) => s.panelOpen);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const settingsFor = useIndicatorStore((s) => s.settingsFor);
  const saveTemplate = useIndicatorStore((s) => s.saveTemplate);
  const loadTemplate = useIndicatorStore((s) => s.loadTemplate);

  const lists = useWatchlistStore((s) => s.lists);
  const activeListId = useWatchlistStore((s) => s.activeListId);
  const activeInstrument = useWatchlistStore(selectActiveInstrument);
  const replayActive = useReplayStore((s) => s.index !== null || s.selectMode);
  const replayIndex = useReplayStore((s) => s.index);

  const checkAlerts = useAlertStore((s) => s.check);

  const series = useChartSeries(activeInstrument, timeframe);
  const bars = series.bars;
  const tf = getTimeframe(timeframe);

  // 报价轮询覆盖「当前列表全部品种 + 图表品种」，图表品种可能不在列表里
  const polled = useMemo(() => {
    const map = new Map<string, Instrument>();
    for (const l of lists) {
      if (l.id !== activeListId) continue;
      for (const i of l.items) map.set(i.id, i);
    }
    if (activeInstrument) map.set(activeInstrument.id, activeInstrument);
    return [...map.values()];
  }, [lists, activeListId, activeInstrument?.id]);
  useQuotePolling(polled);

  const activeQuote = useQuoteStore((s) => (activeInstrument ? s.quotes[activeInstrument.id] : undefined));
  const lastPrice = activeQuote?.price ?? (bars.length > 0 ? bars[bars.length - 1].close : 0);
  const decimals = decimalsFor(lastPrice, activeInstrument?.decimals ?? 2);

  // 价格警报：报价更新即检查，覆盖所有市场（不再依赖逐根 K 线推送）
  useEffect(() => {
    if (!activeInstrument || !activeQuote) return;
    checkAlerts(activeInstrument.symbol, activeQuote.price);
  }, [activeInstrument, activeQuote, checkAlerts]);

  // 底部状态栏 / 左工具栏开关 → 渲染器
  useEffect(() => {
    renderer?.setAutoScale(autoScale);
  }, [renderer, autoScale]);
  useEffect(() => {
    renderer?.setPercentMode(percent);
  }, [renderer, percent]);
  useEffect(() => {
    renderer?.setDrawingsHidden(hideDrawings);
  }, [renderer, hideDrawings]);
  useEffect(() => {
    renderer?.setDrawingsLocked(drawingsLocked);
  }, [renderer, drawingsLocked]);
  useEffect(() => {
    renderer?.setGridVisible(gridVisible);
  }, [renderer, gridVisible]);
  useEffect(() => {
    renderer?.setHideStudies(hideStudies);
  }, [renderer, hideStudies]);
  useEffect(() => {
    renderer?.setLegendOptions(legendOpts);
  }, [renderer, legendOpts]);

  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);
  useEffect(() => {
    chartTypeRef.current = chartType;
  }, [chartType]);

  // B8：向 layoutStore 注册桥接（周期/类型是 App state，画线在主图 renderer 里，store 不直接持有）
  useEffect(() => {
    setLayoutBridges({
      getChartState: () => ({ timeframe: timeframeRef.current, chartType: chartTypeRef.current }),
      setChartState: (tf, ct) => {
        setTimeframe(tf);
        setChartType(ct);
      },
      getDrawings: () => rendererRef.current?.exportDrawings() ?? null,
      applyDrawings: (raw) => {
        // 始终记录最近一次下发的画线：renderer 未就绪（刷新恢复早于 Chart 挂载）或
        // renderer 重建（StrictMode 双挂载 / 布局档位切换回单图）时由 onRendererReady 补放
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

  // 快捷键：/ 或 Ctrl+K 打开品种搜索（输入框内不劫持）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useSymbolSearchStore.getState().openSearch('switch');
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        useSymbolSearchStore.getState().openSearch('switch');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleScreenshot = () => {
    const r = rendererRef.current;
    if (!r) return;
    const a = document.createElement('a');
    a.href = r.screenshot();
    a.download = `tradingpa-${activeInstrument?.symbol ?? 'chart'}-${Date.now()}.png`;
    a.click();
  };

  // TV 高频快捷键（图表级，输入框/菜单/对话框内不劫持）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (el && el.closest('[role="menu"], [role="dialog"], [role="listbox"]')) return;
      if (!e.altKey || e.ctrlKey || e.metaKey) {
        // Ctrl+Alt+H 隐藏所有图形 / ? 打开快捷键面板（无 Alt）
        if (e.ctrlKey && e.altKey && !e.metaKey && e.key.toLowerCase() === 'h') {
          e.preventDefault();
          setHideDrawings((v) => !v);
        } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
          e.preventDefault();
          setShortcutsOpen(true);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        useRightDockStore.getState().open('alerts');
      } else if (key === 'w') {
        e.preventDefault();
        if (activeInstrument) useWatchlistStore.getState().add(activeInstrument);
      } else if (key === 'n') {
        e.preventDefault();
        useDrawingStore.getState().setActiveTool('text');
      } else if (key === 'r') {
        e.preventDefault();
        rendererRef.current?.resetView();
      } else if (key === 'l') {
        e.preventDefault();
        setLogScale((v) => !v);
      } else if (key === 'p') {
        e.preventDefault();
        setPercent((v) => !v);
      } else if (key === 's') {
        e.preventDefault();
        handleScreenshot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeInstrument, handleScreenshot]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

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
        if (useTradeStore.getState().engine.trades.length > 0) setReportOpen(true);
      }
      return;
    }
    wasReplaying.current = true;
    const bar = bars[replayIndex];
    if (!bar || bar.time === lastFedBarTime.current) return;
    lastFedBarTime.current = bar.time;
    useTradeStore.getState().onBar(bar);
  }, [replayIndex, bars]);

  /** 选择日期：二分查找第一个 >= 目标时间的 bar */
  const handleSeekToTime = (time: number) => {
    let lo = 0;
    let hi = bars.length - 1;
    let ans = bars.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time >= time) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    useReplayStore.getState().setIndex(Math.max(0, ans));
  };

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={100}>
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={topBarStyle}>
        <strong style={{ color: 'var(--text)', fontSize: 13, marginRight: 4 }}>TradingPA</strong>
        <SymbolButton instrument={activeInstrument} />
        {layout === 1 && (
          <>
            <ToolbarSelect
              ariaLabel="周期"
              value={timeframe}
              options={TF_OPTIONS}
              minWidth={104}
              onChange={(v) => setTimeframe(v as TimeframeId)}
            />
            <ToolbarSelect
              ariaLabel="图表类型"
              value={chartType}
              options={CT_OPTIONS}
              icon={<CandlestickChart size={14} />}
              minWidth={120}
              onChange={(v) => setChartType(v as ChartTypeId)}
            />
            <IconButton
              active={replayActive}
              onClick={() => {
                if (bars.length < 10) return; // 数据未就绪不进回放
                useReplayStore.getState().enterSelect(); // 默认进入选择K线
              }}
              title="回放：点击后在图表上选择 K 线作为起点"
            >
              <Play size={16} />
            </IconButton>
          </>
        )}
        <IconButton active={panelOpen} onClick={() => setPanelOpen(!panelOpen)} title="指标">
          <BarChart3 size={16} />
        </IconButton>
        <IconButton onClick={saveTemplate} title="保存指标模板">
          <Save size={16} />
        </IconButton>
        <IconButton onClick={loadTemplate} title="加载指标模板">
          <FolderOpen size={16} />
        </IconButton>
        <ActiveIndicatorChips />
        <span style={{ flex: 1 }} />
        {layout === 1 && (
          <>
            <IconButton onClick={() => rendererRef.current?.undoDrawing()} title="复原">
              <Undo2 size={16} />
            </IconButton>
            <IconButton onClick={() => rendererRef.current?.redoDrawing()} title="重做">
              <Redo2 size={16} />
            </IconButton>
          </>
        )}
        <LayoutSaveMenu />
        <LayoutMenu />
        <IconButton onClick={() => setChartSettingsOpen(true)} title="图表设置">
          <Settings2 size={16} />
        </IconButton>
        <IconButton active={pineOpen} onClick={() => setPineOpen(!pineOpen)} title="Pine 编辑器">
          <FileCode2 size={16} />
        </IconButton>
        <IconButton onClick={() => useSymbolSearchStore.getState().openSearch('switch')} title="快速搜索">
          <Search size={16} />
        </IconButton>
        <IconButton onClick={toggleFullscreen} title="全屏模式">
          <Maximize2 size={16} />
        </IconButton>
        <IconButton onClick={handleScreenshot} title="生成快照">
          <Camera size={16} />
        </IconButton>
        {layout === 1 && (
          <IconButton onClick={series.reload} title={series.mode === 'mock' ? '重新连接实时数据' : '重新加载历史数据'}>
            <RefreshCw size={16} />
          </IconButton>
        )}
        <ThemeButton />
      </div>

      {layout === 1 ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <DrawingToolbar
                locked={drawingsLocked}
                onToggleLock={() => setDrawingsLocked((v) => !v)}
                hideDrawings={hideDrawings}
                onToggleHide={() => setHideDrawings((v) => !v)}
                onRemoveAll={(scope) => {
                  if (scope === 'drawings' || scope === 'all') rendererRef.current?.clearDrawings();
                  if (scope === 'studies' || scope === 'all') useIndicatorStore.getState().replaceAll([]);
                }}
              />
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <Chart
                  bars={bars}
                  symbol={activeInstrument?.symbol ?? '—'}
                  interval={tf.label}
                  decimals={decimals}
                  timeframeId={timeframe}
                  exchange={activeInstrument?.exchange}
                  liveTickMs={series.mode === 'mock' ? 800 : undefined}
                  chartType={chartType}
                  logScale={logScale}
                  onRendererReady={(r) => {
                    rendererRef.current = r;
                    setRenderer(r);
                    // 布局还原的画线在 renderer 就绪前已暂存，这里补放后清空
                    if (r && pendingDrawingsRef.current) {
                      r.importDrawings(pendingDrawingsRef.current);
                      pendingDrawingsRef.current = null;
                    }
                  }}
                  onNeedsMoreHistory={series.loadMore}
                  onChartContextMenu={(price, _time, x, y) => setChartMenu({ price, x, y })}
                  onLegendMenu={(x, y) => setLegendMenu({ x, y })}
                  onDrawingMenu={(id, x, y) => setDrawingMenu({ id, x, y })}
                />
                {panelOpen && <IndicatorPanel />}
                {settingsFor && <IndicatorSettingsDialog id={settingsFor} />}
                <DrawingSettingsDialog renderer={renderer} />

                {/* 该市场没有历史数据源时，明确说明原因而不是留一块空白画布 */}
                {bars.length === 0 && series.status === 'error' && (
                  <div style={noDataStyle}>
                    <div style={{ fontSize: fontSize.lg, color: 'var(--text-dim)', marginBottom: space.xs }}>无法载入 K 线</div>
                    <div style={{ fontSize: fontSize.md, color: 'var(--text-faint)', lineHeight: 1.7 }}>{series.statusDetail}</div>
                  </div>
                )}

                {/* 首批数据未就绪：居中加载指示，避免画布空白无反馈 */}
                {bars.length === 0 && (series.status === 'idle' || series.status === 'loading' || series.status === 'reconnecting') && (
                  <div style={noDataStyle}>
                    <LoaderCircle size={24} className="spin" style={{ color: 'var(--text-faint)', marginBottom: space.sm }} />
                    <div style={{ fontSize: fontSize.md, color: 'var(--text-faint)' }}>
                      {series.status === 'reconnecting' ? '正在重新连接数据…' : series.statusDetail || '正在载入 K 线…'}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {layout === 1 && pineOpen && <PineEditorPanel />}
            <StatusBar
              barsCount={bars.length}
              intervalLabel={tf.label}
              statusText={series.mode === 'mock' ? '模拟数据' : series.statusDetail || series.status}
              percent={percent}
              onTogglePercent={() => setPercent((v) => !v)}
              logScale={logScale}
              onToggleLog={() => setLogScale((v) => !v)}
              autoScale={autoScale}
              onToggleAuto={() => setAutoScale((v) => !v)}
              hideStudies={hideStudies}
              onToggleHideStudies={() => setHideStudies((v) => !v)}
              onOpenSettings={() => setChartSettingsOpen(true)}
              onShowRange={(fromTime) => rendererRef.current?.showRange(fromTime)}
            />
            {replayActive && (
              <ReplayBar
                barCount={bars.length}
                intervalLabel={tf.label}
                price={bars[replayIndex ?? 0]?.close ?? 0}
                time={bars[replayIndex ?? 0]?.time ?? Date.now()}
                onSeekToTime={handleSeekToTime}
              />
            )}
            {replayIndex !== null && (
              <TradePanel
                price={bars[replayIndex]?.close ?? 0}
                time={bars[replayIndex]?.time ?? Date.now()}
                onReport={() => setReportOpen(true)}
              />
            )}
            {replayActive && <ChartOrderMenu decimals={decimals} />}
            {reportOpen && <SummaryReport onClose={() => setReportOpen(false)} />}
          </div>

          <RightSide renderer={renderer} alertSymbol={activeInstrument?.symbol ?? ''} alertPrice={lastPrice} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <LayoutGrid />
        </div>
      )}

      <SymbolSearchDialog />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ChartSettingsDialog
        open={chartSettingsOpen}
        onClose={() => setChartSettingsOpen(false)}
        logScale={logScale}
        percent={percent}
        autoScale={autoScale}
        grid={gridVisible}
        legend={legendOpts}
        onLog={setLogScale}
        onPercent={setPercent}
        onAuto={setAutoScale}
        onGrid={setGridVisible}
        onLegend={(patch) => setLegendOpts((v) => ({ ...v, ...patch }))}
      />
      <ChartContextMenu
        state={chartMenu}
        instrument={activeInstrument}
        renderer={renderer}
        onOpenSettings={() => setChartSettingsOpen(true)}
        onClose={() => setChartMenu(null)}
      />
      <LegendContextMenu
        state={legendMenu}
        legend={legendOpts}
        onLegend={(patch) => setLegendOpts((v) => ({ ...v, ...patch }))}
        onOpenSettings={() => setChartSettingsOpen(true)}
        onClose={() => setLegendMenu(null)}
      />
      <DrawingContextMenu
        state={drawingMenu}
        renderer={renderer}
        onClose={() => setDrawingMenu(null)}
      />
    </div>
    </Tooltip.Provider>
  );
}

const symbolBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 26,
  padding: '0 8px',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
};

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 38,
  padding: '0 8px',
  background: 'var(--panel)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
  overflowX: 'auto',
};

const noDataStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: space.xl,
  pointerEvents: 'none',
};
