// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 三期-B2「交易」页的偏好 store（docs/PLAN-PHASE3.md §2-B B2）。
 * 断言四件事——默认值与改造前的硬编码逐位相同（0.01 / 1% / 100_000 / 显示），
 * 落盘 key 带版本号且经单点订阅写盘，坏档逐字段兜底 + 有限值按 TRADE_LIMITS clamp，
 * setter 收拢浮点步进噪声（否则 0.020000000000000004 会落盘并流入下单表单）。
 *
 * store 在模块初始化即读 localStorage，故一律 resetModules + 动态 import。
 */

const KEY = 'tradingpa.tradeSettings.v1';

async function freshStore() {
  vi.resetModules();
  const mod = await import('@/store/tradeSettingsStore');
  return { s: mod.useTradeSettingsStore, limits: mod.TRADE_LIMITS, parse: mod.parseTradePrefs };
}

function readRaw(): Record<string, unknown> | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeEach(() => localStorage.clear());

describe('tradeSettingsStore 默认值', () => {
  it('无存档时四值等于改造前的硬编码', async () => {
    const { s } = await freshStore();
    const st = s.getState();
    expect(st.defaultQty).toBe(0.01);
    expect(st.stopOffsetPct).toBe(1);
    expect(st.initialBalance).toBe(100_000);
    expect(st.showTrading).toBe(true);
    expect(readRaw()).toBeNull(); // 未变更不写盘
  });

  it('setter 经单点订阅落盘，带 version 字段', async () => {
    const { s } = await freshStore();
    s.getState().setDefaultQty(0.5);
    s.getState().setShowTrading(false);
    expect(readRaw()).toEqual({
      version: 1,
      defaultQty: 0.5,
      stopOffsetPct: 1,
      initialBalance: 100_000,
      showTrading: false,
    });
  });
});

describe('tradeSettingsStore 宽容读档', () => {
  it('坏 JSON / 非对象 / 隐私模式一律回落全默认', async () => {
    localStorage.setItem(KEY, '{not json');
    expect((await freshStore()).s.getState().defaultQty).toBe(0.01);

    localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    expect((await freshStore()).s.getState().initialBalance).toBe(100_000);

    localStorage.clear();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const mod = await freshStore();
    expect(mod.s.getState().showTrading).toBe(true);
    getItem.mockRestore();
  });

  it('逐字段兜底：字符串/ null / NaN 只坏自己那一项', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ defaultQty: '2', stopOffsetPct: null, initialBalance: Number.NaN, showTrading: false }),
    );
    const st = (await freshStore()).s.getState();
    expect(st.defaultQty).toBe(0.01);
    expect(st.stopOffsetPct).toBe(1);
    expect(st.initialBalance).toBe(100_000);
    expect(st.showTrading).toBe(false); // 合法布尔照常生效
  });

  it('有限值按 TRADE_LIMITS clamp（与 UI 步进器上下限同一份口径）', async () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultQty: 1e12, stopOffsetPct: 0, initialBalance: -5_000 }));
    const { s, limits, parse } = await freshStore();
    const st = s.getState();
    expect(st.defaultQty).toBe(limits.qty.max);
    expect(st.stopOffsetPct).toBe(limits.slPct.min);
    expect(st.initialBalance).toBe(limits.balance.min);
    expect(parse({ initialBalance: Number.POSITIVE_INFINITY }).initialBalance).toBe(100_000);
  });
});

describe('tradeSettingsStore setter 归一', () => {
  it('收拢步进加法带来的浮点噪声，落盘读数干净', async () => {
    const { s } = await freshStore();
    s.getState().setDefaultQty(0.01);
    // NumberStepper 的「+」把 0.01 加出 0.020000000000000004
    s.getState().setDefaultQty(0.01 + 0.01);
    expect(s.getState().defaultQty).toBe(0.02);
    s.getState().setStopOffsetPct(0.1 + 0.2);
    expect(s.getState().stopOffsetPct).toBe(0.3);
    expect(readRaw()?.defaultQty).toBe(0.02);
  });

  it('数量按 4 位精度收拢（低于 min 的步进值不产生第 5 位小数）', async () => {
    const { s } = await freshStore();
    s.getState().setDefaultQty(1 / 3);
    expect(s.getState().defaultQty).toBe(0.3333);
  });

  it('setItem 抛错（存储超额）不阻断内存态', async () => {
    const { s } = await freshStore();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => s.getState().setInitialBalance(250_000)).not.toThrow();
    expect(s.getState().initialBalance).toBe(250_000);
    setItem.mockRestore();
  });
});

describe('初始资金接入模拟盘引擎（三期-B2）', () => {
  it('引擎构造取存档值；reset 读当时的偏好，而非引擎构造值', async () => {
    localStorage.setItem(KEY, JSON.stringify({ initialBalance: 50_000 }));
    vi.resetModules();
    const [{ useTradeStore }, { useTradeSettingsStore }] = await Promise.all([
      import('@/features/trading/tradeStore'),
      import('@/store/tradeSettingsStore'),
    ]);
    expect(useTradeStore.getState().engine.balance).toBe(50_000);

    useTradeStore.getState().place({ type: 'market', side: 'buy', qty: 1 }, 100, 1);
    expect(useTradeStore.getState().engine.position).not.toBeNull();

    // 偏好改动后：进行中的会话不动，下一次会话重置即生效
    useTradeSettingsStore.getState().setInitialBalance(80_000);
    expect(useTradeStore.getState().engine.balance).toBe(50_000);
    useTradeStore.getState().reset();
    expect(useTradeStore.getState().engine.balance).toBe(80_000);
    expect(useTradeStore.getState().engine.position).toBeNull();
  });
});
