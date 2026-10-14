// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceAlert } from '@/features/alerts/alertLogic';

/**
 * 警报提示音偏好（三期-B4「警报」页的 store 侧护栏）。
 *
 * B4 之前 `setSoundEnabled` 全仓零调用点（能力在、入口无），本文件是它第一次被测试覆盖，
 * 钉住三件互不等价的事实：① setter 同时改内存与落盘；② 存档值随模块初始化读回（刷新不回默认）；
 * ③ 该开关**只**管发声——触发判定、历史登记、系统通知都不受它影响（第 ③ 条是本页的设计边界，
 * 若将来有人把静音实现成「不触发」，这里会红）。
 */
const beep = vi.hoisted(() => vi.fn(() => true));
const historyCalls = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/features/alerts/sound', () => ({ playAlertBeep: beep }));
vi.mock('@/features/alerts/alertHistory', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/alerts/alertHistory')>();
  return { ...real, recordAlertFires: (...args: unknown[]) => void historyCalls.push(args) };
});

const NOW = 1_700_000_000_000;
const PRICE_KEY = 'BTCUSDT:price';

function makeAlert(patch: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: 'a',
    symbol: 'BTCUSDT',
    source: { type: 'price' },
    threshold: 100,
    condition: 'greater',
    active: true,
    triggered: false,
    createdAt: NOW,
    frequency: 'once',
    cooldownMs: 30_000,
    ...patch,
  };
}

/** 全新 store 实例：alertStore 在模块求值时读 localStorage，故须 resetModules 才能测读档 */
async function freshStore() {
  vi.resetModules();
  const mod = await import('@/store/alertStore');
  return mod.useAlertStore;
}

describe('提示音偏好的落盘与读回', () => {
  beforeEach(() => {
    localStorage.clear();
    beep.mockClear();
    historyCalls.length = 0;
  });

  it('setSoundEnabled(false) 同时改内存态与 v2 存档', async () => {
    const useAlertStore = await freshStore();
    expect(useAlertStore.getState().soundEnabled).toBe(true); // 空档默认开（改造前行为）
    useAlertStore.getState().setSoundEnabled(false);
    expect(useAlertStore.getState().soundEnabled).toBe(false);
    const raw = JSON.parse(localStorage.getItem('tradingpa.alerts') ?? '{}');
    expect(raw).toMatchObject({ version: 2, soundEnabled: false });
  });

  it('存档里的 false 随模块初始化读回——刷新后不回默认', async () => {
    localStorage.setItem('tradingpa.alerts', JSON.stringify({ version: 2, soundEnabled: false, alerts: [] }));
    const useAlertStore = await freshStore();
    expect(useAlertStore.getState().soundEnabled).toBe(false);
  });

  it('v1 旧档（顶层数组）无该字段 → 读回开（旧行为不变）', async () => {
    localStorage.setItem('tradingpa.alerts', JSON.stringify([makeAlert()]));
    const useAlertStore = await freshStore();
    expect(useAlertStore.getState().soundEnabled).toBe(true);
  });
});

describe('静音的作用面：只关发声', () => {
  beforeEach(() => {
    localStorage.clear();
    beep.mockClear();
    historyCalls.length = 0;
  });

  it('静音时警报照常触发、照常登记历史，只是不发声', async () => {
    const useAlertStore = await freshStore();
    useAlertStore.getState().setSoundEnabled(false);
    useAlertStore.setState({ alerts: [makeAlert()] });
    const fired = useAlertStore.getState().check('BTCUSDT', [{ key: PRICE_KEY, value: 101 }]);
    expect(fired).toHaveLength(1);
    expect(useAlertStore.getState().alerts[0]).toMatchObject({ active: false, triggered: true });
    expect(historyCalls).toHaveLength(1); // 历史登记与开关无关
    expect(beep).not.toHaveBeenCalled();
  });

  it('未静音时同一触发会发声（上一条的对照面：证明 not.toHaveBeenCalled 有牙）', async () => {
    const useAlertStore = await freshStore();
    useAlertStore.setState({ alerts: [makeAlert()] });
    const fired = useAlertStore.getState().check('BTCUSDT', [{ key: PRICE_KEY, value: 101 }]);
    expect(fired).toHaveLength(1);
    expect(beep).toHaveBeenCalledTimes(1);
  });
});
