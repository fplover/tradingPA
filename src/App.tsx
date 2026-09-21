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
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { IndicatorSettingsDialog } from '@/features/indicators/IndicatorSettingsDialog';
import { ActiveIndicatorChips } from '@/features/indicators/ActiveIndicatorChips';
import { DrawingToolbar } from '@/features/drawings/DrawingToolbar';
import { ObjectTree } from '@/features/drawings/ObjectTree';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];

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

  // 数据模式：live = Binance 实时；mock = 本地模拟（降级）
  const [mode, setMode] = useState<'live' | 'mock'>('live');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [status, setStatus] = useState<FeedStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [liveBars, setLiveBars] = useState<Bar[] | null>(null);
  const feedRef = useRef<LiveDataFeed | null>(null);

  const panelOpen = useIndicatorStore((s) => s.panelOpen);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const settingsFor = useIndicatorStore((s) => s.settingsFor);
  const saveTemplate = useIndicatorStore((s) => s.saveTemplate);
  const loadTemplate = useIndicatorStore((s) => s.loadTemplate);
  const treeOpen = useDrawingStore((s) => s.treeOpen);
  const setTreeOpen = useDrawingStore((s) => s.setTreeOpen);

  const mockBars = useMemo(() => generateMockBars(100_000, 60_000, 30_000), []);
  const tf = getTimeframe(timeframe);
  const mockTfBars = useMemo(
    () => (timeframe === '1m' ? mockBars : aggregateBars(mockBars, tf)),
    [mockBars, timeframe, tf],
  );

  // 实时数据编排
  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    const feed = new LiveDataFeed({
      symbol,
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
            // 缺口回补（断线重连后）
            void fetchKlines(symbol, toBinanceInterval(timeframe), {
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
  }, [mode, symbol, timeframe, tf.seconds]);

  const bars = mode === 'live' ? (liveBars ?? []) : mockTfBars;

  const handleNeedsMore = () => {
    void feedRef.current?.loadMore();
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
        <select style={selectStyle} value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={mode !== 'live'}>
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
        <button style={{ ...btnStyle, background: panelOpen ? '#2962ff' : '#2a2e39' }} onClick={() => setPanelOpen(!panelOpen)}>
          指标
        </button>
        <button style={btnStyle} onClick={saveTemplate}>
          存模板
        </button>
        <button style={btnStyle} onClick={loadTemplate}>
          取模板
        </button>
        <button style={btnStyle} onClick={() => setTreeOpen(!treeOpen)}>
          对象树
        </button>
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
          对数
        </label>
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          成交量
        </label>
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
        <ActiveIndicatorChips />
        <span style={{ color: '#787b86', fontSize: 11, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[status], display: 'inline-block' }} />
          {mode === 'mock' ? '模拟数据' : statusDetail || status}
          <span style={{ marginLeft: 8 }}>
            {bars.length.toLocaleString()} 根 · {tf.label}
          </span>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Chart
          bars={bars}
          symbol={symbol}
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
        {panelOpen && <IndicatorPanel />}
        {treeOpen && <ObjectTree renderer={renderer} onClose={() => setTreeOpen(false)} />}
        {settingsFor && <IndicatorSettingsDialog id={settingsFor} />}
      </div>
    </div>
  );
}
