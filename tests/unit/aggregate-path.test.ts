import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar } from '@/types/market';
import { getTimeframe } from '@/types/market';
import { aggregateBars } from '@/data/aggregate';
import { klineCache } from '@/data/cache/klineCache';
import {
  AggregateFeedPath,
  aggregatePollIntervalMs,
  initialWindowLimit,
  tailChanged,
  mergeAndAggregate,
  loadMoreOpts,
} from '@/data/aggregatePath';

const T0 = Date.UTC(2024, 0, 1); // 2024-01-01 00:00:00Z
const TF = getTimeframe('2m');
const RATIO = 2;
const HISTORY_LIMIT = 800;
const WINDOW_LIMIT = 1000; // min(1000, 800*2)

type FetchOpts = { endTime?: number; startTime?: number; limit?: number };
type FetchCall = { symbol: string; interval: string; opts: FetchOpts };

/** 确定性 1m K 线：价格游走 + 固定成交量 */
function minuteBars(count: number, startMs: number, volume = 10): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price + (i % 2 === 0 ? 1 : -1);
    bars.push({
      time: startMs + i * 60_000,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume,
    });
    price = close;
  }
  return bars;
}

function makeFakeFetch() {
  const calls: FetchCall[] = [];
  let handler: (call: FetchCall, index: number) => Promise<Bar[]> = () => Promise.resolve([]);
  const fetch = (symbol: string, interval: string, opts: FetchOpts = {}) => {
    const call = { symbol, interval, opts };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return { fetch, calls, setHandler: (h: typeof handler) => void (handler = h) };
}

type Fake = ReturnType<typeof makeFakeFetch>;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 微任务冲刷：fake timers 下 setTimeout 不可用，靠 await 微任务驱动 then 链 */
async function flush(rounds = 8) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

function makePath(fake: Fake, onBars = vi.fn(), onError = vi.fn()) {
  const path = new AggregateFeedPath({
    symbol: 'BTCUSDT',
    baseInterval: '1m',
    tf: TF,
    ratio: RATIO,
    historyLimit: HISTORY_LIMIT,
    fetch: fake.fetch,
    onBars,
    onError,
  });
  return { path, onBars, onError };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('纯函数：aggregatePollIntervalMs / initialWindowLimit / loadMoreOpts', () => {
  it('1：poll 间隔 clamp(基期/2, 5s, 30s)，且随基期单调不减', () => {
    expect(aggregatePollIntervalMs(60)).toBe(30_000); // 1m 基期 → 30s 节拍（2m 图场景）
    expect(aggregatePollIntervalMs(10)).toBe(5_000); // 10s 基期 → 下限 5s
    expect(aggregatePollIntervalMs(3600)).toBe(30_000); // 1h 基期 → 上限 30s
    const seq = [10, 30, 60, 120, 3600].map(aggregatePollIntervalMs);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
  });

  it('2：初始窗口 limit = min(BINANCE_LIMIT_MAX, historyLimit * ratio)', () => {
    expect(initialWindowLimit(2, 800)).toBe(1000); // 1600 clamp 到 1000
    expect(initialWindowLimit(1, 800)).toBe(800);
    expect(loadMoreOpts(T0 + 240_000, 2, 800)).toEqual({ endTime: T0 + 240_000 - 1, limit: 1000 });
  });
});

describe('纯函数：mergeAndAggregate（对照 klineCache.merge 后者赢语义）', () => {
  it('3：同 time 基期 bar，incoming 的 OHLCV 覆盖（incoming 放 fresh 位）', () => {
    const base: Bar[] = [{ time: T0, open: 100, high: 102, low: 99, close: 101, volume: 10 }];
    const incoming: Bar[] = [{ time: T0, open: 500, high: 505, low: 495, close: 999, volume: 99 }];
    const out = mergeAndAggregate(base, incoming, TF);
    // 与 klineCache.merge 实际语义逐字对齐：fresh 覆盖同 time 键，结果等价于对 merge 产物聚合
    expect(out).toEqual(aggregateBars(klineCache.merge(base, incoming), TF));
    expect(out.length).toBe(1);
    expect(out[0].open).toBe(500);
    expect(out[0].high).toBe(505);
    expect(out[0].low).toBe(495);
    expect(out[0].close).toBe(999);
    expect(out[0].volume).toBe(99);
  });

  it('4：base 从桶中间起 + 前插更早 bar → 首桶愈合为完整桶值', () => {
    // 初始窗口从 00:01 起（00:00 桶缺首根），前插 00:00 后首桶应为完整 3 根桶
    const base = minuteBars(2, T0 + 60_000); // 00:01 / 00:02
    const older: Bar[] = [minuteBars(1, T0)[0]]; // 00:00
    const out = mergeAndAggregate(base, older, TF);
    expect(out.length).toBe(2); // 00:00 桶（00:00+00:01）、00:02 桶（00:02）
    expect(out[0].time).toBe(T0);
    expect(out[0].open).toBe(older[0].open); // open 取全桶首根（前插的 00:00）
    expect(out[0].close).toBe(base[0].close); // close 取全桶末根（00:01）
    expect(out[0].volume).toBe(20); // 残桶 1 根 → 愈合为 2 根完整桶值
    expect(out[0].high).toBe(Math.max(older[0].high, base[0].high));
    expect(out[1].time).toBe(T0 + 120_000); // 00:02 桶不受前插影响
  });
});

describe('纯函数：tailChanged', () => {
  const agg = aggregateBars(minuteBars(10, T0), TF); // 5 桶

  it('5：末 bar close 变 / length 变 → true；仅中间 bar 修订 → false（有意取舍）', () => {
    const lastCloseChanged = [...agg.slice(0, -1), { ...agg[agg.length - 1], close: -1 }];
    expect(tailChanged(agg, lastCloseChanged)).toBe(true);

    const longer = [...agg, { ...agg[agg.length - 1], time: agg[agg.length - 1].time + 120_000 }];
    expect(tailChanged(agg, longer)).toBe(true);

    // 取舍钉死：交易所对中间 bar 的修订被有意忽略（不触发 onBars / setHistory），
    // 避免为不可见修正付出引用级渲染抖动；尾柱一变全量 agg 即带出全部修订
    const middleRevised = agg.map((b, i) => (i === 0 ? { ...b, close: -1, volume: 999 } : b));
    expect(tailChanged(agg, middleRevised)).toBe(false);

    expect(tailChanged(agg, agg.map((b) => ({ ...b })))).toBe(false);
  });
});

describe('AggregateFeedPath：start 与轮询', () => {
  it('6：start 正常流——初始 fetch limit 正确，onBars 收到聚合结果（ceil 分桶）', async () => {
    const fake = makeFakeFetch();
    fake.setHandler(() => Promise.resolve(minuteBars(10, T0))); // 10 根 1m → 5 桶 2m
    const { path, onBars } = makePath(fake);
    await path.start();
    expect(fake.calls.length).toBe(1);
    expect(fake.calls[0]).toEqual({ symbol: 'BTCUSDT', interval: '1m', opts: { limit: WINDOW_LIMIT } });
    expect(onBars).toHaveBeenCalledTimes(1);
    const agg = onBars.mock.calls[0][0] as Bar[];
    expect(agg.length).toBe(5);
    expect(agg[0].time).toBe(T0);
    expect(agg[agg.length - 1].time).toBe(T0 + 8 * 60_000);
  });

  it('7：轮询 tick 更新——推进 1 拍触发第二次 fetch，新数据触发第二次 onBars', async () => {
    const fake = makeFakeFetch();
    // 第 1 次（初始）10 根；第 2 次起 11 根（尾部新增 00:10）
    fake.setHandler((_, i) => Promise.resolve(minuteBars(i === 0 ? 10 : 11, T0)));
    const { path, onBars } = makePath(fake);
    await path.start();
    await vi.advanceTimersByTimeAsync(30_000); // 1m 基期 → 30s 节拍
    expect(fake.calls.length).toBe(2);
    expect(onBars).toHaveBeenCalledTimes(2);
    const agg2 = onBars.mock.calls[1][0] as Bar[];
    expect(agg2.length).toBe(6); // 新增 00:10 桶
    expect(agg2[agg2.length - 1].time).toBe(T0 + 10 * 60_000);
  });

  it('8：轮询同数据不重渲染——两次 fetch 返回相同尾部 → onBars 仅 1 次（tailChanged 门控）', async () => {
    const fake = makeFakeFetch();
    fake.setHandler(() => Promise.resolve(minuteBars(10, T0)));
    const { path, onBars } = makePath(fake);
    await path.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fake.calls.length).toBe(2);
    expect(onBars).toHaveBeenCalledTimes(1);
  });

  it('9：防重入——上一拍 fetch 未 settle 时再来 tick，fetch 不并发', async () => {
    const fake = makeFakeFetch();
    const pending = deferred<Bar[]>();
    fake.setHandler((_, i) => (i === 0 ? Promise.resolve(minuteBars(10)) : pending.promise));
    const { path } = makePath(fake);
    await path.start();
    await vi.advanceTimersByTimeAsync(30_000); // tick #1：fetch #2 挂起
    expect(fake.calls.length).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000); // tick #2：inflight 守卫跳过
    expect(fake.calls.length).toBe(2);
    pending.resolve([]);
    await flush();
  });

  it('10：dispose 后零副作用——迟到响应被丢弃、无 unhandled rejection、轮询停止', async () => {
    const fake = makeFakeFetch();
    const pending = deferred<Bar[]>();
    fake.setHandler((_, i) => (i === 0 ? Promise.resolve(minuteBars(10)) : pending.promise));
    const { path, onBars } = makePath(fake);
    await path.start();
    await vi.advanceTimersByTimeAsync(30_000); // tick #1 挂起
    path.dispose();
    pending.reject(new Error('late response')); // dispose 后到达：必须被静默吞掉
    await flush();
    await vi.advanceTimersByTimeAsync(90_000); // 轮询已停，不再有 fetch
    expect(fake.calls.length).toBe(2);
    expect(onBars).toHaveBeenCalledTimes(1);
    await expect(path.loadMore()).resolves.toBe(0); // dispose 后翻页同样被拒绝
  });
});

describe('AggregateFeedPath：loadMore', () => {
  it('11：翻页正常流——endTime = earliest-1，前插后全量重聚合，onBars 长度增加、接缝愈合', async () => {
    const fake = makeFakeFetch();
    // 初始窗口从 00:04 起（首桶残缺）；翻页拉 00:00-00:03
    fake.setHandler((call) =>
      call.opts.endTime !== undefined ? Promise.resolve(minuteBars(4, T0)) : Promise.resolve(minuteBars(10, T0 + 4 * 60_000)),
    );
    const { path, onBars } = makePath(fake);
    await path.start();
    expect(path.earliestBaseTime).toBe(T0 + 4 * 60_000);
    const n = await path.loadMore();
    expect(n).toBe(4);
    expect(fake.calls[1].opts).toEqual({ endTime: T0 + 4 * 60_000 - 1, limit: WINDOW_LIMIT });
    expect(onBars).toHaveBeenCalledTimes(2);
    const agg = onBars.mock.calls[1][0] as Bar[];
    expect(agg.length).toBe(7); // 14 根 1m → 7 桶 2m
    expect(agg[0].time).toBe(T0); // 前插成功
    expect(agg[0].volume).toBe(20); // 00:00 桶 = 00:00+00:01 两根（接缝愈合，非残桶）
  });

  it('12：翻页空结果——fetch 返回 [] 时 resolve 0 且不触发 onBars（noMore 语义交 hook 状态机）', async () => {
    const fake = makeFakeFetch();
    fake.setHandler((call) =>
      call.opts.endTime !== undefined ? Promise.resolve([]) : Promise.resolve(minuteBars(10)),
    );
    const { path, onBars } = makePath(fake);
    await path.start();
    await expect(path.loadMore()).resolves.toBe(0);
    expect(onBars).toHaveBeenCalledTimes(1); // 仅初始那一次
  });

  it('13：翻页防重入——loadingMore 期间二次 loadMore 立即 resolve 0，paging fetch 仅 1 次', async () => {
    const fake = makeFakeFetch();
    const pending = deferred<Bar[]>();
    fake.setHandler((call) =>
      call.opts.endTime !== undefined ? pending.promise : Promise.resolve(minuteBars(10, T0 + 4 * 60_000)),
    );
    const { path } = makePath(fake);
    await path.start();
    const first = path.loadMore();
    await expect(path.loadMore()).resolves.toBe(0); // 重入被拒
    expect(fake.calls.filter((c) => c.opts.endTime !== undefined).length).toBe(1);
    pending.resolve(minuteBars(4, T0));
    await expect(first).resolves.toBe(4);
  });
});

describe('AggregateFeedPath：start 失败路径', () => {
  it('14：初始 fetch 失败——onError 收到消息且轮询不启动（失败交 hook degradeToMock 兜底）', async () => {
    const fake = makeFakeFetch();
    fake.setHandler(() => Promise.reject(new Error('REST 418')));
    const { path, onBars, onError } = makePath(fake);
    await path.start(); // 不 reject，由 onError 承接
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe('REST 418');
    expect(onBars).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fake.calls.length).toBe(1); // 轮询未启动
  });
});
