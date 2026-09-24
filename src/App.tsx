import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Camera, ChevronDown, Play, RefreshCw, Save, FolderOpen, Moon, Sun } from 'lucide-react';
import { Chart } from '@/components/Chart';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Instrument } from '@/types/instrument';
import { MARKETS } from '@/types/instrument';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';
import type { FeedStatus } from '@/data/feed/types';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useThemeStore } from '@/store/themeStore';
import { selectActiveInstrument, useWatchlistStore } from '@/store/watchlistStore';
import { useQuotePolling, useQuoteStore } from '@/store/quoteStore';
import { useReplayStore } from '@/store/replayStore';
import { useAlertStore } from '@/store/alertStore';
import { decimalsFor } from '@/data/format';
import { useChartSeries } from '@/features/market/useChartSeries';
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { IndicatorSettingsDialog } from '@/features/indicators/IndicatorSettingsDialog';
import { ActiveIndicatorChips } from '@/features/indicators/ActiveIndicatorChips';
import { DrawingToolbar } from '@/features/drawings/DrawingToolbar';
import { LayoutGrid, LayoutButtons } from '@/features/layout/LayoutGrid';
import { ReplayBar } from '@/features/replay/ReplayBar';
import { RightSide } from '@/features/rightbar/RightSide';
import { SymbolSearchDialog } from '@/features/watchlist/SymbolSearchDialog';
import { useSymbolSearchStore } from '@/features/watchlist/searchStore';
import { IconButton } from '@/ui/primitives';
import { TradePanel } from '@/features/trading/TradePanel';
import { ChartOrderMenu } from '@/features/trading/ChartOrderMenu';
import { SummaryReport } from '@/features/trading/SummaryReport';
import { useTradeStore } from '@/features/trading/tradeStore';
import { fontSize, space } from '@/ui/tokens';

const selectStyle: React.CSSProperties = {
  background: 'var(--panel)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
};

const STATUS_COLOR: Record<FeedStatus, string> = {
  idle: 'var(--text-faint)',
  loading: '#ff9800',
  live: '#26a69a',
  reconnecting: '#ff9800',
  error: '#ef5350',
};

function ThemeButton() {
  const name = useThemeStore((s) => s.name);
  const toggle = useThemeStore((s) => s.toggle);
  return (
    <IconButton onClick={toggle} title={name === 'dark' ? '切换到浅色' : '切换到深色'}>
      {name === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
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
      <ChevronDown size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
    </button>
  );
}

export default function App() {
  const [timeframe, setTimeframe] = useState<TimeframeId>('1m');
  const [chartType, setChartType] = useState<ChartTypeId>('candles');
  const [logScale, setLogScale] = useState(false);
  const [renderer, setRenderer] = useState<ChartRenderer | null>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const wasReplaying = useRef(false);
  const lastFedBarTime = useRef(0);
  const prevReplayIndex = useRef<number | null>(null);

  const layout = useLayoutStore((s) => s.layout);
  const panelOpen = useIndicatorStore((s) => s.panelOpen);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const settingsFor = useIndicatorStore((s) => s.settingsFor);
  const saveTemplate = useIndicatorStore((s) => s.saveTemplate);
  const loadTemplate = useIndicatorStore((s) => s.loadTemplate);
  // 成交量以 VOL 指标挂在副图，复选框即增删该指标
  const volActive = useIndicatorStore((s) => s.active.some((a) => a.id === 'vol'));
  const indicatorAdd = useIndicatorStore((s) => s.add);
  const indicatorRemove = useIndicatorStore((s) => s.remove);

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
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: 'var(--panel)',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: 'var(--text)', fontSize: 13, marginRight: 4 }}>TradingPA</strong>
        <SymbolButton instrument={activeInstrument} />
        <LayoutButtons />
        {layout === 1 && (
          <>
            <select style={selectStyle} value={timeframe} onChange={(e) => setTimeframe(e.target.value as TimeframeId)}>
              {TIMEFRAMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select style={selectStyle} value={chartType} onChange={(e) => setChartType(e.target.value as ChartTypeId)}>
              {CHART_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <IconButton
              active={replayActive}
              onClick={() => {
                if (bars.length < 10) return; // 数据未就绪不进回放
                useReplayStore.getState().enterSelect(); // 默认进入选择K线
              }}
              title="回放：点击后在图表上选择 K 线作为起点"
            >
              <Play size={15} />
            </IconButton>
          </>
        )}
        <IconButton active={panelOpen} onClick={() => setPanelOpen(!panelOpen)} title="指标">
          <BarChart3 size={15} />
        </IconButton>
        <IconButton onClick={saveTemplate} title="保存指标模板">
          <Save size={15} />
        </IconButton>
        <IconButton onClick={loadTemplate} title="加载指标模板">
          <FolderOpen size={15} />
        </IconButton>
        <IconButton onClick={handleScreenshot} title="截图导出 PNG">
          <Camera size={15} />
        </IconButton>
        <ThemeButton />
        <label style={{ color: 'var(--text-dim)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
          对数
        </label>
        <label style={{ color: 'var(--text-dim)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={volActive} onChange={(e) => (e.target.checked ? indicatorAdd('vol') : indicatorRemove('vol'))} />
          成交量
        </label>
        {layout === 1 && (
          <IconButton onClick={series.reload} title={series.mode === 'mock' ? '重新连接实时数据' : '重新加载历史数据'}>
            <RefreshCw size={15} />
          </IconButton>
        )}
        <ActiveIndicatorChips />
        <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {layout === 1 && (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[series.status], display: 'inline-block' }} />
              {series.mode === 'mock' ? '模拟数据' : series.statusDetail || series.status}
            </>
          )}
          <span style={{ marginLeft: 8 }}>
            {bars.length.toLocaleString()} 根 · {tf.label}
          </span>
        </span>
      </div>

      {layout === 1 ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <Chart
                bars={bars}
                symbol={activeInstrument?.symbol ?? '—'}
                interval={tf.label}
                decimals={decimals}
                liveTickMs={series.mode === 'mock' ? 800 : undefined}
                chartType={chartType}
                logScale={logScale}
                onRendererReady={(r) => {
                  rendererRef.current = r;
                  setRenderer(r);
                }}
                onNeedsMoreHistory={series.loadMore}
              />
              <DrawingToolbar />
              {panelOpen && <IndicatorPanel />}
              {settingsFor && <IndicatorSettingsDialog id={settingsFor} />}

              {/* 该市场没有历史数据源时，明确说明原因而不是留一块空白画布 */}
              {bars.length === 0 && series.status === 'error' && (
                <div style={noDataStyle}>
                  <div style={{ fontSize: fontSize.lg, color: 'var(--text-dim)', marginBottom: space.xs }}>无法载入 K 线</div>
                  <div style={{ fontSize: fontSize.md, color: 'var(--text-faint)', lineHeight: 1.7 }}>{series.statusDetail}</div>
                </div>
              )}
            </div>
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
    </div>
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
