import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Star,
  BarChart3,
  Save,
  FolderOpen,
  Layers,
  Bell,
  Camera,
  Play,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import { Chart } from '@/components/Chart';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { generateMockBars } from '@/data/mockData';
import { aggregateBars } from '@/data/aggregate';
import { LiveDataFeed, toBinanceInterval } from '@/data/feed/LiveDataFeed';
import { fetchKlines } from '@/data/feed/binance';
import type { FeedStatus } from '@/data/feed/types';
import { klineCache } from '@/data/cache/klineCache';
import {
  CHART_TYPES,
  TIMEFRAMES,
  getTimeframe,
  type Bar,
  type ChartTypeId,
  type TimeframeId,
} from '@/types/market';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useDrawingStore } from '@/store/drawingStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useThemeStore } from '@/store/themeStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useAlertStore } from '@/store/alertStore';
import { useReplayStore } from '@/store/replayStore';
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { IndicatorSettingsDialog } from '@/features/indicators/IndicatorSettingsDialog';
import { ActiveIndicatorChips } from '@/features/indicators/ActiveIndicatorChips';
import { DrawingToolbar } from '@/features/drawings/DrawingToolbar';
import { ObjectTree } from '@/features/drawings/ObjectTree';
import { LayoutGrid, LayoutButtons } from '@/features/layout/LayoutGrid';
import { ReplayBar } from '@/features/replay/ReplayBar';
import { IconButton } from '@/ui/primitives';
import { TradePanel } from '@/features/trading/TradePanel';
import { SummaryReport } from '@/features/trading/SummaryReport';
import { useTradeStore } from '@/features/trading/tradeStore';
import { Watchlist } from '@/features/watchlist/Watchlist';
import { AlertPanel } from '@/features/alerts/AlertPanel';

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

export default function App() {
  const [timeframe, setTimeframe] = useState<TimeframeId>('1m');
  const [chartType, setChartType] = useState<ChartTypeId>('candles');
  const [logScale, setLogScale] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [renderer, setRenderer] = useState<ChartRenderer | null>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const replayActive = useReplayStore((s) => s.index !== null || s.selectMode);
  const replayIndex = useReplayStore((s) => s.index);
  const [reportOpen, setReportOpen] = useState(false);
  const wasReplaying = useRef(false);
  const lastFedBarTime = useRef(0);
  const prevReplayIndex = useRef<number | null>(null);

  // 数据模式：live = Binance 实时；mock = 本地模拟（降级）
  const [mode, setMode] = useState<'live' | 'mock'>('live');
  const [status, setStatus] = useState<FeedStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [liveBars, setLiveBars] = useState<Bar[] | null>(null);
  const feedRef = useRef<LiveDataFeed | null>(null);

  const layout = useLayoutStore((s) => s.layout);
  const panelOpen = useIndicatorStore((s) => s.panelOpen);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const settingsFor = useIndicatorStore((s) => s.settingsFor);
  const saveTemplate = useIndicatorStore((s) => s.saveTemplate);
  const loadTemplate = useIndicatorStore((s) => s.loadTemplate);
  const treeOpen = useDrawingStore((s) => s.treeOpen);
  const setTreeOpen = useDrawingStore((s) => s.setTreeOpen);

  const activeSymbol = useWatchlistStore((s) => s.active);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const alerts = useAlertStore((s) => s.alerts);
  const checkAlerts = useAlertStore((s) => s.check);

  const mockBars = useMemo(() => generateMockBars(100_000, 60_000, 30_000), []);
  const tf = getTimeframe(timeframe);
  const mockTfBars = useMemo(
    () => (timeframe === '1m' ? mockBars : aggregateBars(mockBars, tf)),
    [mockBars, timeframe, tf],
  );

  // 实时数据编排（仅单图布局）
  useEffect(() => {
    if (mode !== 'live' || layout !== 1) return;
    let cancelled = false;
    const feed = new LiveDataFeed({
      symbol: activeSymbol,
      interval: toBinanceInterval(timeframe),
      handlers: {
        onHistory: (bars, info) => {
          const r = rendererRef.current;
          if (info.prepend) {
            r?.prependBars(bars);
          } else {
            r?.setData(bars);
            setLiveBars(bars);
          }
        },
        onLive: (bar) => {
          const r = rendererRef.current;
          if (!r) return;
          const lastT = r.lastBarTime;
          const intervalMs = Math.max(tf.seconds, 60) * 1000;
          if (lastT > 0 && bar.time > lastT + intervalMs * 1.5) {
            void fetchKlines(activeSymbol, toBinanceInterval(timeframe), {
              startTime: lastT + intervalMs,
              endTime: bar.time - intervalMs,
            }).then((missing) => {
              if (missing.length > 0 && rendererRef.current) {
                const merged = klineCache.merge(rendererRef.current.getBars(), missing);
                rendererRef.current.setData(merged);
                setLiveBars(merged);
              }
            });
            return;
          }
          r.updateBar(bar);
          checkAlerts(activeSymbol, bar.close);
        },
        onStatus: (s, detail) => {
          if (cancelled) return;
          setStatus(s);
          setStatusDetail(detail ?? '');
        },
      },
    });
    feedRef.current = feed;
    feed.start().catch(() => {
      if (!cancelled) {
        setMode('mock');
        setStatus('error');
        setStatusDetail('实时数据不可用，已切换到模拟数据');
      }
    });
    return () => {
      cancelled = true;
      feed.stop();
    };
  }, [mode, activeSymbol, timeframe, layout, tf.seconds, checkAlerts]);

  const bars = mode === 'live' ? (liveBars ?? []) : mockTfBars;
  const lastPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;

  const handleNeedsMore = () => {
    void feedRef.current?.loadMore();
  };

  const handleScreenshot = () => {
    const r = rendererRef.current;
    if (!r) return;
    const a = document.createElement('a');
    a.href = r.screenshot();
    a.download = `tradingpa-${activeSymbol}-${Date.now()}.png`;
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
        <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, marginRight: 4 }}>{activeSymbol}</span>
        <IconButton active={watchlistOpen} onClick={() => setWatchlistOpen(!watchlistOpen)} title="自选股">
          <Star size={15} />
        </IconButton>
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
        <IconButton active={treeOpen} onClick={() => setTreeOpen(!treeOpen)} title="对象树">
          <Layers size={15} />
        </IconButton>
        <IconButton active={alertOpen} onClick={() => setAlertOpen(!alertOpen)} title={`价格警报${alerts.length > 0 ? ` (${alerts.length})` : ''}`}>
          <Bell size={15} />
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
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          成交量
        </label>
        {layout === 1 && (
          <IconButton
            onClick={() => {
              setLiveBars(null);
              setStatus('loading');
              setMode('live');
            }}
            title={mode === 'live' ? '重新连接' : '切换到实时数据'}
          >
            <RefreshCw size={15} />
          </IconButton>
        )}
        <ActiveIndicatorChips />
        <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {layout === 1 && (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[status], display: 'inline-block' }} />
              {mode === 'mock' ? '模拟数据' : statusDetail || status}
            </>
          )}
          <span style={{ marginLeft: 8 }}>
            {bars.length.toLocaleString()} 根 · {tf.label}
          </span>
        </span>
      </div>

      {layout === 1 ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <Chart
              bars={bars}
              symbol={activeSymbol}
              interval={tf.label}
              decimals={2}
              liveTickMs={mode === 'live' ? undefined : 800}
              chartType={chartType}
              logScale={logScale}
              showVolume={showVolume}
              onRendererReady={(r) => {
                rendererRef.current = r;
                setRenderer(r);
              }}
              onNeedsMoreHistory={handleNeedsMore}
            />
            <DrawingToolbar />
            {watchlistOpen && <Watchlist />}
            {panelOpen && <IndicatorPanel />}
            {treeOpen && <ObjectTree renderer={renderer} onClose={() => setTreeOpen(false)} />}
            {alertOpen && <AlertPanel symbol={activeSymbol} currentPrice={lastPrice} />}
            {settingsFor && <IndicatorSettingsDialog id={settingsFor} />}
            {replayIndex !== null && (
              <TradePanel
                price={bars[replayIndex]?.close ?? 0}
                time={bars[replayIndex]?.time ?? Date.now()}
                onReport={() => setReportOpen(true)}
              />
            )}
            {replayActive && (
              <ReplayBar barCount={bars.length} intervalLabel={tf.label} onSeekToTime={handleSeekToTime} />
            )}
          </div>
          {reportOpen && <SummaryReport onClose={() => setReportOpen(false)} />}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <LayoutGrid />
        </div>
      )}
    </div>
  );
}
