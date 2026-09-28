import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncBus, type ViewportTimeRange } from '@/store/syncBus';

/**
 * syncBus 防环与限频用例（D 批次升级后契约，SPEC §5 数据契约 / 架构评估 #3）。
 *
 * 相对 A3-5 初版的变更披露（API 变更导致的断言更新，仅限本文件、不削弱覆盖）：
 * 1. 视口载荷 {first, spacing}（索引空间）→ {fromTime, toTime}（时间空间）——
 *    跨周期/跨品种图表按各自 series 换算，对齐 TV 时间轴同步语义；
 * 2. subscribe/emit 增加 sourceId 参数——防环从「接收路径不再 emit」的调用点
 *    隐式不变式，上移为总线显式过滤（订阅者忽略自己触发的发布）；
 * 3. 限频从 Chart.tsx 每实例 32ms 闭包上移为总线统一 30Hz——
 *    leading 即时分发 + 间隔内合并为 trailing（末态不丢）；
 * 4. 分发加 try/catch——原「一个 handler 抛错中断全链」的现状断言反转为
 *    异常隔离断言（异常记录 console.error，不静默吞）。
 *
 * 时钟说明：限频器状态（lastFlush）是模块级的、跨用例残留，因此 beforeAll 统一装
 * 假定时器，beforeEach 把假时钟前推 60s（远超 30Hz 间隔）保证每个用例的首次发布
 * 都是 leading（即时送达）；afterEach 清掉残留的 trailing 定时器防止跨用例串流。
 * requestAnimationFrame 打桩为 undefined 强制走 setTimeout 路径（node 环境无 rAF），
 * rAF 合帧路径由专门用例以手动帧回调覆盖。
 */

const SRC_A = Symbol('chartA');
const SRC_B = Symbol('chartB');

/** 推进时钟越过 30Hz 限频间隔（33.3ms），让 trailing 末态送达 */
function tick(): void {
  vi.advanceTimersByTime(40);
}

beforeAll(() => {
  vi.useFakeTimers();
});

beforeEach(() => {
  vi.setSystemTime(Date.now() + 60_000);
  vi.stubGlobal('requestAnimationFrame', undefined);
});

afterEach(() => {
  // 排空可能残留的 trailing 定时器，防止跨用例串流。
  // 注意：不能用 vi.clearAllTimers()/vi.unstubAllGlobals()——二者都会卸载假定时器，
  // 之后 setSystemTime 变空操作、时钟回退真实时间，elapsed 变负导致 leading 不即时。
  vi.advanceTimersByTime(100);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('syncBus 通道语义', () => {
  it('crosshair 通道：发布 → 订阅者收到时间；退订后不再收到', () => {
    const seen: Array<number | null> = [];
    const off = syncBus.onCrosshair((t) => seen.push(t), SRC_A);
    syncBus.emitCrosshair(1_700_000_000_000, SRC_B);
    expect(seen).toEqual([1_700_000_000_000]); // leading：即时送达
    tick();
    syncBus.emitCrosshair(null, SRC_B);
    expect(seen).toEqual([1_700_000_000_000, null]);
    off();
    syncBus.emitCrosshair(42, SRC_B);
    tick();
    expect(seen).toEqual([1_700_000_000_000, null]); // 退订生效
  });

  it('viewport 通道：发布 → 订阅者收到 {fromTime, toTime}（时间空间）', () => {
    const seen: ViewportTimeRange[] = [];
    const off = syncBus.onViewport((v) => seen.push(v), SRC_A);
    syncBus.emitViewport({ fromTime: 1_700_000_000_000, toTime: 1_700_000_600_000 }, SRC_B);
    expect(seen).toEqual([{ fromTime: 1_700_000_000_000, toTime: 1_700_000_600_000 }]);
    tick();
    syncBus.emitViewport({ fromTime: 0, toTime: 60_000 }, SRC_B);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ fromTime: 0, toTime: 60_000 });
    off();
    syncBus.emitViewport({ fromTime: 5, toTime: 6 }, SRC_B);
    tick();
    expect(seen).toHaveLength(2); // 退订后不再收到
  });

  it('两通道互相隔离：crosshair 发布不触发 viewport 订阅者，反之亦然', () => {
    const onCross = vi.fn();
    const onVp = vi.fn();
    const offC = syncBus.onCrosshair(onCross, SRC_A);
    const offV = syncBus.onViewport(onVp, SRC_A);
    syncBus.emitCrosshair(123, SRC_B);
    tick();
    syncBus.emitViewport({ fromTime: 1, toTime: 2 }, SRC_B);
    expect(onCross).toHaveBeenCalledTimes(1);
    expect(onCross).toHaveBeenCalledWith(123, SRC_B);
    expect(onVp).toHaveBeenCalledTimes(1);
    expect(onVp).toHaveBeenCalledWith({ fromTime: 1, toTime: 2 }, SRC_B);
    offC();
    offV();
  });

  it('广播语义：多个订阅者按注册顺序全部收到', () => {
    const order: string[] = [];
    const off1 = syncBus.onCrosshair(() => order.push('a'), SRC_A);
    const off2 = syncBus.onCrosshair(() => order.push('b'), SRC_A);
    syncBus.emitCrosshair(1, SRC_B);
    expect(order).toEqual(['a', 'b']);
    off1();
    off2();
  });

  it('同一处理函数重复订阅只生效一次（Map 去重，后者覆盖 sourceId）', () => {
    const fn = vi.fn();
    const off1 = syncBus.onCrosshair(fn, SRC_A);
    const off2 = syncBus.onCrosshair(fn, SRC_A); // 重复注册被 Map 去重
    syncBus.emitCrosshair(1, SRC_B);
    expect(fn).toHaveBeenCalledTimes(1);
    off1(); // 一次退订即移除（Map 语义）
    syncBus.emitCrosshair(2, SRC_B);
    tick();
    expect(fn).toHaveBeenCalledTimes(1);
    off2();
  });
});

describe('syncBus 跨图表防环（sourceId 显式过滤）', () => {
  /**
   * 复刻 Chart.tsx 的联动装配（时间空间载荷）：
   *   chartA.onCrosshairTime(t) → syncBus.emitCrosshair(t, sourceIdA)
   *     → chartB 的订阅者（sourceIdB）收到 → setSyncCrosshair(t)
   *   chartA.onViewportCommit() → syncBus.emitViewport(getViewportTimeRange(), sourceIdA)
   *     → chartB 的订阅者（sourceIdB）收到 → setViewportTimeRange(range)
   * sourceId 相同即忽略：即使某天接收路径里加了提交逻辑，也不会形成回声环。
   */
  function bridgeTwoCharts() {
    const chartA = { crosshair: null as number | null, viewport: null as ViewportTimeRange | null, selfEmits: 0 };
    const chartB = { crosshair: null as number | null, viewport: null as ViewportTimeRange | null };
    // A 自己也订阅同一 sourceId（模拟联动回环场景：自发事件不得回送）
    const offASelfC = syncBus.onCrosshair((t) => {
      chartA.selfEmits++;
      chartA.crosshair = t;
    }, SRC_A);
    const offASelfV = syncBus.onViewport((v) => {
      chartA.selfEmits++;
      chartA.viewport = v;
    }, SRC_A);
    const offBC = syncBus.onCrosshair((t) => {
      chartB.crosshair = t;
    }, SRC_B);
    const offBV = syncBus.onViewport((v) => {
      chartB.viewport = v;
    }, SRC_B);
    const publishA = (t: number | null, range: ViewportTimeRange) => {
      syncBus.emitCrosshair(t, SRC_A);
      syncBus.emitViewport(range, SRC_A);
    };
    return {
      chartA,
      chartB,
      publishA,
      cleanup: () => {
        offASelfC();
        offASelfV();
        offBC();
        offBV();
      },
    };
  }

  it('A 发布 → B 收到；A 自己的订阅者被 sourceId 过滤（显式防环，无回声）', () => {
    const { chartA, chartB, publishA, cleanup } = bridgeTwoCharts();
    const range = { fromTime: 1_700_000_000_000, toTime: 1_700_000_600_000 };
    publishA(999, range);
    expect(chartB.crosshair).toBe(999);
    expect(chartB.viewport).toEqual(range);
    expect(chartA.selfEmits).toBe(0); // 自己发 → 自己收不到
    cleanup();
  });

  it('连续 1000 次发布不递归、不栈溢出；末态经 trailing 送达且全程无回声', () => {
    const { chartA, chartB, publishA, cleanup } = bridgeTwoCharts();
    for (let i = 0; i < 1000; i++) publishA(i, { fromTime: i, toTime: i + 60_000 });
    tick(); // trailing 末态
    expect(chartB.crosshair).toBe(999);
    expect(chartB.viewport).toEqual({ fromTime: 999, toTime: 999 + 60_000 });
    expect(chartA.selfEmits).toBe(0);
    cleanup();
  });
});

describe('syncBus 分发隔离（单个 handler 异常不中断整链）', () => {
  it('一个 handler 抛错 → 后续 handler 仍收到，异常被记录而非吞掉', () => {
    const after = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const offBad = syncBus.onCrosshair(() => {
      throw new Error('boom');
    }, SRC_A);
    const offAfter = syncBus.onCrosshair(after, SRC_A); // 与发布者不同源 → 应收到
    expect(() => syncBus.emitCrosshair(1, SRC_B)).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled(); // 不静默：记入 console.error
    offBad();
    offAfter();
    errSpy.mockRestore();
  });
});

describe('syncBus 统一限频（30Hz：leading 即时 + trailing 末态）', () => {
  it('高频发布被合并：leading 一次 + trailing 末态一次，中间态丢弃', () => {
    const handler = vi.fn();
    const off = syncBus.onViewport(handler, SRC_A);
    syncBus.emitViewport({ fromTime: 0, toTime: 60_000 }, SRC_B); // leading
    for (let i = 1; i < 100; i++) syncBus.emitViewport({ fromTime: i, toTime: i + 60_000 }, SRC_B);
    expect(handler).toHaveBeenCalledTimes(1); // 30Hz 间隔内全部合并
    tick();
    expect(handler).toHaveBeenCalledTimes(2); // trailing 只送末态
    expect(handler).toHaveBeenLastCalledWith({ fromTime: 99, toTime: 99 + 60_000 }, SRC_B);
    off();
  });

  it('跨过 30Hz 间隔的发布各自即时送达（不合并）', () => {
    const handler = vi.fn();
    const off = syncBus.onCrosshair(handler, SRC_A);
    syncBus.emitCrosshair(1, SRC_B);
    tick();
    syncBus.emitCrosshair(2, SRC_B);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, 1, SRC_B);
    expect(handler).toHaveBeenNthCalledWith(2, 2, SRC_B);
    off();
  });

  it('退订后 trailing 不复活已退订的 handler（分发读flush时的订阅表）', () => {
    const handler = vi.fn();
    const off = syncBus.onViewport(handler, SRC_A);
    syncBus.emitViewport({ fromTime: 0, toTime: 1 }, SRC_B); // leading
    off(); // leading 之后、trailing 之前退订
    syncBus.emitViewport({ fromTime: 2, toTime: 3 }, SRC_B);
    tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ fromTime: 0, toTime: 1 }, SRC_B);
  });

  it('浏览器路径：rAF 合帧唤醒 trailing——间隔未到等下一帧，到点才补发', () => {
    const frames: Array<(t: number) => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const handler = vi.fn();
    const off = syncBus.onViewport(handler, SRC_A);
    syncBus.emitViewport({ fromTime: 0, toTime: 1 }, SRC_B); // leading
    syncBus.emitViewport({ fromTime: 1, toTime: 2 }, SRC_B); // 间隔内 → 合并
    expect(handler).toHaveBeenCalledTimes(1);
    frames.shift()!(0); // 第一帧：距 leading 0ms < 33.3ms → 继续等
    expect(handler).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1); // 又排了一帧
    vi.advanceTimersByTime(40); // 时钟推进过 30Hz 间隔
    frames.shift()!(40);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith({ fromTime: 1, toTime: 2 }, SRC_B);
    off();
  });
});
