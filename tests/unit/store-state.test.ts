// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';

/**
 * store 状态与布局快照迁移单测（P2-C）。
 * 覆盖：
 * 1. chartConfigStore / uiStore——App.tsx 本地 state 下沉后的 setter/toggle 契约；
 * 2. layoutStore——单元格最大化（Alt+Enter / 双击标题区）、行列比例（边缘拖拽）、
 *    多图表联动开关（syncBus 三 channel 发布侧裁决）；
 * 3. layoutSnapshot 布局元数据（meta）——归一化兜底、v1 旧档（无 meta 字段）迁移默认值、
 *    采集/应用往返、commitMeta 写回激活布局并落盘（刷新后经恢复路径持久）。
 *
 * jsdom 环境：readFile 在 layoutStore 模块初始化时读 localStorage——旧档种子必须早于
 * 模块导入写入，故本文件用顶层 await 延后动态 import（静态 import 会先于种子求值）。
 */

const STORAGE_KEY = 'tradingpa.layouts.v1';

/** v1 旧档：无 meta 字段（P2-C 之前的存档格式），4 分布局 + 两个单元格 */
const V1_FILE = {
  version: 1,
  activeId: 'layout-old',
  items: [
    {
      id: 'layout-old',
      name: '旧档',
      savedAt: 1,
      snapshot: {
        version: 1,
        name: '旧档',
        savedAt: 1,
        layout: 4,
        activeInstrumentId: null,
        timeframe: '5m',
        chartType: 'candles',
        indicators: [],
        drawings: null,
        theme: 'dark',
        cells: [
          { symbol: 'BTCUSDT', timeframe: '5m', chartType: 'candles' },
          { symbol: 'ETHUSDT', timeframe: '5m', chartType: 'candles' },
        ],
      },
    },
  ],
};

localStorage.setItem(STORAGE_KEY, JSON.stringify(V1_FILE));

const { useLayoutStore } = await import('@/store/layoutStore');
const { useChartConfigStore } = await import('@/store/chartConfigStore');
const { useUiStore } = await import('@/store/uiStore');
const {
  normalizeMeta,
  defaultMeta,
  captureMeta,
  applyMeta,
  fitRatios,
  MIN_TRACK_RATIO,
} = await import('@/store/layoutSnapshot');

describe('chartConfigStore：图表配置下沉契约', () => {
  it('setter 与 toggle 语义（原 App.tsx 本地 state 行为不变）', () => {
    const st = useChartConfigStore.getState();
    st.setTimeframe('15m');
    expect(useChartConfigStore.getState().timeframe).toBe('15m');
    st.setChartType('line');
    expect(useChartConfigStore.getState().chartType).toBe('line');
    expect(useChartConfigStore.getState().logScale).toBe(false);
    st.toggleLog();
    expect(useChartConfigStore.getState().logScale).toBe(true);
    st.togglePercent();
    expect(useChartConfigStore.getState().percent).toBe(true);
    expect(useChartConfigStore.getState().autoScale).toBe(true);
    st.toggleAutoScale();
    expect(useChartConfigStore.getState().autoScale).toBe(false);
    st.toggleDrawingsLocked();
    expect(useChartConfigStore.getState().drawingsLocked).toBe(true);
    st.toggleHideDrawings();
    expect(useChartConfigStore.getState().hideDrawings).toBe(true);
    st.toggleHideStudies();
    expect(useChartConfigStore.getState().hideStudies).toBe(true);
  });

  it('图例选项增量合入', () => {
    const before = useChartConfigStore.getState().legendOpts;
    useChartConfigStore.getState().setLegendOpts({ showVolume: false });
    const after = useChartConfigStore.getState().legendOpts;
    expect(after.showVolume).toBe(false);
    expect(after.showOHLC).toBe(before.showOHLC); // 其余字段不动
  });
});

describe('uiStore：对话框开关收敛', () => {
  it('开合状态与周期浮层预填', () => {
    const st = useUiStore.getState();
    st.setCommandOpen(true);
    expect(useUiStore.getState().commandOpen).toBe(true);
    st.openInterval('15');
    expect(useUiStore.getState().intervalOpen).toBe(true);
    expect(useUiStore.getState().intervalInitial).toBe('15');
    st.setIntervalOpen(false);
    expect(useUiStore.getState().intervalOpen).toBe(false);
    st.setChartMenu({ price: 1, x: 2, y: 3 });
    expect(useUiStore.getState().chartMenu).toEqual({ price: 1, x: 2, y: 3 });
    st.setLegendMenu({ x: 4, y: 5 });
    expect(useUiStore.getState().legendMenu).toEqual({ x: 4, y: 5 });
    st.setDrawingMenu({ id: 'd1', x: 6, y: 7 });
    expect(useUiStore.getState().drawingMenu).toEqual({ id: 'd1', x: 6, y: 7 });
    st.bumpCustomVer();
    expect(useUiStore.getState().customVer).toBe(1);
  });
});

describe('layoutStore：单元格最大化', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetToDefault();
  });

  it('toggleMaximizeCell 同索引再触发 = 还原；越界索引忽略', () => {
    useLayoutStore.getState().setLayout(4);
    const st = useLayoutStore.getState();
    st.toggleMaximizeCell(2);
    expect(useLayoutStore.getState().maximizedCell).toBe(2);
    st.toggleMaximizeCell(2);
    expect(useLayoutStore.getState().maximizedCell).toBeNull();
    st.toggleMaximizeCell(99); // 越界（布局只有 4 格）忽略
    expect(useLayoutStore.getState().maximizedCell).toBeNull();
    st.toggleMaximizeCell(1);
    st.exitMaximize();
    expect(useLayoutStore.getState().maximizedCell).toBeNull();
  });
});

describe('layoutStore：行列比例（边缘拖拽调比）', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetToDefault();
  });

  it('setLayout 按新档行列数重置等分比例并退出最大化', () => {
    useLayoutStore.getState().setLayout(4);
    useLayoutStore.getState().toggleMaximizeCell(1);
    useLayoutStore.getState().resizeTrack('col', 0, 2, 1);
    expect(useLayoutStore.getState().colRatios).toEqual([2, 1]);
    useLayoutStore.getState().setLayout(6); // 3 列 2 行
    const s = useLayoutStore.getState();
    expect(s.maximizedCell).toBeNull();
    expect(s.colRatios).toEqual([1, 1, 1]);
    expect(s.rowRatios).toEqual([1, 1]);
  });

  it('resizeTrack 原子调整相邻两轨并钳制最小比例；越界索引不改动', () => {
    useLayoutStore.getState().setLayout(4);
    useLayoutStore.getState().resizeTrack('col', 0, 0.05, 2.95);
    expect(useLayoutStore.getState().colRatios).toEqual([MIN_TRACK_RATIO, 2.95]);
    useLayoutStore.getState().resizeTrack('row', 5, 1, 1); // 行索引越界
    expect(useLayoutStore.getState().rowRatios).toEqual([1, 1]);
  });
});

describe('layoutStore：多图表联动开关', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetToDefault();
  });

  it('三 channel 独立切换，默认品种/周期开、画线关', () => {
    const st = useLayoutStore.getState();
    expect(st.syncSymbol).toBe(true);
    expect(st.syncInterval).toBe(true);
    expect(st.syncDrawings).toBe(false);
    st.setSyncChannel('drawings', true);
    expect(useLayoutStore.getState().syncDrawings).toBe(true);
    expect(useLayoutStore.getState().syncSymbol).toBe(true);
    st.setSyncChannel('symbol', false);
    expect(useLayoutStore.getState().syncSymbol).toBe(false);
    st.setSyncChannel('interval', false);
    expect(useLayoutStore.getState().syncInterval).toBe(false);
  });
});

describe('layoutSnapshot：布局元数据归一化（v1 旧档迁移）', () => {
  it('旧档无 meta 字段 → 回落默认值（比例等分、无最大化、默认开关）', () => {
    expect(normalizeMeta(undefined, 4)).toEqual(defaultMeta(2, 2));
  });

  it('坏数据逐字段兜底：最大化越界 / 比例长度不符 / 非数组', () => {
    const m = normalizeMeta(
      { maximizedCell: 99, syncSymbol: false, syncDrawings: true, colRatios: [1, -2, 3], rowRatios: 'x' },
      4,
    );
    expect(m.maximizedCell).toBeNull();
    expect(m.syncSymbol).toBe(false);
    expect(m.syncDrawings).toBe(true);
    expect(m.colRatios).toEqual([1, 1]); // 长度 3 ≠ 2 → 等分
    expect(m.rowRatios).toEqual([1, 1]); // 非数组 → 等分
  });

  it('fitRatios 逐轨钳制最小比例；单图布局 maximizedCell 强制 null', () => {
    expect(fitRatios([0.05, 3], 2)).toEqual([MIN_TRACK_RATIO, 3]);
    expect(normalizeMeta({ maximizedCell: 0 }, 1).maximizedCell).toBeNull();
  });
});

describe('layoutSnapshot：meta 采集 / 应用 / 落盘', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetToDefault();
  });

  it('读档迁移：v1 旧档条目读入后 meta 为默认值，loadLayout 应用到 store', () => {
    // 模块初始化时已读入种子旧档（activeId = layout-old，无 meta 字段）
    const item = useLayoutStore.getState().savedLayouts.find((l) => l.id === 'layout-old');
    expect(item).toBeDefined();
    expect(item!.meta).toEqual(defaultMeta(2, 2));
    expect(useLayoutStore.getState().loadLayout('layout-old')).toBe(true);
    const s = useLayoutStore.getState();
    expect(s.layout).toBe(4);
    expect(s.cells).toHaveLength(2);
    expect(s.colRatios).toEqual([1, 1]);
    expect(s.maximizedCell).toBeNull();
    expect(s.syncSymbol).toBe(true);
  });

  it('captureMeta / applyMeta 往返：比例、最大化与开关原样恢复', () => {
    useLayoutStore.getState().setLayout(4);
    useLayoutStore.getState().resizeTrack('col', 0, 2.5, 0.5);
    useLayoutStore.getState().toggleMaximizeCell(1);
    useLayoutStore.getState().setSyncChannel('drawings', true);
    const meta = captureMeta();
    expect(meta).toEqual({
      maximizedCell: 1,
      syncSymbol: true,
      syncInterval: true,
      syncDrawings: true,
      colRatios: [2.5, 0.5],
      rowRatios: [1, 1],
    });
    // 打乱状态后按 meta 应用恢复
    useLayoutStore.getState().setLayout(8);
    applyMeta(meta, 4);
    const s = useLayoutStore.getState();
    expect(s.maximizedCell).toBe(1);
    expect(s.colRatios).toEqual([2.5, 0.5]);
    expect(s.syncDrawings).toBe(true);
  });

  it('commitMeta 写回激活布局条目并落盘（刷新后经恢复路径持久）', () => {
    expect(useLayoutStore.getState().saveCurrentLayout('测试布局')).toBeTruthy();
    useLayoutStore.getState().setLayout(4);
    useLayoutStore.getState().resizeTrack('col', 0, 3, 1);
    useLayoutStore.getState().commitMeta();
    const activeId = useLayoutStore.getState().activeLayoutId!;
    const active = useLayoutStore.getState().savedLayouts.find((l) => l.id === activeId);
    expect(active!.meta.colRatios).toEqual([3, 1]);
    // 落盘内容可解析回读（localStorage 中的激活布局条目带上 meta）
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as typeof V1_FILE;
    const stored = raw.items.find((i) => i.id === activeId);
    expect(stored).toBeDefined();
    expect((stored as unknown as { meta: { colRatios: number[] } }).meta.colRatios).toEqual([3, 1]);
  });
});
