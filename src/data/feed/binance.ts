import type { Bar } from '@/types/market';
import type { FeedStatus } from './types';

const REST_BASE = 'https://api.binance.com';
const WS_BASE = 'wss://stream.binance.com:9443/ws';

/** 拉取历史 K 线（分页） */
export async function fetchKlines(
  symbol: string,
  interval: string,
  opts: { endTime?: number; startTime?: number; limit?: number } = {},
): Promise<Bar[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(opts.limit ?? 1000) });
  if (opts.endTime) params.set('endTime', String(opts.endTime));
  if (opts.startTime) params.set('startTime', String(opts.startTime));
  const res = await fetch(`${REST_BASE}/api/v3/klines?${params}`);
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
        const msg = JSON.parse(ev.data as string) as { k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean } };
        this.onBar(
          { time: msg.k.t, open: Number(msg.k.o), high: Number(msg.k.h), low: Number(msg.k.l), close: Number(msg.k.c), volume: Number(msg.k.v) },
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
