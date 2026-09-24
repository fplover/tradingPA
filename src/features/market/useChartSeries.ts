import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bar, Timeframe, TimeframeId } from '@/types/market';
import { getTimeframe } from '@/types/market';
import type { Instrument } from '@/types/instrument';
import type { FeedStatus } from '@/data/feed/types';
import { LiveDataFeed, toBinanceInterval } from '@/data/feed/LiveDataFeed';
import { fetchKlines } from '@/data/feed/binance';
import { klineCache } from '@/data/cache/klineCache';
import { dataRegistry, NoHistoryError } from '@/data/sources/registry';
import { applyQuote } from '@/data/liveBar';
import { generateSeededMockBars } from '@/data/mockData';
import { useQuoteStore } from '@/store/quoteStore';

export interface ChartSeries {
  bars: Bar[];
  /** mock = 数据源不可达时的模拟数据降级 */
  mode: 'live' | 'mock';
  status: FeedStatus;
  statusDetail: string;
  loadMore: () => void;
  reload: () => void;
}

const HISTORY_LIMIT = 800;

function mockInterval(tf: Timeframe): number {
  if (tf.seconds > 0) return tf.seconds * 1000;
  return tf.calendar === 'week' ? 7 * 86_400_000 : 30 * 86_400_000;
}

/**
 * 图表数据编排：缓存即时渲染 → 拉历史 → 报价轮询维护最后一根。
 * 加密货币沿用既有 Binance WS 通道（有推送就不必轮询），其余市场走 registry + 轮询。
 */
export function useChartSeries(instrument: Instrument | null, timeframe: TimeframeId): ChartSeries {
  const [history, setHistory] = useState<Bar[]>([]);
  const [mode, setMode] = useState<'live' | 'mock'>('live');
  const [status, setStatus] = useState<FeedStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [nonce, setNonce] = useState(0);

  const instRef = useRef(instrument);
  instRef.current = instrument;
  const barsRef = useRef<Bar[]>(history);
  barsRef.current = history;
  const feedRef = useRef<LiveDataFeed | null>(null);

  const id = instrument?.id ?? null;
  const tf = getTimeframe(timeframe);
  const quote = useQuoteStore((s) => (id ? s.quotes[id] : undefined));

  useEffect(() => {
    const inst = instRef.current;
    if (!inst) {
      setHistory([]);
      setStatus('idle');
      setStatusDetail('');
      return;
    }
    let disposed = false;
    const sourceName = dataRegistry.sourceName(inst);

    const degradeToMock = (reason: string) => {
      setMode('mock');
      setStatus('error');
      setStatusDetail(`${reason}，已切换到模拟数据`);
      setHistory(generateSeededMockBars(inst.id, 600, mockInterval(tf), 100));
    };

    setMode('live');
    setStatus('loading');
    setStatusDetail('读取本地缓存');
    void klineCache.get(inst.id, timeframe).then((cached) => {
      if (disposed || cached.length === 0) return;
      setHistory(cached);
    });

    if (inst.market === 'crypto') {
      const feed = new LiveDataFeed({
        symbol: inst.code,
        interval: toBinanceInterval(timeframe),
        handlers: {
          onHistory: (bars, info) => {
            if (disposed) return;
            setHistory(info.prepend ? [...bars, ...barsRef.current] : bars);
            setStatus('live');
          },
          onLive: (bar) => {
            if (disposed) return;
            const prev = barsRef.current;
            const last = prev[prev.length - 1];
            const intervalMs = Math.max(tf.seconds, 60) * 1000;
            // 推送跳空（断线期间漏了 K 线）时补拉缺失区间
            if (last && bar.time > last.time + intervalMs * 1.5) {
              void fetchKlines(inst.code, toBinanceInterval(timeframe), {
                startTime: last.time + intervalMs,
                endTime: bar.time - intervalMs,
              })
                .then((missing) => {
                  if (!disposed && missing.length > 0) setHistory(klineCache.merge(barsRef.current, missing));
                })
                .catch(() => {
                  /* 补拉失败就等下一次推送 */
                });
              return;
            }
            setHistory(klineCache.merge(prev, [bar]));
          },
          onStatus: (s, detail) => {
            if (disposed) return;
            setStatus(s);
            setStatusDetail(detail ?? '');
          },
        },
      });
      feedRef.current = feed;
      feed.start().catch(() => {
        if (!disposed) degradeToMock('实时数据不可用');
      });
      return () => {
        disposed = true;
        feed.stop();
        feedRef.current = null;
      };
    }

    setStatusDetail(`从${sourceName}拉取历史 K 线`);
    dataRegistry
      .bars(inst, timeframe, HISTORY_LIMIT)
      .then((fresh) => {
        if (disposed) return;
        if (fresh.length === 0) {
          degradeToMock('数据源返回空');
          return;
        }
        setHistory(fresh);
        setStatus('live');
        setStatusDetail(`${sourceName} · ${fresh.length} 根`);
        void klineCache.put(inst.id, timeframe, fresh);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        if (err instanceof NoHistoryError) {
          // 该市场确实没有历史源，给空图表 + 明确原因，不拿模拟数据冒充真实行情
          setHistory([]);
          setStatus('error');
          setStatusDetail(err.message);
          return;
        }
        degradeToMock(err instanceof Error ? err.message : '历史数据获取失败');
      });

    return () => {
      disposed = true;
    };
    // tf 由 timeframe 决定，instRef 由 id 决定，无需再进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, timeframe, nonce]);

  /** 历史 + 实时尾柱。模拟数据不参与报价合成，否则会和随机游走互相打架。 */
  const bars = useMemo(() => {
    if (mode === 'mock' || !quote || history.length === 0) return history;
    return applyQuote(history, quote, tf);
  }, [history, quote, mode, tf]);

  return {
    bars,
    mode,
    status,
    statusDetail,
    loadMore: () => {
      void feedRef.current?.loadMore();
    },
    reload: () => setNonce((n) => n + 1),
  };
}
