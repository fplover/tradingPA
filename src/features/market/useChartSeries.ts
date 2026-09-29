import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bar, Timeframe, TimeframeId } from '@/types/market';
import { getTimeframe } from '@/types/market';
import type { Instrument } from '@/types/instrument';
import type { FeedStatus } from '@/data/feed/types';
import { LiveDataFeed, toBinanceInterval } from '@/data/feed/LiveDataFeed';
import { binanceIntervalString, fetchKlines, nativeBaseInterval } from '@/data/feed/binance';
import { AggregateFeedPath } from '@/data/aggregatePath';
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
  const aggPathRef = useRef<AggregateFeedPath | null>(null);
  const pagingRef = useRef(false);
  /** 源确实没有更早数据（连续两次空/失败）后停止请求；单次抖动要重试 */
  const noMoreRef = useRef(false);
  const pageFailsRef = useRef(0);
  const retryAtRef = useRef(0);
  /** 当前这批历史是否已落地；在途时禁止翻页合并，避免把旧周期数据混进新周期 */
  const readyRef = useRef(false);
  const loadTokenRef = useRef(0);

  const id = instrument?.id ?? null;
  const tf = getTimeframe(timeframe);
  const tfRef = useRef(tf);
  tfRef.current = tf;
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
    loadTokenRef.current += 1;
    readyRef.current = false;
    noMoreRef.current = false;
    pagingRef.current = false;
    pageFailsRef.current = 0;
    retryAtRef.current = 0;

    const degradeToMock = (reason: string) => {
      readyRef.current = true;
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
      readyRef.current = true;
      setHistory(cached);
    });

    if (inst.market === 'crypto') {
      // B5：非原生周期（2m/45m/3H/自定义）没有 Binance interval——拉最大可整除原生基期，
      // 经既有聚合器聚合后走 onHistory 同款通路，缓存以目标周期 id 为键。
      // 已由 AggregateFeedPath 补实：轮询封闭新桶（tailChanged 门控同数据零渲染），
      // loadMore 前插基期后全量重聚合（接缝愈合），历史深度不再止于单页。
      const baseSeconds = tf.seconds > 0 ? nativeBaseInterval(tf.seconds) : null;
      if (baseSeconds !== null) {
        const base = binanceIntervalString(baseSeconds);
        const ratio = Math.ceil(tf.seconds / baseSeconds);
        setStatusDetail(`拉取 ${base} 基期 K 线并聚合`);
        const aggPath = new AggregateFeedPath({
          symbol: inst.code,
          baseInterval: base,
          tf,
          ratio,
          historyLimit: HISTORY_LIMIT,
          fetch: fetchKlines,
          onBars: (bars) => {
            readyRef.current = true;
            setHistory(bars);
            setStatus('live');
            setStatusDetail(`聚合自 ${base} 基期`);
            void klineCache.put(inst.id, timeframe, bars);
          },
          onError: (message) => {
            if (!disposed) degradeToMock(message);
          },
        });
        aggPathRef.current = aggPath;
        void aggPath.start();
        return () => {
          disposed = true;
          aggPathRef.current = null;
          aggPath.dispose();
        };
      }
      const feed = new LiveDataFeed({
        symbol: inst.code,
        interval: toBinanceInterval(timeframe),
        handlers: {
          onHistory: (bars, info) => {
            if (disposed) return;
            readyRef.current = true;
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
        readyRef.current = true;
        setHistory(fresh);
        setStatus('live');
        setStatusDetail(sourceName);
        void klineCache.put(inst.id, timeframe, fresh);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        if (err instanceof NoHistoryError) {
          // 该市场确实没有历史源，给空图表 + 明确原因，不拿模拟数据冒充真实行情
          readyRef.current = true;
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
      const inst = instRef.current;
      if (!inst) return;
      if (inst.market === 'crypto') {
        const feed = feedRef.current;
        if (feed) {
          void feed.loadMore();
          return;
        }
        // 聚合路径兜底：复用非 crypto 路径同一组状态 refs（互斥路径，fail 语义逐字一致）
        const aggPath = aggPathRef.current;
        if (!aggPath || pagingRef.current || noMoreRef.current) return;
        if (Date.now() < retryAtRef.current) return;
        // 历史还在在途加载时不翻页：否则会把旧周期的数据混进新周期
        if (!readyRef.current) return;
        const token = loadTokenRef.current;
        pagingRef.current = true;
        const fail = () => {
          pageFailsRef.current += 1;
          retryAtRef.current = Date.now() + 3000;
          if (pageFailsRef.current >= 2) noMoreRef.current = true;
        };
        aggPath
          .loadMore()
          .then((n) => {
            if (token !== loadTokenRef.current) return;
            if (n === 0) {
              fail();
              return;
            }
            pageFailsRef.current = 0;
          })
          .catch(fail)
          .finally(() => {
            pagingRef.current = false;
          });
        return;
      }
      const current = barsRef.current;
      if (pagingRef.current || noMoreRef.current || current.length === 0) return;
      if (Date.now() < retryAtRef.current) return;
      // 历史还在在途加载时不翻页：否则会把旧周期的数据混进新周期
      if (!readyRef.current) return;
      const token = loadTokenRef.current;
      pagingRef.current = true;
      const fail = () => {
        pageFailsRef.current += 1;
        retryAtRef.current = Date.now() + 3000;
        if (pageFailsRef.current >= 2) noMoreRef.current = true;
      };
      dataRegistry
        .barsBefore(inst, tfRef.current.id, current[0].time, HISTORY_LIMIT)
        .then((older) => {
          if (token !== loadTokenRef.current) return;
          if (older.length === 0) {
            fail();
            return;
          }
          pageFailsRef.current = 0;
          setHistory((h) => klineCache.merge(older, h));
        })
        .catch(fail)
        .finally(() => {
          pagingRef.current = false;
        });
    },
    reload: () => setNonce((n) => n + 1),
  };
}
