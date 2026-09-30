import { describe, expect, it, vi } from 'vitest';
import { AvwapAnchorDrop, type AvwapAnchorHost } from '@/engine/renderer/avwapAnchor';
import { earlyFinishMinPoints } from '@/engine/drawing/placingRules';
import type { IndicatorInstance } from '@/indicators/core/instance';

/**
 * P2-B 红线拆分单测：AvwapAnchorDrop 编排 + placingRules 提前收尾规则。
 * host 契约以记录型假件注入（无 canvas/视图依赖），钉住五个接线的迁移语义；
 * 与 drawing-avwap.test.ts 的 ChartController 集成用例互为补充（那边钉端到端）。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();

function makeHost(inst?: IndicatorInstance) {
  const anchored: Array<[string, number]> = [];
  const selectModes: Array<[boolean, ((index: number) => void) | null]> = [];
  const host: AvwapAnchorHost = {
    lookupIndicator: vi.fn(() => inst),
    setBarSelectMode: vi.fn((on: boolean, cb: ((index: number) => void) | null) => selectModes.push([on, cb])),
    // 落点解析：index 7 → 某根真实 bar 时间；其余 null（无 bar 不消费）
    barTimeAt: vi.fn((idx: number) => (idx === 7 ? T0 + 3 * 60_000 : null)),
    onAnchored: vi.fn((uid: string, barTime: number) => anchored.push([uid, barTime])),
    invalidate: vi.fn(),
  };
  return { host, anchored, selectModes };
}

const AVWAP_INST = { id: 'avwap', params: { anchorTime: T0, color: '#ff9800' } } as unknown as IndicatorInstance;
const VWAP_INST = { id: 'vwap', params: {} } as unknown as IndicatorInstance;

describe('AvwapAnchorDrop：maybeBegin（addIndicator 接线）', () => {
  it('avwap 无锚点参数 → 进入选 bar 模式并请求重绘', () => {
    const { host, selectModes } = makeHost();
    new AvwapAnchorDrop(host).maybeBegin('avwap', 'ind_1', { params: { color: '#f00' } });
    expect(selectModes).toHaveLength(1);
    expect(selectModes[0][0]).toBe(true); // 开启选 bar 模式
    expect(typeof selectModes[0][1]).toBe('function'); // 落点回调已登记
    expect(host.invalidate).toHaveBeenCalledTimes(1);
  });

  it('非 avwap / 已带锚点 / uid 为空 → 不进入选 bar 模式', () => {
    for (const [id, uid, options] of [
      ['vwap', 'ind_1', undefined],
      ['avwap', 'ind_1', { params: { anchorTime: T0 } }],
      ['avwap', null, undefined],
    ] as Array<[string, string | null, { params: Record<string, number> } | undefined]>) {
      const { host, selectModes } = makeHost();
      new AvwapAnchorDrop(host).maybeBegin(id, uid, options);
      expect(selectModes).toHaveLength(0);
      expect(host.invalidate).not.toHaveBeenCalled();
    }
  });

  it('选 bar 模式落点：bar 时间经 onAnchored 写回，状态消费后不再触发', () => {
    const { host, anchored, selectModes } = makeHost();
    const drop = new AvwapAnchorDrop(host);
    drop.maybeBegin('avwap', 'ind_1');
    const onBar = selectModes[0][1]!;
    onBar(7); // 单击图表落点
    expect(anchored).toEqual([['ind_1', T0 + 3 * 60_000]]);
    onBar(7); // 状态已清空，不重复放置
    expect(anchored).toHaveLength(1);
  });

  it('落点无 bar（barTimeAt = null）：不消费不写锚点', () => {
    const { host, anchored, selectModes } = makeHost();
    const drop = new AvwapAnchorDrop(host);
    drop.maybeBegin('avwap', 'ind_1');
    selectModes[0][1]!(3); // 无对应 bar
    expect(anchored).toHaveLength(0);
    // 状态仍活跃：换有效落点照常放置
    selectModes[0][1]!(7);
    expect(anchored).toEqual([['ind_1', T0 + 3 * 60_000]]);
  });
});

describe('AvwapAnchorDrop：maybeCancel / cancelIfActive（removeIndicator / setActiveTool / Esc 接线）', () => {
  it('移除被锚定实例：退出选 bar 模式', () => {
    const { host, selectModes } = makeHost();
    const drop = new AvwapAnchorDrop(host);
    drop.maybeBegin('avwap', 'ind_1');
    drop.maybeCancel('ind_1');
    expect(selectModes[1]).toEqual([false, null]);
  });

  it('移除非锚定实例：不扰动选 bar 模式', () => {
    const { host, selectModes } = makeHost();
    const drop = new AvwapAnchorDrop(host);
    drop.maybeBegin('avwap', 'ind_1');
    drop.maybeCancel('other');
    expect(selectModes).toHaveLength(1); // 仍只有开启那次
  });

  it('cancelIfActive：进行中放弃并退出选 bar 模式；空闲时为无操作', () => {
    const { host, selectModes } = makeHost();
    const drop = new AvwapAnchorDrop(host);
    drop.cancelIfActive(); // 空闲：无操作
    expect(selectModes).toHaveLength(0);
    drop.maybeBegin('avwap', 'ind_1');
    drop.cancelIfActive();
    expect(selectModes[1]).toEqual([false, null]);
    // 放弃后落点不再被消费
    selectModes[0][1]!(7);
    expect(host.onAnchored).not.toHaveBeenCalled();
  });
});

describe('AvwapAnchorDrop：mergeAnchorParam（updateIndicator 锚点保持接线）', () => {
  it('avwap 参数不含 anchorTime：沿用实例当前值（改色不丢锚）', () => {
    const { host } = makeHost(AVWAP_INST);
    const merged = new AvwapAnchorDrop(host).mergeAnchorParam('ind_1', { params: { color: '#ff0000' } });
    expect(merged.params).toEqual({ color: '#ff0000', anchorTime: T0 });
  });

  it('avwap 已带 anchorTime / 非 avwap / 无 params：原样返回', () => {
    const avwapHost = makeHost(AVWAP_INST).host;
    const vwapHost = makeHost(VWAP_INST).host;
    const avwap = new AvwapAnchorDrop(avwapHost);
    const vwap = new AvwapAnchorDrop(vwapHost);
    const withAnchor = { params: { anchorTime: 999 } };
    expect(avwap.mergeAnchorParam('ind_1', withAnchor)).toBe(withAnchor); // 传入锚点原样保留
    const vwapOpts = { params: { color: '#fff' } };
    expect(vwap.mergeAnchorParam('ind_2', vwapOpts)).toBe(vwapOpts); // 非 avwap 不合并
    const noParams = {};
    expect(avwap.mergeAnchorParam('ind_1', noParams)).toBe(noParams); // 缺 params 不合并
  });
});

describe('earlyFinishMinPoints（finishPlacing 提前收尾判定）', () => {
  it('多边形 3 / 艾略特波浪 2 / 其余 0', () => {
    expect(earlyFinishMinPoints('polygon')).toBe(3);
    expect(earlyFinishMinPoints('elliott-wave')).toBe(2);
    expect(earlyFinishMinPoints('path')).toBe(0);
    expect(earlyFinishMinPoints('trendline')).toBe(0);
    expect(earlyFinishMinPoints(null)).toBe(0);
  });
});
