import { describe, expect, it } from 'vitest';
import { IDLE_WAKE_MS, POLL_MAX_MS, POLL_OPEN_MS, nextPollDecision } from '@/store/pollSchedule';

describe('nextPollDecision：二期-B1 轮询调度决策核', () => {
  it('页面隐藏 → 零请求等待（无论开闭市与失败计数）', () => {
    expect(nextPollDecision(true, true, 0)).toEqual({ kind: 'wait', ms: IDLE_WAKE_MS });
    expect(nextPollDecision(true, true, 8)).toEqual({ kind: 'wait', ms: IDLE_WAKE_MS });
    expect(nextPollDecision(false, true, 0)).toEqual({ kind: 'wait', ms: IDLE_WAKE_MS });
  });

  it('全部品种闭市 → 零请求等待（盘外停轮）', () => {
    expect(nextPollDecision(false, false, 0)).toEqual({ kind: 'wait', ms: IDLE_WAKE_MS });
    expect(nextPollDecision(false, false, 5)).toEqual({ kind: 'wait', ms: IDLE_WAKE_MS });
  });

  it('盘中可见 → 3s 一拍（验收：末柱刷新延迟 P95 ≤ 5s）', () => {
    expect(nextPollDecision(true, false, 0)).toEqual({ kind: 'poll', ms: POLL_OPEN_MS });
  });

  it('连续失败 ×2 指数退避，封顶 60s', () => {
    const ms = [1, 2, 3, 4, 5, 6, 10, 99].map((n) => nextPollDecision(true, false, n).ms);
    expect(ms).toEqual([6000, 12_000, 24_000, 48_000, POLL_MAX_MS, POLL_MAX_MS, POLL_MAX_MS, POLL_MAX_MS]);
    expect(POLL_MAX_MS).toBe(60_000);
  });

  it('负数失败计数钳到 0（防御调用方累计误差）', () => {
    expect(nextPollDecision(true, false, -3)).toEqual({ kind: 'poll', ms: POLL_OPEN_MS });
  });

  it('混合列表语义：任一市场开市即轮询（报价按批拉取，无法按市场拆单）', () => {
    // anyOpen 由调用方用 isMarketOpen 聚合；决策核只认布尔
    expect(nextPollDecision(true, false, 0).kind).toBe('poll');
  });
});
