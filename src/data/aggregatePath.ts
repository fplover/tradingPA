import type { Bar, Timeframe } from '@/types/market';
import { aggregateBars } from '@/data/aggregate';
import { klineCache } from '@/data/cache/klineCache';
import { BINANCE_LIMIT_MAX } from '@/data/feed/binance';

/**
 * 非原生周期（2m/45m/3H/自定义）crypto 聚合路径：基期拉取 + 轮询封闭新桶 + 向左翻页。
 * 纯数据编排、零 React；fetch 可注入 mock，便于单测。useChartSeries 只做装配。
 */

/** 依赖注入：fetch 可替换为 mock（vitest 注入假 fetchKlines） */
export interface AggregateFeedPathDeps {
  symbol: string; // inst.code
  baseInterval: string; // binanceIntervalString(baseSeconds)，如 '1m'/'15m'
  tf: Timeframe; // 目标周期
  ratio: number; // Math.ceil(tf.seconds / baseSeconds)，该路径恒 ≥ 2
  historyLimit: number; // HISTORY_LIMIT（800）
  fetch: (
    symbol: string,
    interval: string,
    opts: { endTime?: number; startTime?: number; limit?: number },
  ) => Promise<Bar[]>;
  onBars: (agg: Bar[]) => void; // hook 侧：setHistory + klineCache.put（缓存键 = 目标周期 id）
  onError?: (message: string) => void;
}

/** 轮询间隔：clamp(基期毫秒 / 2, 5000, 30000)。
 *  理由：桶封闭由轮询负责，bar 内价格由既有 quoteStore 5s 报价轮询经 applyQuote 维持——
 *  轮询无需秒级；基期/2 保证分钟级周期在半个基期内封闭新桶；上下 clamp 守住
 *  请求预算（30s 下限 = 每源 ≤2 次/分）与新鲜度（5s 上限，2m 图基期 1m → 30s 节拍）。 */
export function aggregatePollIntervalMs(baseSeconds: number): number {
  return Math.min(30_000, Math.max(5_000, (baseSeconds * 1000) / 2));
}

/** 初始窗口 limit：min(BINANCE_LIMIT_MAX, historyLimit * ratio) */
export function initialWindowLimit(ratio: number, historyLimit: number): number {
  return Math.min(BINANCE_LIMIT_MAX, historyLimit * ratio);
}

/** 尾柱是否实质变化：length 或末 bar 的 time/close 变化即 true。
 *  轮询每拍合并后调用，false 则跳过 onBars——同数据不触发 setHistory，
 *  这是「同数据同渲染」非确定性的主防线（无引用级抖动）。
 *  取舍：中间 bar 的交易所修订被有意忽略（修订只影响非尾柱时无渲染触发），
 *  避免为不可见修正付出引用抖动代价；尾柱变化时全量 agg 已含全部修订。 */
export function tailChanged(prev: Bar[], next: Bar[]): boolean {
  if (prev.length !== next.length) return true;
  if (prev.length === 0) return false;
  const a = prev[prev.length - 1];
  const b = next[next.length - 1];
  return a.time !== b.time || a.close !== b.close;
}

/** 合并 + 重聚合：incoming 放 fresh 位（klineCache.merge 后者赢——同 time 键后写覆盖），
 *  保证交易所修订过的同 time 基期 bar 与更完整的边界桶覆盖旧值。
 *  全量重聚合而非分段聚合 + merge：初始窗口起点落在桶中间时，前插更早基期后
 *  重聚合能修正首桶的 open/high/low/volume，翻页接缝不留永久残桶。 */
export function mergeAndAggregate(baseBars: Bar[], incomingBase: Bar[], tf: Timeframe): Bar[] {
  const merged = klineCache.merge(baseBars, incomingBase);
  return aggregateBars(merged, tf);
}

/** 翻页拉取参数：endTime = earliestBaseTime - 1（毫秒）；limit 同 initialWindowLimit */
export function loadMoreOpts(
  earliestBaseTime: number,
  ratio: number,
  historyLimit: number,
): { endTime: number; limit: number } {
  return { endTime: earliestBaseTime - 1, limit: initialWindowLimit(ratio, historyLimit) };
}

export class AggregateFeedPath {
  private baseBars: Bar[] = [];
  private lastAgg: Bar[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private inflight = false;
  private loadingMore = false;
  private readonly pollMs: number;
  private readonly windowLimit: number;

  constructor(private readonly deps: AggregateFeedPathDeps) {
    // 基期秒 = tf.seconds / ratio（nativeBaseInterval 保证整除），据此推轮询节拍
    this.pollMs = aggregatePollIntervalMs(deps.tf.seconds / deps.ratio);
    this.windowLimit = initialWindowLimit(deps.ratio, deps.historyLimit);
  }

  /** 初始拉取 → 聚合 → onBars → 起轮询。失败走 onError（不 reject，轮询不启动，交 hook 降级） */
  async start(): Promise<void> {
    try {
      const base = await this.deps.fetch(this.deps.symbol, this.deps.baseInterval, {
        limit: this.windowLimit,
      });
      if (this.disposed) return; // 迟到响应零副作用
      this.baseBars = base;
      this.lastAgg = mergeAndAggregate([], base, this.deps.tf);
      this.deps.onBars(this.lastAgg);
      this.timer = setInterval(this.tick, this.pollMs);
    } catch (err) {
      if (this.disposed) return;
      this.deps.onError?.(err instanceof Error ? err.message : '聚合基期数据获取失败');
    }
  }

  /** 向左翻页：拉 endTime = 最早基期 time - 1 的更早窗口，前插基期数组，全量重聚合，onBars。
   *  返回本次拉到的基期 bar 数（0 = 源已无更早数据或翻页失败）；失败 rethrow 交 hook fail 语义。
   *  语义与 LiveDataFeed.loadMore(): Promise<number> 对齐，hook 分支对称替换。 */
  async loadMore(): Promise<number> {
    if (this.disposed || this.loadingMore) return 0;
    if (this.baseBars.length === 0) return 0;
    this.loadingMore = true;
    try {
      const older = await this.deps.fetch(
        this.deps.symbol,
        this.deps.baseInterval,
        loadMoreOpts(this.baseBars[0].time, this.deps.ratio, this.deps.historyLimit),
      );
      if (this.disposed) return 0; // 迟到响应零副作用
      if (older.length === 0) return 0;
      this.baseBars = klineCache.merge(this.baseBars, older);
      this.lastAgg = mergeAndAggregate([], this.baseBars, this.deps.tf);
      this.deps.onBars(this.lastAgg);
      return older.length;
    } finally {
      this.loadingMore = false;
    }
  }

  /** 当前最早基期 bar time；null = 尚无数据 */
  get earliestBaseTime(): number | null {
    return this.baseBars.length > 0 ? this.baseBars[0].time : null;
  }

  /** 停轮询、置 disposed（防迟到回调）、拒绝后续 tick */
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 轮询一拍：三重守卫（disposed / document.hidden / inflight）→ 拉尾部窗口 →
   *  合并重聚合 → tailChanged 门控 onBars（同数据零渲染）。 */
  private tick = (): void => {
    if (this.disposed || this.inflight) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.inflight = true;
    this.deps
      .fetch(this.deps.symbol, this.deps.baseInterval, { limit: this.windowLimit })
      .then((fresh) => {
        if (this.disposed) return; // 迟到响应零副作用
        this.baseBars = klineCache.merge(this.baseBars, fresh);
        const agg = mergeAndAggregate([], this.baseBars, this.deps.tf);
        const changed = tailChanged(this.lastAgg, agg);
        this.lastAgg = agg;
        if (changed) this.deps.onBars(agg);
      })
      .catch(() => {
        /* 静默：下一拍再试，连续失败由 hook 层状态机感知 */
      })
      .finally(() => {
        this.inflight = false;
      });
  };
}
