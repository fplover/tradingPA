// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * store 状态与布局快照迁移单测（P2-C）。
 * 覆盖：
 * 1. chartConfigStore / uiStore——App.tsx 本地 state 下沉后的 setter/toggle 契约；
 * 2. layoutStore——单元格最大化（Alt+Enter / 双击标题区）、行列比例（边缘拖拽）、
 *    多图表联动开关（syncBus 三 channel 发布侧裁决）；
 * 3. layoutSnapshot 布局元数据（meta）——归一化兜底、v1 旧档（无 meta 字段）迁移默认值、
 *    采集/应用往返、commitMeta 写回激活布局并落盘（刷新后经恢复路径持久）；
 * 4. indicatorStore 指标模板（TV Templates）——多命名 CRUD、持久化往返、重名序号、
 *    旧单槽 key 迁移；indicatorTemplates 纯函数（重名解析 / 行排序 / 相对时间）。
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
const { useIndicatorStore } = await import('@/store/indicatorStore');
const { LEGACY_KEY, MAX_TEMPLATES, TEMPLATES_KEY, loadTemplates, relativeTime, resolveUniqueName, sortTemplates } =
  await import('@/store/indicatorTemplates');
const { normalizeMeta, defaultMeta, captureMeta, applyMeta, fitRatios, MIN_TRACK_RATIO } =
  await import('@/store/layoutSnapshot');

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

describe('indicatorStore：指标模板多命名 CRUD（TV Templates）', () => {
  beforeEach(() => {
    // 模板存档与其他 describe 的布局种子共用 localStorage，逐例清场防串台
    localStorage.removeItem(TEMPLATES_KEY);
    useIndicatorStore.setState({ templates: [] });
  });

  it('命名保存 → 落盘往返 → 应用（replaceAll）→ 重命名 → 删除', () => {
    const st = useIndicatorStore.getState();
    st.replaceAll([{ id: 'rsi', params: { length: 14 } }]);
    const id = st.saveTemplate('我的模板');

    const s1 = useIndicatorStore.getState();
    expect(s1.templates).toHaveLength(1);
    expect(s1.templates[0]).toMatchObject({ id, name: '我的模板', list: [{ id: 'rsi', params: { length: 14 } }] });

    // 持久化往返：经持久层重新读档（等价刷新后恢复）
    const reloaded = loadTemplates();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ id, name: '我的模板', list: [{ id: 'rsi', params: { length: 14 } }] });

    // 应用：整量替换 active（先打乱再按模板还原）
    st.replaceAll([
      { id: 'vol', params: {} },
      { id: 'ema', params: {} },
    ]);
    expect(st.loadTemplate(id)).toBe(true);
    expect(useIndicatorStore.getState().active).toEqual([{ id: 'rsi', params: { length: 14 } }]);
    // 未知 id 返回 false 且不动 active
    expect(st.loadTemplate('no-such-template')).toBe(false);
    expect(useIndicatorStore.getState().active).toEqual([{ id: 'rsi', params: { length: 14 } }]);

    // 重命名落盘
    st.renameTemplate(id, '新名字');
    expect(useIndicatorStore.getState().templates[0].name).toBe('新名字');
    expect(loadTemplates()[0].name).toBe('新名字');

    // 删除落盘；未知 id 删除不抛
    st.deleteTemplate(id);
    expect(useIndicatorStore.getState().templates).toHaveLength(0);
    expect(loadTemplates()).toHaveLength(0);
    st.deleteTemplate(id);
  });

  it('重名保存追加序号不覆盖；重命名避开其他模板占用名；空名回落默认名', () => {
    const st = useIndicatorStore.getState();
    st.replaceAll([{ id: 'rsi', params: {} }]);
    const first = st.saveTemplate('RSI 组合');
    st.replaceAll([{ id: 'ema', params: {} }]);
    const second = st.saveTemplate('RSI 组合');
    st.replaceAll([{ id: 'vol', params: {} }]);
    const third = st.saveTemplate('RSI 组合');

    const list = useIndicatorStore.getState().templates;
    // 最新在前，三条独立条目（序号不覆盖、内容各自独立）
    expect(list.map((t) => t.name)).toEqual(['RSI 组合 (3)', 'RSI 组合 (2)', 'RSI 组合']);
    expect(new Set(list.map((t) => t.id)).size).toBe(3);
    expect(list.find((t) => t.id === first)!.list[0].id).toBe('rsi');
    expect(list.find((t) => t.id === second)!.list[0].id).toBe('ema');
    expect(list.find((t) => t.id === third)!.list[0].id).toBe('vol');

    // 重命名到已占用名 → 解析到未占用序号，被占用的原名条目不动
    st.renameTemplate(first, 'RSI 组合 (2)');
    const renamed = useIndicatorStore.getState().templates.find((t) => t.id === first)!;
    expect(renamed.name).not.toBe('RSI 组合 (2)');
    expect(renamed.name.startsWith('RSI 组合 (2)')).toBe(true);
    expect(useIndicatorStore.getState().templates.filter((t) => t.name === 'RSI 组合 (2)')).toHaveLength(1);

    // 空名（trim 后）回落「未命名模板」
    st.renameTemplate(second, '   ');
    expect(useIndicatorStore.getState().templates.find((t) => t.id === second)!.name).toBe('未命名模板');
  });

  it('超出数量上限时仅保留最新 50 条', () => {
    const st = useIndicatorStore.getState();
    for (let i = 0; i < MAX_TEMPLATES + 3; i += 1) st.saveTemplate(`t${i}`);
    const list = useIndicatorStore.getState().templates;
    expect(list).toHaveLength(MAX_TEMPLATES);
    expect(list[0].name).toBe(`t${MAX_TEMPLATES + 2}`); // 最新在前
    expect(loadTemplates()).toHaveLength(MAX_TEMPLATES);
  });

  it('store 初始化读档：新 key 缺失时旧单槽迁为「默认模板」并写新 key 清旧 key', async () => {
    localStorage.removeItem(TEMPLATES_KEY);
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'rsi', params: { length: 14 } }]));
    vi.resetModules();
    const mod = await import('@/store/indicatorStore');
    const st = mod.useIndicatorStore.getState();
    expect(st.templates).toHaveLength(1);
    expect(st.templates[0]).toMatchObject({ name: '默认模板', list: [{ id: 'rsi', params: { length: 14 } }] });
    expect(localStorage.getItem(TEMPLATES_KEY)).toBeTruthy();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});

describe('indicatorTemplates：持久化层与纯函数', () => {
  beforeEach(() => {
    localStorage.removeItem(TEMPLATES_KEY);
    localStorage.removeItem(LEGACY_KEY);
  });

  it('旧单槽 key 迁为「默认模板」并写新 key、清旧 key', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'rsi', params: { length: 14 } }]));
    const list = loadTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: '默认模板', list: [{ id: 'rsi', params: { length: 14 } }] });
    expect(localStorage.getItem(TEMPLATES_KEY)).toBeTruthy();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('旧档损坏 / 空列表 → 不迁移不写新 key；无任何存档 → 空列表', () => {
    expect(loadTemplates()).toEqual([]);
    localStorage.setItem(LEGACY_KEY, '{broken');
    expect(loadTemplates()).toEqual([]);
    expect(localStorage.getItem(TEMPLATES_KEY)).toBeNull();
    localStorage.setItem(LEGACY_KEY, JSON.stringify([]));
    expect(loadTemplates()).toEqual([]);
    expect(localStorage.getItem(TEMPLATES_KEY)).toBeNull();
  });

  it('新 key 存在时旧 key 不迁移；坏条目逐条丢弃、params 缺省补空、savedAt 非数回落当前时间', () => {
    localStorage.setItem(
      TEMPLATES_KEY,
      JSON.stringify([
        { id: 't1', name: '可用', list: [{ id: 'rsi' }], savedAt: 5 },
        { id: '', name: '坏 id', list: [], savedAt: 1 },
        'not-an-object',
        { id: 't2', name: '缺 list', savedAt: 1 },
        { id: 't3', name: 'savedAt 非数', list: [], savedAt: 'x' },
      ]),
    );
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'ema', params: {} }]));
    const list = loadTemplates();
    expect(list.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(list[0].list).toEqual([{ id: 'rsi', params: {} }]);
    expect(Number.isFinite(list[1].savedAt)).toBe(true);
    expect(localStorage.getItem(LEGACY_KEY)).toBeTruthy(); // 新 key 在，旧 key 原样保留
  });

  it('resolveUniqueName：空名回落、占用追加序号', () => {
    expect(resolveUniqueName('  ', [])).toBe('未命名模板');
    expect(resolveUniqueName('A', [])).toBe('A');
    expect(resolveUniqueName('A', ['A'])).toBe('A (2)');
    expect(resolveUniqueName('A', ['A', 'A (2)'])).toBe('A (3)');
    expect(resolveUniqueName('A (2)', ['A', 'A (2)'])).toBe('A (2) (2)');
  });

  it('sortTemplates 最新在前且不改入参；relativeTime 分档', () => {
    const list = [
      { id: 'a', name: 'a', list: [], savedAt: 100 },
      { id: 'b', name: 'b', list: [], savedAt: 300 },
      { id: 'c', name: 'c', list: [], savedAt: 200 },
    ];
    expect(sortTemplates(list).map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(list.map((t) => t.id)).toEqual(['a', 'b', 'c']); // 入参顺序不动

    const now = 1_700_000_000_000;
    expect(relativeTime(now, now)).toBe('刚刚');
    expect(relativeTime(now - 30_000, now)).toBe('刚刚');
    expect(relativeTime(now - 3 * 60_000, now)).toBe('3 分钟前');
    expect(relativeTime(now - 59 * 60_000, now)).toBe('59 分钟前');
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2 小时前');
    expect(relativeTime(now - 23 * 3_600_000, now)).toBe('23 小时前');
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 天前');
    expect(relativeTime(now - 40 * 86_400_000, now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(relativeTime(now + 5 * 60_000, now)).toBe('刚刚'); // 未来时间（时钟偏差）不出现负档位
  });
});
