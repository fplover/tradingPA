import type { Bar } from '@/types/market';
import type { FeedStatus } from './types';

/** REST 主机候选：api.binance.com 被墙/不可达时退官方公共行情镜像 data-api.binance.vision
 *  （仅行情数据、同 API 形状，实测带 Access-Control-Allow-Origin: *）。 */
const REST_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
/** WS 主机候选：主站与行情镜像（data-stream.binance.vision），重连时轮换 */
const WS_HOSTS = ['wss://stream.binance.com:9443/ws', 'wss://data-stream.binance.vision/ws'];
/** REST 请求超时：挂起时及时失败，便于上层降级到模拟数据 */
const REST_TIMEOUT_MS = 10_000;

/** Binance REST 请求（多主机回退：主站失败自动换镜像重试一次） */
export async function fetchBinanceJson<T>(path: string, timeoutMs = REST_TIMEOUT_MS): Promise<T> {
  let lastError: unknown = null;
  for (const host of REST_HOSTS) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${host}${path}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`REST ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('Binance REST 全部主机失败');
}

/** 拉取历史 K 线（分页） */
export async function fetchKlines(
  symbol: string,
  interval: string,
  opts: { endTime?: number; startTime?: number; limit?: number } = {},
): Promise<Bar[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(opts.limit ?? 1000) });
  if (opts.endTime) params.set('endTime', String(opts.endTime));
  if (opts.startTime) params.set('startTime', String(opts.startTime));
  const raw = await fetchBinanceJson<unknown[][]>(`/api/v3/klines?${params}`);
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
    // 主机按重试次数轮换：主站被墙时第二次重连自动落到镜像
    const base = WS_HOSTS[this.retries % WS_HOSTS.length];
    this.ws = new WebSocket(`${base}/${stream}`);
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
