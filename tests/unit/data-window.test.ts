import { describe, expect, it } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { buildDataWindowSnapshot, type DataWindowInput } from '@/engine/renderer/dataWindow';
import type { Crosshair } from '@/engine/crosshair/Crosshair';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { DrawContext } from '@/engine/drawing/coords';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { Bar } from '@/types/market';

/**
 * 数据窗口快照（三期-C2）单测：锁定两条引擎侧承重口径 + 三道既有过滤——
 * ① 显示序列 index 空间封在快照内（直接带 bar 对象，越界即 null，不给「裸 index + 裸序列」错配）；
 * ② 回放态把游标之右的未来 bar 钳到游标；
 * ③ hideStudies / isVisibleOn(timeframeId) / drawing.visible 三道过滤逐一生效。
 * 指标用最小 stub（computeWindow 恒返回单 plot 值），只验快照接线不重跑指标数学。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

const BARS: Bar[] = [
  { time: T0, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: T0 + IV, open: 104, high: 108, low: 103, close: 101, volume: 900 },
  { time: T0 + 2 * IV, open: 101, high: 105, low: 100, close: 103, volume: 1500 },
  { time: T0 + 3 * IV, open: 103, high: 104, low: 99, close: 100, volume: 700 },
  { time: T0 + 4 * IV, open: 100, high: 107, low: 97, close: 105, volume: 2000 },
  { time: T0 + 5 * IV, open: 105, high: 106, low: 102, close: 102, volume: 800 },
];

const W = 460;
const H = 300;

function makeDctx(): DrawContext {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(97, 108);
  return { viewport, priceScale, series, geo: { chartW: W, chartH: H } };
}

function crosshair(partial: Partial<Crosshair>): Crosshair {
  return { visible: false, barIndex: -1, price: 0, x: 0, ...partial } as unknown as Crosshair;
}

/** 单 plot stub 指标：computeWindow 恒返回 { p: [42] }，ctxFrom=to → 该 index 读数 42 */
function makeStudy(uid: string, visibleOn: boolean): IndicatorInstance {
  return {
    uid,
    name: `Stub-${uid}`,
    precision: 2,
    isVisibleOn: () => visibleOn,
    isPlotHidden: () => false,
    def: { plots: [{ key: 'p', label: 'P' }] },
    computeWindow: (_bars: readonly Bar[], _from: number, to: number) => ({ outputs: { p: [42] }, ctxFrom: to }),
  } as unknown as IndicatorInstance;
}

const P = (time: number, price: number): DrawingPoint => ({ time, price });

function hline(id: string, price: number, visible: boolean): Drawing {
  return {
    id,
    type: 'hline',
    points: [P(T0 + 2 * IV, price)],
    locked: false,
    visible,
    style: {},
  } as unknown as Drawing;
}

function input(over: Partial<DataWindowInput> = {}): DataWindowInput {
  return {
    crosshair: crosshair({}),
    hoveredPaneId: 'main',
    panes: [{ id: 'main', indicators: [] }],
    bars: BARS,
    currentIndex: BARS.length - 1,
    replayIndex: null,
    hideStudies: false,
    timeframeId: '1m',
    drawings: [],
    dctx: makeDctx(),
    ...over,
  };
}

describe('光标不在图上：回落 currentIndex，fromCrosshair=false，无光标价', () => {
  it('取 currentIndex 的 bar，cursorPrice=null', () => {
    const s = buildDataWindowSnapshot(input({ currentIndex: 4, crosshair: crosshair({ visible: false }) }));
    expect(s.fromCrosshair).toBe(false);
    expect(s.index).toBe(4);
    expect(s.bar).toEqual(BARS[4]);
    expect(s.cursorPrice).toBeNull();
  });
});

describe('跟随十字光标：取 crosshair.barIndex，fromCrosshair=true，带光标价', () => {
  it('index 来自 crosshair 而非 currentIndex，bar 是显示序列同位元素', () => {
    const s = buildDataWindowSnapshot(
      input({ currentIndex: 4, crosshair: crosshair({ visible: true, barIndex: 2, price: 101.5, x: 120 }) }),
    );
    expect(s.fromCrosshair).toBe(true);
    expect(s.index).toBe(2);
    expect(s.bar).toEqual(BARS[2]); // bar 取自入参显示序列的 index 位（快照内 `{ ...bar }` 克隆，避免交出内部对象）
    expect(s.bar).not.toBe(BARS[2]); // 克隆而非透传：调用方改快照 bar 不会污染引擎内部序列
    expect(s.cursorPrice).toBe(101.5);
  });
});

describe('index 越界：bar=null（不给裸 index 之外的对象）', () => {
  it('crosshair.barIndex 超范围 → null，index 原样', () => {
    const s = buildDataWindowSnapshot(
      input({ crosshair: crosshair({ visible: true, barIndex: 999, price: 100, x: 0 }) }),
    );
    expect(s.bar).toBeNull();
    expect(s.index).toBe(999);
  });
  it('非跟随且 currentIndex 超范围 → null', () => {
    const s = buildDataWindowSnapshot(input({ currentIndex: -1 }));
    expect(s.bar).toBeNull();
  });
});

describe('回放态钳制：游标之右的未来 bar 不可读', () => {
  it('跟随态 barIndex 5、游标 3 → 钳到 3', () => {
    const s = buildDataWindowSnapshot(
      input({ replayIndex: 3, crosshair: crosshair({ visible: true, barIndex: 5, price: 102, x: 200 }) }),
    );
    expect(s.index).toBe(3);
    expect(s.bar).toEqual(BARS[3]);
  });
  it('回落态 currentIndex 5、游标 3 → 钳到 3', () => {
    const s = buildDataWindowSnapshot(input({ replayIndex: 3, currentIndex: 5 }));
    expect(s.index).toBe(3);
  });
  it('游标在更右（不钳）时原样通过', () => {
    const s = buildDataWindowSnapshot(input({ replayIndex: 5, currentIndex: 3 }));
    expect(s.index).toBe(3);
  });
});

describe('指标过滤：hideStudies 与 isVisibleOn(timeframeId)', () => {
  it('hideStudies=true → studies 空，即使面板有可见指标', () => {
    const s = buildDataWindowSnapshot(
      input({
        hideStudies: true,
        panes: [{ id: 'main', indicators: [makeStudy('a', true)] }],
        crosshair: crosshair({ visible: true, barIndex: 2, price: 100, x: 100 }),
      }),
    );
    expect(s.studies).toEqual([]);
  });

  it('isVisibleOn=false 的指标被剔除；可见者带出单 plot 读数', () => {
    const s = buildDataWindowSnapshot(
      input({
        panes: [{ id: 'main', indicators: [makeStudy('hidden', false), makeStudy('shown', true)] }],
        crosshair: crosshair({ visible: true, barIndex: 2, price: 100, x: 100 }),
      }),
    );
    expect(s.studies.map((st) => st.uid)).toEqual(['shown']);
    expect(s.studies[0].precision).toBe(2);
    expect(s.studies[0].values).toEqual([{ label: 'P', value: 42 }]);
  });

  it('跨全部面板汇总指标（非仅悬浮面板）', () => {
    const s = buildDataWindowSnapshot(
      input({
        hoveredPaneId: 'sub',
        panes: [
          { id: 'main', indicators: [makeStudy('m1', true)] },
          { id: 'sub', indicators: [makeStudy('s1', true)] },
        ],
        crosshair: crosshair({ visible: true, barIndex: 2, price: 100, x: 100 }),
      }),
    );
    expect(s.studies.map((st) => st.uid)).toEqual(['m1', 's1']);
  });
});

describe('画线过滤：不可见者不进表；可见者带 drawingReadingsAt 读数', () => {
  it('visible=false 被剔除，visible=true 携锚价读数', () => {
    const s = buildDataWindowSnapshot(input({ drawings: [hline('keep', 100, true), hline('drop', 200, false)] }));
    expect(s.drawings.map((d) => d.id)).toEqual(['keep']);
    expect(s.drawings[0].readings).toEqual([{ label: '', value: 100 }]);
  });

  it('name 取工具标签（getToolDef），type 原样透传', () => {
    const s = buildDataWindowSnapshot(input({ drawings: [hline('k', 100, true)] }));
    expect(s.drawings[0].type).toBe('hline');
    expect(s.drawings[0].name).toBe('水平线');
  });
});

describe('面板归属：hoveredPaneId 命中该面板，未知 id 回落首面板', () => {
  it('未知 hoveredPaneId → panes[0].id', () => {
    const s = buildDataWindowSnapshot(
      input({
        hoveredPaneId: 'ghost',
        panes: [
          { id: 'main', indicators: [] },
          { id: 'sub', indicators: [] },
        ],
      }),
    );
    expect(s.paneId).toBe('main');
  });
  it('命中 → 该 id', () => {
    const s = buildDataWindowSnapshot(
      input({
        hoveredPaneId: 'sub',
        panes: [
          { id: 'main', indicators: [] },
          { id: 'sub', indicators: [] },
        ],
      }),
    );
    expect(s.paneId).toBe('sub');
  });
});
