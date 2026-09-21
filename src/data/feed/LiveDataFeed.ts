import type { FeedOptions, FeedStatus } from './types';
import { fetchKlines, BinanceKlineWS, toBinanceInterval } from './binance';
import { klineCache } from '../cache/klineCache';

const PAGE = 1000;

/**
 * 实时数据编排：缓存 → 历史（分页）→ WS 实时 → 断线重连 → 向左滚动懒加载。
 * 任何一个环节失败都会向上抛错，由调用方决定降级（如退回模拟数据）。
 */
export class LiveDataFeed {
  private ws: BinanceKlineWS | null = null;
  private loadingMore = false;
  private earliestTime = Infinity;
  private pollTimer: number | null = null;

  constructor(private opts: FeedOptions) {}

  get symbol(): string {
    return this.opts.symbol;
  }

  get interval(): string {
    return this.opts.interval;
  }

  /** 启动：先读缓存立即渲染，再拉历史 + 连 WS */
  async start(): Promise<void> {
    const { symbol, interval, handlers } = this.opts;
    handlers.onStatus('loading', '读取本地缓存');
    const cached = await klineCache.get(symbol, interval);
    if (cached.length > 0) {
      this.earliestTime = cached[0].time;
      handlers.onHistory(cached, { prepend: false });
    }

    handlers.onStatus('loading', '拉取历史 K 线');
    const fresh = await fetchKlines(symbol, interval, { limit: PAGE });
    const merged = klineCache.merge(cached, fresh);
    this.earliestTime = merged[0]?.time ?? Infinity;
    handlers.onHistory(merged, { prepend: false });
    void klineCache.put(symbol, interval, merged);

    this.ws = new BinanceKlineWS(
      symbol,
      interval,
      (bar) => handlers.onLive(bar),
      handlers.onStatus,
      () => this.startPolling(),
    );
    this.ws.connect();
  }

  /** WS 连续失败后的 REST 轮询降级（3s 拉最新 2 根） */
  private startPolling(): void {
    if (this.pollTimer) return;
    this.opts.handlers.onStatus('reconnecting', 'WS 不可用，已降级为 REST 轮询');
    this.pollTimer = window.setInterval(() => {
      void fetchKlines(this.opts.symbol, this.opts.interval, { limit: 2 })
        .then((bars) => {
          for (const bar of bars) this.opts.handlers.onLive(bar);
        })
        .catch(() => {
          /* 网络抖动时下个周期再试 */
        });
    }, 3000);
  }

  /** 向左滚动到数据边缘时加载更早的历史 */
  async loadMore(): Promise<number> {
    if (this.loadingMore || !isFinite(this.earliestTime)) return 0;
    this.loadingMore = true;
    try {
      const older = await fetchKlines(this.opts.symbol, this.opts.interval, {
        endTime: this.earliestTime - 1,
        limit: PAGE,
      });
      if (older.length > 0) {
        this.earliestTime = older[0].time;
        this.opts.handlers.onHistory(older, { prepend: true });
        const cached = await klineCache.get(this.opts.symbol, this.opts.interval);
        void klineCache.put(this.opts.symbol, this.opts.interval, klineCache.merge(cached, older));
        return older.length;
      }
      return 0;
    } finally {
      this.loadingMore = false;
    }
  }

  get loading(): boolean {
    return this.loadingMore;
  }

  stop(): void {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.ws?.close();
    this.ws = null;
    this.opts.handlers.onStatus('idle');
  }
}

export { toBinanceInterval };
export type { FeedStatus };
