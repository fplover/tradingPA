import type { Bar } from '@/types/market';
import type { FeedStatus } from './types';

const REST_BASE = 'https://api.binance.com';
const WS_BASE = 'wss://stream.binance.com:9443/ws';
/** REST 请求超时：挂起时及时失败，便于上层降级到模拟数据 */
const REST_TIMEOUT_MS = 10_000;

/** 拉取历史 K 线（分页） */
export async function fetchKlines(
  symbol: string,
  interval: string,
  opts: { endTime?: number; startTime?: number; limit?: number } = {},
): Promise<Bar[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(opts.limit ?? 1000) });
  if (opts.endTime) params.set('endTime', String(opts.endTime));
  if (opts.startTime) params.set('startTime', String(opts.startTime));
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), REST_TIMEOUT_MS);
  try {
    const res = await fetch(`${REST_BASE}/api/v3/klines?${params}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`REST ${res.status}`);
    const raw = (await res.json()) as unknown[][];
    return raw.map((k) => ({
      time: k[0] as number,
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  } finally {
    window.clearTimeout(timer);
  }
}

/** Binance K 线 WebSocket 订阅（自动重连 + 指数退避；多次失败转 REST 轮询） */
export class BinanceKlineWS {
  private ws: WebSocket | null = null;
  private closed = false;
  private retries = 0;
  private reconnectTimer: number | null = null;

  constructor(
    private symbol: string,
    private interval: string,
    private onBar: (bar: Bar, isFinal: boolean) => void,
    private onStatus: (status: FeedStatus, detail?: string) => void,
    private onGiveUp?: () => void,
  ) {}

  /** 连续失败次数（供外部判断是否已降级） */
  get retryCount(): number {
    return this.retries;
  }

  connect(): void {
    this.closed = false;
    this.open();
  }

  private open(): void {
    const stream = `${this.symbol.toLowerCase()}@kline_${this.interval}`;
    this.ws = new WebSocket(`${WS_BASE}/${stream}`);
    this.ws.onopen = () => {
      this.retries = 0;
      this.onStatus('live');
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean };
        };
        this.onBar(
          {
            time: msg.k.t,
            open: Number(msg.k.o),
            high: Number(msg.k.h),
            low: Number(msg.k.l),
            close: Number(msg.k.c),
            volume: Number(msg.k.v),
          },
          msg.k.x,
        );
      } catch {
        /* 忽略解析失败的单条消息 */
      }
    };
    this.ws.onerror = () => {
      this.onStatus('reconnecting', 'WS 错误');
    };
    this.ws.onclose = () => {
      if (this.closed) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.retries += 1;
    if (this.retries >= 3) {
      // 连续失败：转 REST 轮询降级
      this.onGiveUp?.();
      return;
    }
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retries - 1, 5));
    this.onStatus('reconnecting', `${(delay / 1000).toFixed(0)}s 后重连（第 ${this.retries} 次）`);
    this.reconnectTimer = window.setTimeout(() => this.open(), delay);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
  }
}

/** 周期 id → Binance interval 字符串 */
export function toBinanceInterval(timeframeId: string): string {
  if (timeframeId === '1M') return '1M';
  return timeframeId.toLowerCase();
}

/** Binance 原生 interval（秒）：1s/1m/3m/5m/15m/30m/1H/2H/4H/6H/8H/12H/1D/3D/1W。
 *  1M 为日历分桶不参与纪元整除推导。 */
const BINANCE_NATIVE_SECONDS = [
  1, 5, 15, 30, 60, 180, 300, 900, 1800, 3600, 7200, 14400, 21600, 28800, 43200, 86400, 259200, 604_800,
];

/** 单次 REST 拉取上限（Binance klines limit 最大值，超出会被拒） */
export const BINANCE_LIMIT_MAX = 1000;

/** 目标周期的最大可整除原生基期（秒）；目标本身即原生返回 null（无需聚合，走既有 WS 通路）。
 *  B5：2m/45m/3H/自定义间隔无原生 interval，经此推导基期后由既有聚合器聚合。 */
export function nativeBaseInterval(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null; // 日历周期（seconds=0）不推导
  if (BINANCE_NATIVE_SECONDS.includes(seconds)) return null;
  let best: number | null = null;
  for (const n of BINANCE_NATIVE_SECONDS) {
    if (seconds % n === 0 && (best === null || n > best)) best = n;
  }
  return best;
}

/** 秒 → Binance interval 字符串（与 toBinanceInterval 输出同格式：1s/1m/1h/1d） */
export function binanceIntervalString(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${seconds / 60}m`;
  if (seconds < 86_400) return `${seconds / 3600}h`;
  return `${seconds / 86_400}d`;
}
