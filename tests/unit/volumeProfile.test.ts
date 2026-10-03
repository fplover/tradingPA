import { describe, expect, it } from 'vitest';
import type { Bar } from '@/types/market';
import { computeProfile, coerceVpParams, DEFAULT_VP_PARAMS, VolumeProfileModel } from '@/engine/profile/volumeProfile';
import { VOLUME_PROFILE } from '@/indicators/builtin/profile';
import { getIndicatorDef } from '@/indicators/registry';
import { IndicatorManager, type IndicatorHost } from '@/engine/renderer/IndicatorManager';
import { theme } from '@/engine/theme';
import type { PaneState } from '@/engine/renderer/ChartState';

/**
 * P1-F Volume Profile 金标准单测。
 * 分桶/POC/VAH/VAL 全部为手算参考值；边界（价格点触上边界、参数清洗、
 * 空区间）与缓存签名逐一断言，防沉默逻辑错误。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;
let seq = 0;
function bar(o: number, h: number, l: number, c: number, v: number): Bar {
  return { time: T0 + seq++ * IV, open: o, high: h, low: l, close: c, volume: v };
}

describe('computeProfile：分桶金标准（volume 源）', () => {
  // 价格域 [100,104]，rowCount=4 → 行高 1：[100,101)/[101,102)/[102,103)/[103,104]
  // b1 [100,102] v300 涨 → 行0/1 各 +150 up
  // b2 [101,103] v200 跌 → 行1/2 各 +100 down（high=103 点触上边界，不占行3）
  // b3 [102,104] v300 涨 → 行2/3 各 +150 up
  // b4 [100.5,101.5] v100 跌 → 行0/1 各 +50 down
  const bars: Bar[] = [
    bar(100.5, 102, 100, 101.5, 300),
    bar(102.5, 103, 101, 102, 200),
    bar(102, 104, 102, 103.5, 300),
    bar(101.5, 101.5, 100.5, 101.2, 100),
  ];
  const params = { rowCount: 4, vaPercent: 70, source: 'volume' as const };

  it('行总量 [200,300,250,150]，POC=101.5，VAH=103，VAL=100，总量 900', () => {
    const r = computeProfile(bars, 0, 3, params)!;
    expect(r).not.toBeNull();
    expect(r.rows.map((x) => x.total)).toEqual([200, 300, 250, 150]);
    expect(r.poc).toBeCloseTo(101.5, 10);
    expect(r.vah).toBeCloseTo(103, 10);
    expect(r.val).toBeCloseTo(100, 10);
    expect(r.total).toBeCloseTo(900, 10);
  });

  it('涨跌分色：行1 up=150/down=150；行3 全 up；行0 up=150/down=50', () => {
    const r = computeProfile(bars, 0, 3, params)!;
    expect(r.rows[1].up).toBeCloseTo(150, 10);
    expect(r.rows[1].down).toBeCloseTo(150, 10);
    expect(r.rows[3].up).toBeCloseTo(150, 10);
    expect(r.rows[3].down).toBeCloseTo(0, 10);
    expect(r.rows[0].up).toBeCloseTo(150, 10);
    expect(r.rows[0].down).toBeCloseTo(50, 10);
  });

  it('high 点触行边界不渗入上一行：rowCount=2 时 bar [100,101] 全量落行0', () => {
    const two: Bar[] = [
      bar(101, 102, 100, 101.5, 200), // 行0/1 各 100 up
      bar(100.5, 101, 100, 100.8, 100), // high=101 点触行界 → 仅行0 +100
    ];
    const r = computeProfile(two, 0, 1, { rowCount: 2, vaPercent: 70, source: 'volume' })!;
    expect(r.rows[0].total).toBeCloseTo(200, 10);
    expect(r.rows[1].total).toBeCloseTo(100, 10);
  });

  it('VA 扩张取相邻较大行，同量并入上方：70% 阈值收 [100,103]', () => {
    // POC 行1(300) → 并行2(250) 达 550 → 并行0(200) 达 700 ≥ 630
    const r = computeProfile(bars, 0, 3, params)!;
    expect(r.vah).toBeCloseTo(103, 10);
    expect(r.val).toBeCloseTo(100, 10);
  });
});

describe('computeProfile：delta 源（buyRatio 近似式）', () => {
  // 行高 1，两 bar 均跨 [100,102]（各摊 2 行）：
  // d1 close=101.8 → buyRatio=0.9，v200 → 总 buy180/sell20 → 每行 up90/down10
  // d2 close=100.2 → buyRatio=0.1，v100 → 总 buy10/sell90 → 每行 up5/down45
  const bars: Bar[] = [bar(100.2, 102, 100, 101.8, 200), bar(101, 102, 100, 100.2, 100)];
  const params = { rowCount: 2, vaPercent: 70, source: 'delta' as const };

  it('每行 up=95/down=55；POC 平量取更低价行 100.5；VA 全覆盖', () => {
    const r = computeProfile(bars, 0, 1, params)!;
    expect(r.rows[0].up).toBeCloseTo(95, 6);
    expect(r.rows[0].down).toBeCloseTo(55, 6);
    expect(r.rows[1].up).toBeCloseTo(95, 6);
    expect(r.rows[1].down).toBeCloseTo(55, 6);
    expect(r.poc).toBeCloseTo(100.5, 10);
    expect(r.vah).toBeCloseTo(102, 10);
    expect(r.val).toBeCloseTo(100, 10);
  });
});

describe('computeProfile：边界', () => {
  const bars: Bar[] = [bar(100, 101, 99.5, 100.5, 100)];
  it('空区间 / 区间倒置 → null', () => {
    expect(computeProfile(bars, 0, -1, DEFAULT_VP_PARAMS)).toBeNull();
  });
  it('零价差（全部同价 doji）→ null', () => {
    const flat: Bar[] = [bar(100, 100, 100, 100, 100)];
    expect(computeProfile(flat, 0, 0, DEFAULT_VP_PARAMS)).toBeNull();
  });
  it('窗口裁剪：只统计 [from,to] 内的 bar', () => {
    const r = computeProfile(bars, 5, 9, DEFAULT_VP_PARAMS);
    expect(r).toBeNull(); // 窗口内无 bar
  });
});

describe('coerceVpParams：参数清洗', () => {
  it('越界数值钳制到 10-100 / 50-95', () => {
    expect(coerceVpParams({ rowCount: 5 }).rowCount).toBe(10);
    expect(coerceVpParams({ rowCount: 500 }).rowCount).toBe(100);
    expect(coerceVpParams({ vaPercent: 200 }).vaPercent).toBe(95);
    expect(coerceVpParams({ vaPercent: 10 }).vaPercent).toBe(50);
  });
  it('非法/缺失值回落默认；source 白名单外回落 volume', () => {
    expect(coerceVpParams({ rowCount: 'abc' as unknown as number })).toEqual({ ...DEFAULT_VP_PARAMS });
    expect(coerceVpParams({ source: 'tick' as unknown as 'volume' }).source).toBe('volume');
    expect(coerceVpParams(undefined)).toEqual({ ...DEFAULT_VP_PARAMS });
  });
  it('颜色覆盖仅在为非空字符串时保留', () => {
    expect(coerceVpParams({ upColor: 'rgba(1, 2, 3, 0.4)' }).upColor).toBe('rgba(1, 2, 3, 0.4)');
    expect(coerceVpParams({ downColor: '' }).downColor).toBeUndefined();
  });
});

describe('VolumeProfileModel：签名缓存', () => {
  const bars: Bar[] = [bar(100, 102, 100, 101, 100)];
  it('同签名返回同一结果对象（帧级命中不重算）', () => {
    const m = new VolumeProfileModel();
    const a = m.getProfile(bars, 0, 0, DEFAULT_VP_PARAMS, 1);
    const b = m.getProfile(bars, 0, 0, DEFAULT_VP_PARAMS, 1);
    expect(a).toBe(b);
  });
  it('dataEpoch / from-to / 任一参数变化 → 重算为新对象', () => {
    const m = new VolumeProfileModel();
    const a = m.getProfile(bars, 0, 0, DEFAULT_VP_PARAMS, 1);
    expect(m.getProfile(bars, 0, 0, DEFAULT_VP_PARAMS, 2)).not.toBe(a);
    expect(m.getProfile(bars, 0, 0, { ...DEFAULT_VP_PARAMS, rowCount: 10 }, 2)).not.toBe(a);
    expect(m.getProfile(bars, 0, 0, { ...DEFAULT_VP_PARAMS, source: 'delta' }, 2)).not.toBe(a);
  });
});

describe('registry / def：profile 标记与参数 schema（蓝图 §5）', () => {
  it('volume-profile 已注册且带 profile 标记', () => {
    const def = getIndicatorDef('volume-profile');
    expect(def).toBe(VOLUME_PROFILE);
    expect(def?.profile).toBe(true);
    expect(def?.overlay).toBe(true);
    expect(def?.category).toBe('成交量');
  });
  it('参数默认值：rowCount 24 / vaPercent 70 / source volume；颜色默认引用主题 token', () => {
    const byKey = new Map(VOLUME_PROFILE.params.map((p) => [p.key, p]));
    expect(byKey.get('rowCount')?.default).toBe(24);
    expect(byKey.get('vaPercent')?.default).toBe(70);
    expect(byKey.get('source')?.default).toBe('volume');
    expect(byKey.get('upColor')?.default).toBe(theme.profileUp);
    expect(byKey.get('downColor')?.default).toBe(theme.profileDown);
    expect(byKey.get('pocColor')?.default).toBe(theme.profilePoc);
  });
});

describe('IndicatorManager：profile 专用分支', () => {
  function makeHost(panes: PaneState[]): IndicatorHost {
    return {
      panes: {
        get: () => panes,
        set: (p) => {
          panes.length = 0;
          panes.push(...p);
        },
      },
      selectedPaneId: { get: () => panes[0]?.id ?? 'main', set: () => {} },
      invalidate: () => {},
      vp: {
        getState: () => vpState,
        setVolumeProfile: (on, params) => {
          calls.push({ on, params });
          vpState = { on, params: params ? { ...vpState.params, ...params } : vpState.params };
        },
      },
    };
  }
  let vpState = { on: false, params: { ...DEFAULT_VP_PARAMS } as Record<string, string | number | boolean> };
  let calls: Array<{ on: boolean; params?: Record<string, string | number | boolean> }> = [];

  it('add：切 on + 挂参数，不建实例不建面板；list 以固定 uid 收录', () => {
    calls = [];
    vpState = { on: false, params: { ...DEFAULT_VP_PARAMS } as Record<string, string | number | boolean> };
    const panes: PaneState[] = [
      {
        id: 'main',
        kind: 'price',
        heightRatio: 3,
        priceScale: {} as never,
        indicators: [],
        y: 0,
        height: 0,
        manual: false,
        autoBtn: null,
        headerBtns: null,
      },
    ];
    const mgr = new IndicatorManager(makeHost(panes));
    const uid = mgr.add('volume-profile', { params: { rowCount: 48 } });
    expect(uid).toBe('vp');
    expect(calls[0]).toEqual({ on: true, params: { rowCount: 48 } });
    expect(panes[0].indicators).toHaveLength(0); // 无实例
    expect(panes).toHaveLength(1); // 无新面板
    expect(mgr.list()).toEqual([
      { uid: 'vp', id: 'volume-profile', name: VOLUME_PROFILE.name, overlay: true, params: expect.anything() },
    ]);
  });

  it('remove/update：路由到 vp 通路，不动面板数组', () => {
    calls = [];
    vpState = { on: true, params: { ...DEFAULT_VP_PARAMS } as Record<string, string | number | boolean> };
    const panes: PaneState[] = [
      {
        id: 'main',
        kind: 'price',
        heightRatio: 3,
        priceScale: {} as never,
        indicators: [],
        y: 0,
        height: 0,
        manual: false,
        autoBtn: null,
        headerBtns: null,
      },
    ];
    const mgr = new IndicatorManager(makeHost(panes));
    mgr.update('vp', { params: { vaPercent: 80, source: 'delta' } });
    expect(calls[0]).toEqual({ on: true, params: { vaPercent: 80, source: 'delta' } });
    mgr.remove('vp');
    expect(calls[1]).toEqual({ on: false, params: undefined });
    expect(panes).toHaveLength(1);
  });

  it('importTemplate：模板含 VP 时经 add 分支重挂；不含时保持关闭', () => {
    calls = [];
    vpState = { on: true, params: { ...DEFAULT_VP_PARAMS } as Record<string, string | number | boolean> };
    const panes: PaneState[] = [
      {
        id: 'main',
        kind: 'price',
        heightRatio: 3,
        priceScale: {} as never,
        indicators: [],
        y: 0,
        height: 0,
        manual: false,
        autoBtn: null,
        headerBtns: null,
      },
    ];
    const mgr = new IndicatorManager(makeHost(panes));
    mgr.importTemplate([{ id: 'volume-profile', params: { rowCount: 30 } }]);
    expect(calls[0]).toEqual({ on: false, params: undefined }); // 先清位
    expect(calls[1]).toEqual({ on: true, params: { rowCount: 30 } });
    expect(vpState.on).toBe(true);
    mgr.importTemplate([]);
    expect(vpState.on).toBe(false);
  });
});

describe('theme：VP token 双主题存在', () => {
  it('profileUp/profileDown/profilePoc/profileVa 均为非空字符串', () => {
    expect(typeof theme.profileUp).toBe('string');
    expect(theme.profileUp.length).toBeGreaterThan(0);
    expect(theme.profileDown.length).toBeGreaterThan(0);
    expect(theme.profilePoc.length).toBeGreaterThan(0);
    expect(theme.profileVa.length).toBeGreaterThan(0);
  });
});
