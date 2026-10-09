import { describe, expect, it } from 'vitest';
import {
  coerceVpParams,
  computeProfile,
  computeSessionProfiles,
  utcDayKey,
  VolumeProfileModel,
} from '@/engine/profile/volumeProfile';
import type { Bar } from '@/types/market';

/**
 * 二期-G Session Volume Profile golden 用例：
 * UTC 日分段（与会话 VWAP 同口径）、段内分布与 POC、单 bar 段跳过、
 * 模型会话缓存签名、mode 参数清洗；range 模式回归（既有 volume-profile 套件背书）。
 */

const DAY0 = Date.UTC(2024, 0, 1, 10); // 10:00 起，逐小时
const DAY1 = Date.UTC(2024, 0, 2, 10);

function segBars(dayStart: number, base: number, count: number): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    time: dayStart + i * 3_600_000,
    open: base + i - 0.5,
    high: base + i + 1,
    low: base + i - 1,
    close: base + i,
    volume: 10,
  }));
}

const BARS: Bar[] = [...segBars(DAY0, 100, 8), ...segBars(DAY1, 200, 8)];

const PARAMS = coerceVpParams({ rowCount: 12, vaPercent: 70, source: 'volume', mode: 'session' });

describe('utcDayKey（会话口径）', () => {
  it('UTC 日界切分：DAY0/DAY1 各一段，与会话 VWAP 同式', () => {
    expect(utcDayKey(DAY0)).toBe(utcDayKey(DAY0 + 5 * 3_600_000));
    expect(utcDayKey(DAY0)).not.toBe(utcDayKey(DAY1));
    expect(utcDayKey(DAY0)).toBe(Math.floor(DAY0 / 86_400_000));
  });
});

describe('computeSessionProfiles：UTC 日分段逐段分布', () => {
  it('两日数据 → 两段；段内独立价格域与 POC', () => {
    const segs = computeSessionProfiles(BARS, 0, 15, PARAMS);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ from: 0, to: 7 });
    expect(segs[1]).toMatchObject({ from: 8, to: 15 });
    // 段内价格域隔离：day0 ≈ 99-108，day1 ≈ 199-208，互不污染
    expect(segs[0].result.rows[0].low).toBeGreaterThanOrEqual(98);
    expect(segs[0].result.rows[11].high).toBeLessThanOrEqual(109);
    expect(segs[1].result.rows[0].low).toBeGreaterThanOrEqual(198);
    expect(segs[1].result.rows[11].high).toBeLessThanOrEqual(209);
    // POC 为段内最大量行中心价（等量均匀 → 首行同量，POC 取更低价行）
    expect(segs[0].result.poc).toBeGreaterThanOrEqual(99);
    expect(segs[0].result.poc).toBeLessThan(109);
  });

  it('单 bar 段（日及以上周期）跳过：每日一根 → 空数组', () => {
    const daily: Bar[] = [
      { time: Date.UTC(2024, 0, 1), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { time: Date.UTC(2024, 0, 2), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { time: Date.UTC(2024, 0, 3), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    ];
    expect(computeSessionProfiles(daily, 0, 2, PARAMS)).toEqual([]);
  });

  it('区间钳制：只统计 [from, to] 内的段', () => {
    const segs = computeSessionProfiles(BARS, 4, 12, PARAMS);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ from: 4, to: 7 });
    expect(segs[1]).toMatchObject({ from: 8, to: 12 });
  });

  it('range 回归：同区间单分布结果与会话逐段合计一致（总量守恒）', () => {
    const range = computeProfile(BARS, 0, 15, { ...PARAMS, mode: 'range' });
    const segs = computeSessionProfiles(BARS, 0, 15, PARAMS);
    expect(range).not.toBeNull();
    const segTotal = segs.reduce((s, x) => s + x.result.total, 0);
    expect(segTotal).toBeCloseTo(range!.total, 10);
  });
});

describe('VolumeProfileModel：会话缓存槽', () => {
  it('同签名返回同一引用；to 变化重算；与 range 缓存互不驱逐', () => {
    const model = new VolumeProfileModel();
    const s1 = model.getSessions(BARS, 0, 15, PARAMS, 1);
    const s2 = model.getSessions(BARS, 0, 15, PARAMS, 1);
    expect(s2).toBe(s1);
    const s3 = model.getSessions(BARS, 0, 11, PARAMS, 1);
    expect(s3).not.toBe(s1);
    expect(s3).toHaveLength(2);
    // range 槽独立：session 取数后 range 首算仍正确
    const r = model.getProfile(BARS, 0, 15, { ...PARAMS, mode: 'range' }, 1);
    expect(r).not.toBeNull();
  });

  it('数据纪元变化失效缓存', () => {
    const model = new VolumeProfileModel();
    const s1 = model.getSessions(BARS, 0, 15, PARAMS, 1);
    const s2 = model.getSessions(BARS, 0, 15, PARAMS, 2);
    expect(s2).not.toBe(s1);
  });
});

describe('coerceVpParams：mode 清洗', () => {
  it("session 解析；非法/缺省回退 'range'；默认参数 mode='range'", () => {
    expect(coerceVpParams({ mode: 'session' }).mode).toBe('session');
    expect(coerceVpParams({ mode: 'bogus' }).mode).toBe('range');
    expect(coerceVpParams({}).mode).toBe('range');
    expect(coerceVpParams(undefined).mode).toBe('range');
  });
});
