/**
 * 多图表联动的轻量事件总线（绕开 React，避免高频 setState）。
 *
 * D 批次升级（SPEC §5 数据契约 / 架构评估 #3）：
 * 1. 视口联动载荷从索引空间 {first, spacing} 升级为时间空间 {fromTime, toTime}——
 *    接收方用自己的 BarSeries 把时间范围换算回索引/视口（TV 时间轴同步语义），
 *    跨周期/跨品种图表不再错位；
 * 2. 事件携带 sourceId，订阅者忽略自己触发的发布——显式防环，
 *    替代原先「接收路径不再 emit」的调用点隐式不变式；
 * 3. 限频上移进总线：统一 30Hz（rAF 合帧；无 rAF 环境退化为 setTimeout），
 *    leading 即时分发 + 间隔内合并为 trailing（末态不丢）；
 * 4. 分发逐个 try/catch：单个 handler 抛错不中断其余订阅者（记 console.error，不静默吞）。
 */

/** 视口联动载荷（时间空间）：可见时间范围 [fromTime, toTime]（纪元毫秒） */
export interface ViewportTimeRange {
  fromTime: number;
  toTime: number;
}

type CrosshairHandler = (time: number | null, sourceId: symbol) => void;
type ViewportHandler = (range: ViewportTimeRange, sourceId: symbol) => void;

/** 统一限频间隔：30Hz（33.3ms）。原 Chart.tsx 每实例 32ms 硬编码闭包上移至此 */
const EMIT_INTERVAL_MS = 1000 / 30;

const crosshairSubs = new Map<CrosshairHandler, symbol>();
const viewportSubs = new Map<ViewportHandler, symbol>();

/**
 * 30Hz 限频器：leading 立即分发；间隔内的调用只保留末态，到点后 trailing 补发
 * （十字光标/视口都是「状态」而非「事件流」，中间态可弃、末态不可丢）。
 * 唤醒优先走 rAF 合帧（与渲染同节奏）；node/测试环境无 rAF 时退化 setTimeout。
 */
function createThrottler<T>(deliver: (v: T) => void): (v: T) => void {
  let lastFlush = -Infinity;
  let pending: { v: T } | null = null;
  let scheduled = false;

  function wake(): void {
    const wait = Math.max(0, EMIT_INTERVAL_MS - (Date.now() - lastFlush));
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tryFlush);
    else setTimeout(tryFlush, wait);
  }

  function tryFlush(): void {
    if (pending === null) {
      scheduled = false;
      return;
    }
    if (Date.now() - lastFlush < EMIT_INTERVAL_MS) {
      wake(); // 30Hz 间隔未到：等下一帧/下一次定时器再来
      return;
    }
    scheduled = false;
    const p = pending;
    pending = null;
    lastFlush = Date.now();
    deliver(p.v);
  }

  return (v: T) => {
    if (Date.now() - lastFlush >= EMIT_INTERVAL_MS) {
      lastFlush = Date.now();
      deliver(v);
      return;
    }
    pending = { v };
    if (!scheduled) {
      scheduled = true;
      wake();
    }
  };
}

/** 分发：sourceId 相同即跳过（显式防环）；单 handler 异常隔离，不中断整链 */
function dispatch<H>(subs: Map<H, symbol>, sourceId: symbol, invoke: (h: H) => void): void {
  for (const [handler, subSource] of subs) {
    if (subSource === sourceId) continue;
    try {
      invoke(handler);
    } catch (err) {
      console.error('[syncBus] 订阅者执行失败，已隔离该异常', err);
    }
  }
}

const emitCrosshairThrottled = createThrottler(({ time, sourceId }: { time: number | null; sourceId: symbol }) => {
  dispatch(crosshairSubs, sourceId, (h) => h(time, sourceId));
});
const emitViewportThrottled = createThrottler(({ range, sourceId }: { range: ViewportTimeRange; sourceId: symbol }) => {
  dispatch(viewportSubs, sourceId, (h) => h(range, sourceId));
});

export const syncBus = {
  /** 订阅十字光标时间。sourceId 为本图表标识：自己发出的事件不回送给自己 */
  onCrosshair(handler: CrosshairHandler, sourceId: symbol): () => void {
    crosshairSubs.set(handler, sourceId);
    return () => crosshairSubs.delete(handler);
  },
  emitCrosshair(time: number | null, sourceId: symbol): void {
    emitCrosshairThrottled({ time, sourceId });
  },
  /** 订阅视口联动（时间空间载荷） */
  onViewport(handler: ViewportHandler, sourceId: symbol): () => void {
    viewportSubs.set(handler, sourceId);
    return () => viewportSubs.delete(handler);
  },
  emitViewport(range: ViewportTimeRange, sourceId: symbol): void {
    emitViewportThrottled({ range, sourceId });
  },
};
