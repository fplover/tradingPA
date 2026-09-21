import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useWatchlistStore } from '@/store/watchlistStore';
import { useAlertStore } from '@/store/alertStore';
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { IndicatorSettingsDialog } from '@/features/indicators/IndicatorSettingsDialog';
import { ActiveIndicatorChips } from '@/features/indicators/ActiveIndicatorChips';
import { DrawingToolbar } from '@/features/drawings/DrawingToolbar';
import { ObjectTree } from '@/features/drawings/ObjectTree';
import { LayoutGrid, LayoutButtons } from '@/features/layout/LayoutGrid';
import { Watchlist } from '@/features/watchlist/Watchlist';
import { AlertPanel } from '@/features/alerts/AlertPanel';
import { ReplayControls } from '@/features/replay/ReplayControls';

const selectStyle: React.CSSProperties = {
  background: '#1e222d',
  color: '#d1d4dc',
  border: '1px solid #2a2e39',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  background: '#2a2e39',
  color: '#d1d4dc',
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const STATUS_COLOR: Record<FeedStatus, string> = {
  idle: '#787b86',
  loading: '#ff9800',
  live: '#26a69a',
  reconnecting: '#ff9800',
  error: '#ef5350',
};

export default function App() {
  const [timeframe, setTimeframe] = useState<TimeframeId>('1m');
  const [chartType, setChartType] = useState<ChartTypeId>('candles');
  const [logScale, setLogScale] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [renderer, setRenderer] = useState<ChartRenderer | null>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);

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

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#131722', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: '#1e222d',
          borderBottom: '1px solid #2a2e39',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: '#d1d4dc', fontSize: 13, marginRight: 8 }}>TradingPA</strong>
        <LayoutButtons />
        <button style={{ ...btnStyle, background: watchlistOpen ? '#2962ff' : '#2a2e39' }} onClick={() => setWatchlistOpen(!watchlistOpen)}>
          自选股
        </button>
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
            <ReplayControls barCount={bars.length} replayIndex={replayIndex} onIndexChange={setReplayIndex} />
          </>
        )}
        <button style={{ ...btnStyle, background: panelOpen ? '#2962ff' : '#2a2e39' }} onClick={() => setPanelOpen(!panelOpen)}>
          指标
        </button>
        <button style={btnStyle} onClick={saveTemplate}>
          存模板
        </button>
        <button style={btnStyle} onClick={loadTemplate}>
          取模板
        </button>
        <button style={{ ...btnStyle, background: treeOpen ? '#2962ff' : '#2a2e39' }} onClick={() => setTreeOpen(!treeOpen)}>
          对象树
        </button>
        <button style={{ ...btnStyle, background: alertOpen ? '#2962ff' : '#2a2e39' }} onClick={() => setAlertOpen(!alertOpen)}>
          警报{alerts.length > 0 ? ` (${alerts.length})` : ''}
        </button>
        <button style={btnStyle} onClick={handleScreenshot} title="导出 PNG">
          截图
        </button>
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
          对数
        </label>
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          成交量
        </label>
        {layout === 1 && (
          <button
            style={btnStyle}
            onClick={() => {
              setLiveBars(null);
              setStatus('loading');
              setMode('live');
            }}
          >
            {mode === 'live' ? '重连' : '切实时'}
          </button>
        )}
        <ActiveIndicatorChips />
        <span style={{ color: '#787b86', fontSize: 11, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
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
            replayIndex={replayIndex}
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
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <LayoutGrid />
        </div>
      )}
    </div>
  );
}
