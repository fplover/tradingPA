// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartConfigStore } from '@/store/chartConfigStore';

/**
 * 三期-B0「设置态单一来源 + 偏好落盘」（docs/PLAN-PHASE3.md §2-B B0 行）：
 * 画布五项偏好自 ChartSettingsDialog 的 useState 迁入本 store，并整体持久化到
 * tradingpa.chartPrefs.v1。断言三件事：默认值与改造前对话框的硬编码初值一致（首次进入零行为变化）、
 * 落盘只覆盖偏好切片（transient 字段不写盘）、坏档逐字段回落（一个坏值不得改掉整组）。
 *
 * 模块初始化即读 localStorage，故一律 resetModules + 动态 import（同 alert-store.test.ts 口径）。
 */

const KEY = 'tradingpa.chartPrefs.v1';

async function freshStore(): Promise<ChartConfigStore> {
  vi.resetModules();
  const mod = await import('@/store/chartConfigStore');
  return mod.useChartConfigStore.getState();
}

function seed(obj: unknown): void {
  localStorage.setItem(KEY, JSON.stringify(obj));
}

describe('chartConfigStore 偏好默认值（无存档）', () => {
  beforeEach(() => localStorage.clear());

  it('无存档时取 B0 改造前对话框里的同一组硬编码初值', async () => {
    const s = await freshStore();
    expect(s).toMatchObject({
      timeframe: '1m',
      chartType: 'candles',
      autoScale: true,
      gridMode: 'both',
      bordersVisible: true,
      watermarkVisible: false,
      priceAxisPos: 'right',
      timeHour12: false,
    });
    expect(s.legendOpts.showOHLC).toBe(true);
  });

  it('localStorage 不可用（访问即抛）时不炸，取默认', async () => {
    const getItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem');
    Object.defineProperty(Storage.prototype, 'getItem', {
      configurable: true,
      value: () => {
        throw new Error('SecurityError: privacy mode');
      },
    });
    try {
      const s = await freshStore();
      expect(s.gridMode).toBe('both');
    } finally {
      if (getItem) Object.defineProperty(Storage.prototype, 'getItem', getItem);
    }
  });
});

describe('chartConfigStore 落盘', () => {
  beforeEach(() => localStorage.clear());

  it('setter 改画布偏好即落盘，重装载读回同值（等效刷新）', async () => {
    const s = await freshStore();
    s.setGridMode('horizontal');
    s.setWatermarkVisible(true);
    s.setPriceAxisPos('left');
    s.setTimeHour12(true);
    s.setBordersVisible(false);
    s.setLogScale(true);
    s.setTimeframe('5m');
    s.setChartType('renko');
    s.setLegendOpts({ showOHLC: false });

    const reloaded = await freshStore();
    expect(reloaded).toMatchObject({
      gridMode: 'horizontal',
      watermarkVisible: true,
      priceAxisPos: 'left',
      timeHour12: true,
      bordersVisible: false,
      logScale: true,
      timeframe: '5m',
      chartType: 'renko',
    });
    expect(reloaded.legendOpts.showOHLC).toBe(false);
  });

  it('transient 字段（compareSymbol / comparePickerOpen）不写盘', async () => {
    const s = await freshStore();
    s.setComparePickerOpen(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    s.setCompareSymbol({
      id: 'cn-sh:600519',
      code: '600519',
      symbol: 'GZMT',
      name: '贵州茅台',
      market: 'cn-sh',
      asset: 'stock',
      exchange: 'SSE',
      decimals: 2,
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('toggle 路径同样落盘（快捷键走 getState 的写入不需各自写盘）', async () => {
    const s = await freshStore();
    s.toggleHideStudies();
    s.toggleDrawingsLocked();
    const reloaded = await freshStore();
    expect(reloaded.hideStudies).toBe(true);
    expect(reloaded.drawingsLocked).toBe(true);
  });
});

describe('chartConfigStore 坏档兜底（逐字段，不整体弃档）', () => {
  beforeEach(() => localStorage.clear());

  it('坏 JSON → 全默认', async () => {
    localStorage.setItem(KEY, '{not json');
    const s = await freshStore();
    expect(s.gridMode).toBe('both');
    expect(s.timeframe).toBe('1m');
  });

  it('坏枚举只回落该字段，同档里的合法字段保留', async () => {
    seed({
      version: 1,
      gridMode: 'diagonal',
      priceAxisPos: 5,
      chartType: 'hilo',
      timeHour12: 'yes',
      watermarkVisible: true,
      autoScale: false,
      timeframe: '30m',
    });
    const s = await freshStore();
    expect(s.gridMode).toBe('both');
    expect(s.priceAxisPos).toBe('right');
    expect(s.chartType).toBe('candles');
    expect(s.timeHour12).toBe(false);
    expect(s.watermarkVisible).toBe(true);
    expect(s.autoScale).toBe(false);
    expect(s.timeframe).toBe('30m');
  });

  it('图例选项一个坏值不改掉整组开关', async () => {
    seed({ legendOpts: { showOHLC: 'yes', showSeriesTitle: false } });
    const s = await freshStore();
    expect(s.legendOpts.showOHLC).toBe(true);
    expect(s.legendOpts.showSeriesTitle).toBe(false);
  });

  it('自定义周期 id 不因注册表尚未初始化而被误拒；未知 id 回落 1m', async () => {
    seed({ timeframe: 'custom:7' });
    expect((await freshStore()).timeframe).toBe('custom:7');
    seed({ timeframe: 'nope' });
    expect((await freshStore()).timeframe).toBe('1m');
  });
});
