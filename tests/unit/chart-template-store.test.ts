// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 三期-B1「图表模板」（docs/PLAN-PHASE3.md §2-B B1 交付记录）：多份命名偏好快照。
 * 断言四件事——快照采集面就是 B0 的落盘切片、校验层与偏好读档共用 parseChartPrefs、
 * 应用只写 chartConfigStore（落盘由 B0 的单点订阅承接，本 store 不重复写 chartPrefs）、
 * 坏档逐条 + 逐字段兜底且数量受上限约束。
 *
 * 两个 store 都在模块初始化即读 localStorage，故一律 resetModules + 动态 import。
 */

const TPL_KEY = 'tradingpa.chartTemplates.v1';
const PREFS_KEY = 'tradingpa.chartPrefs.v1';

async function freshStores() {
  vi.resetModules();
  const cfgMod = await import('@/store/chartConfigStore');
  const tplMod = await import('@/store/chartTemplateStore');
  return { cfg: cfgMod.useChartConfigStore, tpl: tplMod.useChartTemplateStore, cap: tplMod.MAX_CHART_TEMPLATES };
}

function readTemplates(): unknown[] {
  return JSON.parse(localStorage.getItem(TPL_KEY) ?? '[]') as unknown[];
}

beforeEach(() => localStorage.clear());

describe('chartTemplateStore 保存', () => {
  it('无存档时列表为空；保存即采集当前偏好切片', async () => {
    const { cfg, tpl } = await freshStores();
    expect(tpl.getState().templates).toEqual([]);

    cfg.getState().setTimeframe('15m');
    cfg.getState().setGridMode('vertical');
    cfg.getState().setWatermarkVisible(true);
    const id = tpl.getState().saveTemplate('趋势看盘');

    const [entry] = readTemplates() as Array<{ id: string; name: string; prefs: Record<string, unknown> }>;
    expect(entry.id).toBe(id);
    expect(entry.name).toBe('趋势看盘');
    expect(entry.prefs.timeframe).toBe('15m');
    expect(entry.prefs.gridMode).toBe('vertical');
    expect(entry.prefs.watermarkVisible).toBe(true);
    expect(entry.prefs.chartType).toBe('candles');
  });

  it('重名追加序号不覆盖既有模板；空名回落「未命名模板」', async () => {
    const { tpl } = await freshStores();
    const s = tpl.getState();
    expect(s.saveTemplate('A')).toBeTruthy();
    s.saveTemplate('A');
    s.saveTemplate('A');
    s.saveTemplate('   ');
    expect(tpl.getState().templates.map((t) => t.name)).toEqual(['未命名模板', 'A (3)', 'A (2)', 'A']);
  });

  it('快照与内存态解耦：保存后改偏好不动已存模板', async () => {
    const { cfg, tpl } = await freshStores();
    cfg.getState().setGridMode('horizontal');
    const id = tpl.getState().saveTemplate('快照');
    cfg.getState().setGridMode('none');

    expect(tpl.getState().templates.find((t) => t.id === id)?.prefs.gridMode).toBe('horizontal');
  });

  it('数量受 MAX_CHART_TEMPLATES 约束（最新在前，旧的被挤掉）', async () => {
    const { tpl, cap } = await freshStores();
    const s = tpl.getState();
    for (let i = 1; i <= cap + 5; i += 1) s.saveTemplate(`T${i}`);
    const rows = tpl.getState().templates;
    expect(rows).toHaveLength(cap);
    expect(rows[0].name).toBe(`T${cap + 5}`);
    expect(readTemplates()).toHaveLength(cap);
  });
});

describe('chartTemplateStore 应用', () => {
  it('整份快照写回 chartConfigStore，并经 B0 的单点订阅落盘（等效刷新保留）', async () => {
    const { cfg, tpl } = await freshStores();
    cfg.getState().setTimeframe('1H');
    cfg.getState().setPriceAxisPos('left');
    cfg.getState().setLegendOpts({ showVolume: false });
    const id = tpl.getState().saveTemplate('我的视图');

    cfg.getState().setTimeframe('1m');
    cfg.getState().setPriceAxisPos('right');
    cfg.getState().setLegendOpts({ showVolume: true });
    localStorage.removeItem(PREFS_KEY);

    expect(tpl.getState().applyTemplate(id)).toBe(true);
    expect(cfg.getState()).toMatchObject({ timeframe: '1H', priceAxisPos: 'left' });
    expect(cfg.getState().legendOpts.showVolume).toBe(false);
    const persisted = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
    expect(persisted.timeframe).toBe('1H');
    expect(persisted.priceAxisPos).toBe('left');
  });

  it('未知 id 返回 false 且不改任何偏好', async () => {
    const { cfg, tpl } = await freshStores();
    cfg.getState().setGridMode('vertical');
    expect(tpl.getState().applyTemplate('tpl-missing')).toBe(false);
    expect(cfg.getState().gridMode).toBe('vertical');
  });

  it('模板不与 store 共享图例对象引用：应用后改图例不回写模板', async () => {
    const { cfg, tpl } = await freshStores();
    cfg.getState().setLegendOpts({ showOHLC: true });
    const id = tpl.getState().saveTemplate('图例');
    expect(tpl.getState().applyTemplate(id)).toBe(true);
    cfg.getState().setLegendOpts({ showOHLC: false });

    const entry = readTemplates() as Array<{ prefs: { legendOpts: { showOHLC: boolean } } }>;
    expect(tpl.getState().templates.find((t) => t.id === id)?.prefs.legendOpts.showOHLC).toBe(true);
    expect(entry[0].prefs.legendOpts.showOHLC).toBe(true);
  });

  it('显示时区随模板走（含跨刷新重载）；B3 之前的旧模板（prefs 无该字段）应用即回落本地档', async () => {
    const { cfg, tpl } = await freshStores();
    cfg.getState().setTzOffsetMinutes(330);
    tpl.getState().saveTemplate('含时区');

    // 跨刷新重载：模板 prefs 走 parseChartPrefs，tz 必须活下来并且可应用回当前偏好
    const re = await freshStores();
    expect(re.tpl.getState().templates[0]?.prefs.tzOffsetMinutes).toBe(330);
    re.cfg.getState().setTzOffsetMinutes(null);
    expect(re.tpl.getState().applyTemplate(re.tpl.getState().templates[0]!.id)).toBe(true);
    expect(re.cfg.getState().tzOffsetMinutes).toBe(330);

    // 手工造一份 B1 交付时的旧档形状：prefs 里根本没有 tzOffsetMinutes
    localStorage.setItem(
      TPL_KEY,
      JSON.stringify([{ id: 'tpl-legacy', name: '旧模板', savedAt: 1, prefs: { gridMode: 'vertical' } }]),
    );
    const again = await freshStores(); // 旧档经 parseChartPrefs 补出的就是 null
    expect(again.tpl.getState().templates[0]?.prefs.tzOffsetMinutes).toBeNull();
    again.cfg.getState().setTzOffsetMinutes(-720);
    expect(again.tpl.getState().applyTemplate('tpl-legacy')).toBe(true);
    expect(again.cfg.getState().tzOffsetMinutes).toBeNull();
    expect(again.cfg.getState().gridMode).toBe('vertical');
  });
});

describe('chartTemplateStore 重命名与删除', () => {
  it('重命名剔除自身占用（改回原名不产生序号）并落盘', async () => {
    const { tpl } = await freshStores();
    const s = tpl.getState();
    const a = s.saveTemplate('甲');
    s.saveTemplate('乙');
    s.renameTemplate(a, '乙');
    expect(tpl.getState().templates.find((t) => t.id === a)?.name).toBe('乙 (2)');
    s.renameTemplate(a, '甲');
    expect(tpl.getState().templates.find((t) => t.id === a)?.name).toBe('甲');
    expect((readTemplates() as Array<{ name: string }>).map((t) => t.name)).toContain('甲');
  });

  it('删除移除内存态并落盘；未知 id 不写盘', async () => {
    const { tpl } = await freshStores();
    const s = tpl.getState();
    const a = s.saveTemplate('甲');
    localStorage.removeItem(TPL_KEY);
    s.deleteTemplate('tpl-missing');
    expect(localStorage.getItem(TPL_KEY)).toBeNull();
    s.deleteTemplate(a);
    expect(tpl.getState().templates).toEqual([]);
    expect(readTemplates()).toEqual([]);
  });
});

describe('chartTemplateStore 坏档兜底', () => {
  it('坏 JSON / 非数组 / localStorage 不可用 → 空列表', async () => {
    localStorage.setItem(TPL_KEY, '{not json');
    expect((await freshStores()).tpl.getState().templates).toEqual([]);
    localStorage.setItem(TPL_KEY, '{"a":1}');
    expect((await freshStores()).tpl.getState().templates).toEqual([]);

    const getItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem');
    Object.defineProperty(Storage.prototype, 'getItem', {
      configurable: true,
      value: () => {
        throw new Error('SecurityError: privacy mode');
      },
    });
    try {
      expect((await freshStores()).tpl.getState().templates).toEqual([]);
    } finally {
      if (getItem) Object.defineProperty(Storage.prototype, 'getItem', getItem);
    }
  });

  it('单条损坏只丢该条，同档其余条目保留', async () => {
    localStorage.setItem(
      TPL_KEY,
      JSON.stringify([
        { id: 'ok', name: '完好', prefs: { gridMode: 'horizontal' }, savedAt: 1 },
        { name: '缺 id', prefs: {} },
        { id: 'x', prefs: {} },
        { id: 'y', name: '缺 prefs' },
        'string-entry',
        null,
      ]),
    );
    const rows = (await freshStores()).tpl.getState().templates;
    expect(rows.map((t) => t.name)).toEqual(['完好']);
    expect(rows[0].prefs.gridMode).toBe('horizontal');
  });

  it('快照字段与偏好读档同一套兜底：坏枚举只回落该字段', async () => {
    localStorage.setItem(
      TPL_KEY,
      JSON.stringify([
        {
          id: 'p',
          name: '半坏',
          prefs: { gridMode: 'diagonal', priceAxisPos: 5, timeframe: 'nope', watermarkVisible: true, autoScale: false },
          savedAt: 2,
        },
      ]),
    );
    const prefs = (await freshStores()).tpl.getState().templates[0].prefs;
    expect(prefs.gridMode).toBe('both');
    expect(prefs.priceAxisPos).toBe('right');
    expect(prefs.timeframe).toBe('1m');
    expect(prefs.watermarkVisible).toBe(true);
    expect(prefs.autoScale).toBe(false);
  });

  it('savedAt 非数字回落当前时刻；存档超上限只取前 MAX_CHART_TEMPLATES 条', async () => {
    const { cap } = await freshStores();
    const many = Array.from({ length: cap + 10 }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
      prefs: { gridMode: 'vertical' },
      savedAt: i,
    }));
    localStorage.setItem(TPL_KEY, JSON.stringify(many));
    const rows = (await freshStores()).tpl.getState().templates;
    expect(rows).toHaveLength(cap);
    expect(rows[0].savedAt).toBe(0);

    localStorage.setItem(TPL_KEY, JSON.stringify([{ id: 'z', name: '无时间', prefs: {} }]));
    const one = (await freshStores()).tpl.getState().templates[0];
    expect(Number.isFinite(one.savedAt)).toBe(true);
  });

  it('localStorage 写失败（配额 / 隐私模式）不抛出，内存态继续可用', async () => {
    const { tpl } = await freshStores();
    const setItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => {
        throw new Error('QuotaExceededError');
      },
    });
    try {
      expect(tpl.getState().saveTemplate('离线也能存')).toBeTruthy();
    } finally {
      if (setItem) Object.defineProperty(Storage.prototype, 'setItem', setItem);
    }
    expect(tpl.getState().templates.map((t) => t.name)).toEqual(['离线也能存']);
  });
});
