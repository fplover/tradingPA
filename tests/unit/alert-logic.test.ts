import { describe, expect, it } from 'vitest';
import {
  clampCooldown,
  evaluateCondition,
  isExpired,
  parseAlertsPayload,
  runAlertCheck,
  sampleKey,
  type AlertSample,
  type PriceAlert,
} from '@/features/alerts/alertLogic';

const NOW = 1_700_000_000_000;

function makeAlert(patch: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: 'a1',
    symbol: 'BTCUSDT',
    source: { type: 'price' },
    threshold: 100,
    condition: 'greater',
    active: true,
    triggered: false,
    createdAt: NOW - 1000,
    frequency: 'once',
    cooldownMs: 30_000,
    ...patch,
  };
}

const s = (key: string, value: number): AlertSample => ({ key, value });
const PRICE_KEY = sampleKey('BTCUSDT', { type: 'price' });

describe('evaluateCondition', () => {
  it('greater/less 不依赖穿越，边界值（==）即成立', () => {
    expect(evaluateCondition('greater', 100, 100, undefined)).toBe(true);
    expect(evaluateCondition('greater', 100, 99.999, undefined)).toBe(false);
    expect(evaluateCondition('less', 100, 100, undefined)).toBe(true);
    expect(evaluateCondition('less', 100, 100.001, undefined)).toBe(false);
  });

  it('crossUp/crossDown 需要上一采样，无上一采样不触发（防首轮误报）', () => {
    expect(evaluateCondition('crossUp', 100, 101, undefined)).toBe(false);
    expect(evaluateCondition('crossUp', 100, 101, 99)).toBe(true);
    expect(evaluateCondition('crossUp', 100, 101, 100.5)).toBe(false); // 未从下方穿越
    expect(evaluateCondition('crossUp', 100, 99, 98)).toBe(false);
    expect(evaluateCondition('crossDown', 100, 99, 101)).toBe(true);
    expect(evaluateCondition('crossDown', 100, 99, undefined)).toBe(false);
    expect(evaluateCondition('crossDown', 100, 101, 102)).toBe(false); // 值仍在阈值上方，未下穿
  });
});

describe('runAlertCheck', () => {
  it('greater 首轮即触发；once 触发后停用（AC-C1）', () => {
    const alert = makeAlert();
    const res = runAlertCheck([alert], 'BTCUSDT', [s(PRICE_KEY, 101)], {}, NOW);
    expect(res.fired).toHaveLength(1);
    expect(res.fired[0].value).toBe(101);
    expect(res.alerts[0]).toMatchObject({ active: false, triggered: true });
    expect(res.lastSeen[PRICE_KEY]).toBe(101);
  });

  it('every 模式：冷却期内不重复触发，冷却期满可再次触发（AC-C1）', () => {
    const alert = makeAlert({ frequency: 'every', cooldownMs: 30_000 });
    const seen: Record<string, number> = {};
    // T0 首次触发（greater 不依赖穿越）
    const r1 = runAlertCheck([alert], 'BTCUSDT', [s(PRICE_KEY, 101)], seen, NOW);
    expect(r1.fired).toHaveLength(1);
    const afterFirst = r1.alerts[0];
    expect(afterFirst.active).toBe(true);
    expect(afterFirst.lastFiredAt).toBe(NOW);
    // T+10s 冷却期内：条件仍成立但不触发
    const r2 = runAlertCheck([afterFirst], 'BTCUSDT', [s(PRICE_KEY, 102)], r1.lastSeen, NOW + 10_000);
    expect(r2.fired).toHaveLength(0);
    expect(r2.lastSeen[PRICE_KEY]).toBe(102);
    // T+30s 冷却期满：再次触发
    const r3 = runAlertCheck([afterFirst], 'BTCUSDT', [s(PRICE_KEY, 102)], r2.lastSeen, NOW + 30_000);
    expect(r3.fired).toHaveLength(1);
  });

  it('crossUp：首轮仅记录采样，价格自下而上穿越阈值才触发', () => {
    const alert = makeAlert({ condition: 'crossUp' });
    const r1 = runAlertCheck([alert], 'BTCUSDT', [s(PRICE_KEY, 101)], {}, NOW);
    expect(r1.fired).toHaveLength(0); // 无上一采样
    const r2 = runAlertCheck([alert], 'BTCUSDT', [s(PRICE_KEY, 99)], r1.lastSeen, NOW + 1000);
    expect(r2.fired).toHaveLength(0);
    const r3 = runAlertCheck([alert], 'BTCUSDT', [s(PRICE_KEY, 101)], r2.lastSeen, NOW + 2000);
    expect(r3.fired).toHaveLength(1);
  });

  it('过期警报直接停用且不触发（AC-C 过期）', () => {
    const expired = makeAlert({ expiresAt: NOW - 1 });
    const res = runAlertCheck([expired], 'BTCUSDT', [s(PRICE_KEY, 200)], {}, NOW);
    expect(res.fired).toHaveLength(0);
    expect(res.alerts[0].active).toBe(false);
    expect(res.alerts[0].triggered).toBe(false);
  });

  it('暂停（active=false）与其它品种的警报不参与', () => {
    const paused = makeAlert({ active: false });
    const other = makeAlert({ id: 'a2', symbol: 'ETHUSDT' });
    const res = runAlertCheck([paused, other], 'BTCUSDT', [s(PRICE_KEY, 200)], {}, NOW);
    expect(res.fired).toHaveLength(0);
    expect(res.alerts).toEqual([paused, other]); // 引用不变：未触碰
  });

  it('指标源按 sampleKey 匹配采样', () => {
    const alert = makeAlert({
      source: { type: 'indicator', indicatorId: 'rsi', plotKey: 'rsi' },
      threshold: 70,
      condition: 'greater',
    });
    const key = sampleKey('BTCUSDT', { type: 'indicator', indicatorId: 'rsi', plotKey: 'rsi' });
    const miss = runAlertCheck([alert], 'BTCUSDT', [s(PRICE_KEY, 200)], {}, NOW);
    expect(miss.fired).toHaveLength(0);
    const hit = runAlertCheck([alert], 'BTCUSDT', [s(key, 71.3)], {}, NOW);
    expect(hit.fired).toHaveLength(1);
    expect(hit.fired[0].value).toBe(71.3);
  });

  it('采样值非法（非有限数）不触发也不记入 lastSeen', () => {
    const alert = makeAlert();
    const res = runAlertCheck([alert], 'BTCUSDT', [{ key: PRICE_KEY, value: NaN }], {}, NOW);
    expect(res.fired).toHaveLength(0);
    expect(res.lastSeen[PRICE_KEY]).toBeUndefined();
  });

  it('无变化时返回原数组引用（避免无谓 set/持久化）', () => {
    const alerts = [makeAlert({ condition: 'crossUp' })];
    const res = runAlertCheck(alerts, 'BTCUSDT', [s(PRICE_KEY, 50)], {}, NOW);
    expect(res.alerts).toBe(alerts);
  });
});

describe('isExpired / clampCooldown', () => {
  it('isExpired 边界：now == expiresAt 未过期', () => {
    expect(isExpired({ ...makeAlert(), expiresAt: NOW }, NOW)).toBe(false);
    expect(isExpired({ ...makeAlert(), expiresAt: NOW - 1 }, NOW)).toBe(true);
    expect(isExpired(makeAlert(), NOW)).toBe(false);
  });

  it('clampCooldown：非法值回落默认，低于下限抬到下限（防轰炸）', () => {
    expect(clampCooldown(0)).toBe(30_000);
    expect(clampCooldown(Number.NaN)).toBe(30_000);
    expect(clampCooldown(1000)).toBe(10_000);
    expect(clampCooldown(45_000)).toBe(45_000);
  });
});

describe('parseAlertsPayload（schema 版本兼容）', () => {
  it('v1 顶层数组：price/direction 迁移为 threshold/condition + once（行为与旧实现一致）', () => {
    const payload = parseAlertsPayload(
      JSON.stringify([
        {
          id: 'old1',
          symbol: 'BTCUSDT',
          price: 123.5,
          direction: 'above',
          active: true,
          triggered: false,
          createdAt: 1,
        },
        { id: 'old2', symbol: 'ETHUSDT', price: 10, direction: 'below', active: false, triggered: true, createdAt: 2 },
      ]),
    );
    expect(payload.alerts).toHaveLength(2);
    expect(payload.alerts[0]).toMatchObject({
      id: 'old1',
      source: { type: 'price' },
      threshold: 123.5,
      condition: 'greater',
      frequency: 'once',
    });
    expect(payload.alerts[1]).toMatchObject({ threshold: 10, condition: 'less' });
  });

  it('v2 载荷：字段保留 + soundEnabled', () => {
    const alert = makeAlert({ frequency: 'every', cooldownMs: 60_000, expiresAt: NOW + 1 });
    const payload = parseAlertsPayload(JSON.stringify({ version: 2, soundEnabled: false, alerts: [alert] }));
    expect(payload.soundEnabled).toBe(false);
    expect(payload.alerts[0]).toMatchObject({ id: 'a1', frequency: 'every', cooldownMs: 60_000, expiresAt: NOW + 1 });
  });

  it('损坏数据（非法 JSON / 坏条目）静默跳过，不抛错', () => {
    expect(parseAlertsPayload('not-json')).toEqual({ alerts: [], soundEnabled: true });
    const payload = parseAlertsPayload(JSON.stringify([{ id: 'bad' }, null, 'x', makeAlert()]));
    expect(payload.alerts).toHaveLength(1);
    expect(parseAlertsPayload(null).alerts).toHaveLength(0);
  });
});
