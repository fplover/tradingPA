// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import type { PriceAlert } from '@/features/alerts/alertLogic';

/**
 * 警报 store 动作语义（第四轮审查修复批，用户裁决 2026-10-03）：
 * clearTriggered 只清「已触发且已停用」——运行中的 every 警报不再被一并删除。
 */
const NOW = 1_700_000_000_000;

function makeAlert(patch: Partial<PriceAlert>): PriceAlert {
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

async function loadStore() {
  // 动态 import：模块初始化即读 localStorage，须等 jsdom 环境就绪后种子/空表
  const mod = await import('@/store/alertStore');
  return mod.useAlertStore;
}

describe('alertStore.clearTriggered（只清已停用）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('every 运行中警报（triggered=true, active=true）保留；once 已停用（active=false）清除', async () => {
    const useAlertStore = await loadStore();
    const running = makeAlert({ id: 'running', frequency: 'every', triggered: true, active: true });
    const firedOnce = makeAlert({ id: 'fired-once', frequency: 'once', triggered: true, active: false });
    const untouched = makeAlert({ id: 'untouched', triggered: false, active: true });
    useAlertStore.setState({ alerts: [running, firedOnce, untouched] });
    useAlertStore.getState().clearTriggered();
    const ids = useAlertStore.getState().alerts.map((a) => a.id);
    expect(ids).toContain('running'); // 运行中的 every 警报不再被误删
    expect(ids).toContain('untouched');
    expect(ids).not.toContain('fired-once');
  });

  it('编辑路径（update 不带 active 字段）保留原暂停状态——AlertEditDialog 静默恢复 bug 的回归位', async () => {
    const useAlertStore = await loadStore();
    const paused = makeAlert({ id: 'paused', active: false });
    useAlertStore.setState({ alerts: [paused] });
    useAlertStore.getState().update('paused', { threshold: 105 });
    const after = useAlertStore.getState().alerts[0];
    expect(after.active).toBe(false); // 编辑不隐式恢复
    expect(after.threshold).toBe(105);
  });
});
