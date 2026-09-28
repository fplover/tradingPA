import { describe, expect, it, vi } from 'vitest';
import { syncBus } from '@/store/syncBus';

/**
 * syncBus 防环与限频用例。
 *
 * 注意：当前实现（23 行）没有 sourceId 显式防环、也没有内建限频——
 * 防环靠「接收方不再发布」的调用点不变式（Chart.tsx：setSyncViewport/setSyncCrosshair 只改状态不 emit），
 * 限频靠 Chart.tsx onCrosshairTime 里的 32ms 闭包。
 * 因此本文件写成对当前实现的真实断言（characterization）：
 * 既锁定现有契约（两通道广播语义、退订、按 Chart.tsx 模式桥接无环），
 * 也把「无 sourceId / 无 try-catch 隔离 / 无内建限频」的现状钉成 change-detector，
 * 供 D 批次 syncBus 升级（SPEC §5：时间空间载荷 + sourceId + 统一限频）时定向更新。
 */

describe('syncBus 通道语义', () => {
  it('crosshair 通道：发布 → 订阅者收到时间；退订后不再收到', () => {
    const seen: Array<number | null> = [];
    const off = syncBus.onCrosshair((t) => seen.push(t));
    syncBus.emitCrosshair(1_700_000_000_000);
    syncBus.emitCrosshair(null);
    expect(seen).toEqual([1_700_000_000_000, null]);
    off();
    syncBus.emitCrosshair(42);
    expect(seen).toEqual([1_700_000_000_000, null]); // 退订生效
  });

  it('viewport 通道：发布 → 订阅者收到 {first, spacing}', () => {
    const seen: Array<{ first: number; spacing: number }> = [];
    const off = syncBus.onViewport((v) => seen.push(v));
    syncBus.emitViewport({ first: 10, spacing: 8 });
    syncBus.emitViewport({ first: -5, spacing: 2.5 });
    expect(seen).toEqual([
      { first: 10, spacing: 8 },
      { first: -5, spacing: 2.5 },
    ]);
    off();
    syncBus.emitViewport({ first: 0, spacing: 1 });
    expect(seen).toHaveLength(2);
  });

  it('两通道互相隔离：crosshair 发布不触发 viewport 订阅者，反之亦然', () => {
    const onCross = vi.fn();
    const onVp = vi.fn();
    const offC = syncBus.onCrosshair(onCross);
    const offV = syncBus.onViewport(onVp);
    syncBus.emitCrosshair(123);
    syncBus.emitViewport({ first: 1, spacing: 2 });
    expect(onCross).toHaveBeenCalledTimes(1);
    expect(onCross).toHaveBeenCalledWith(123);
    expect(onVp).toHaveBeenCalledTimes(1);
    expect(onVp).toHaveBeenCalledWith({ first: 1, spacing: 2 });
    offC();
    offV();
  });

  it('广播语义：多个订阅者按注册顺序全部收到', () => {
    const order: string[] = [];
    const off1 = syncBus.onCrosshair(() => order.push('a'));
    const off2 = syncBus.onCrosshair(() => order.push('b'));
    syncBus.emitCrosshair(1);
    expect(order).toEqual(['a', 'b']);
    off1();
    off2();
  });

  it('同一处理函数重复订阅只生效一次（Set 去重）', () => {
    const fn = vi.fn();
    const off1 = syncBus.onCrosshair(fn);
    const off2 = syncBus.onCrosshair(fn); // 重复注册被 Set 去重
    syncBus.emitCrosshair(1);
    expect(fn).toHaveBeenCalledTimes(1);
    off1(); // 一次退订即移除（Set 语义）
    syncBus.emitCrosshair(2);
    expect(fn).toHaveBeenCalledTimes(1);
    off2();
  });
});

describe('syncBus 跨图表防环（按 Chart.tsx 真实桥接模式）', () => {
  /**
   * 复刻 Chart.tsx 的联动装配：
   *   chart.onCrosshairTime(t) → syncBus.emitCrosshair(t) → 另一图 setSyncCrosshair(t)
   *   chart.onViewportCommit(v) → syncBus.emitViewport(v) → 另一图 setSyncViewport(v)
   * 接收侧只改自身状态、不再 emit（当前不变式）→ 无回声、无环。
   */
  function bridgeTwoCharts() {
    const chartA = { crosshair: null as number | null, viewport: null as { first: number; spacing: number } | null, emits: 0 };
    const chartB = { crosshair: null as number | null, viewport: null as { first: number; spacing: number } | null, emits: 0 };
    // A 的本地交互 → 发布
    const offA = syncBus.onViewport(() => {});
    const offB = syncBus.onViewport(() => {});
    const offC = syncBus.onCrosshair(() => {});
    const offD = syncBus.onCrosshair(() => {});
    const publishA = (t: number | null, v: { first: number; spacing: number }) => {
      chartA.emits += 2;
      syncBus.emitCrosshair(t);
      syncBus.emitViewport(v);
    };
    // B 订阅 → 只应用状态，不回写（当前实现的不变式）
    const offBC = syncBus.onCrosshair((t) => {
      chartB.crosshair = t;
    });
    const offBV = syncBus.onViewport((v) => {
      chartB.viewport = v;
    });
    return {
      chartA,
      chartB,
      publishA,
      cleanup: () => {
        offA();
        offB();
        offC();
        offD();
        offBC();
        offBV();
      },
    };
  }

  it('A 发布 → B 收到且不回写：单次交互各传播一次，无环', () => {
    const { chartB, publishA, cleanup } = bridgeTwoCharts();
    publishA(999, { first: 3, spacing: 8 });
    expect(chartB.crosshair).toBe(999);
    expect(chartB.viewport).toEqual({ first: 3, spacing: 8 });
    cleanup();
  });

  it('连续 1000 次发布不递归、不栈溢出（接收侧恒定不回写）', () => {
    const { chartB, publishA, cleanup } = bridgeTwoCharts();
    for (let i = 0; i < 1000; i++) publishA(i, { first: i, spacing: 8 });
    expect(chartB.crosshair).toBe(999);
    cleanup();
  });
});

describe('syncBus 现状刻画（change-detector，D 批次升级时定向更新）', () => {
  it('现状：无 sourceId——订阅者会收到自己触发的发布（回声不过滤）', () => {
    // 当前总线不做来源过滤：emit 会送达全部订阅者，包含发布者自己注册的处理器。
    // Chart.tsx 之所以无环，是因为接收路径（setSyncViewport）不再 emit。
    const self = vi.fn();
    const off = syncBus.onViewport(self);
    syncBus.emitViewport({ first: 1, spacing: 2 });
    expect(self).toHaveBeenCalledTimes(1); // 自己发 → 自己收（现状）
    off();
  });

  it('现状：无异常隔离——一个处理器抛错会中断后续处理器', () => {
    const after = vi.fn();
    const offBad = syncBus.onCrosshair(() => {
      throw new Error('boom');
    });
    const offAfter = syncBus.onCrosshair(after);
    expect(() => syncBus.emitCrosshair(1)).toThrow('boom');
    expect(after).not.toHaveBeenCalled(); // 现状：无 try/catch，链式广播被中断
    offBad();
    offAfter();
  });

  it('现状：无限频——高频发布原样送达每次（限频在 Chart.tsx 32ms 闭包，不在总线）', () => {
    const handler = vi.fn();
    const off = syncBus.onViewport(handler);
    for (let i = 0; i < 100; i++) syncBus.emitViewport({ first: i, spacing: 8 });
    expect(handler).toHaveBeenCalledTimes(100); // 总线层面无合并无限频（现状）
    off();
  });
});
