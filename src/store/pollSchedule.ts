/**
 * 二期-B1 轮询调度的纯决策核（node 环境可单测）。
 *
 * 三条规则（PHASE2-PLAN §二期-B，已裁决 B1 方案）：
 * 1. 自适应间隔——盘中 3s 一拍；连续失败指数退避（×2 递增，封顶 60s），成功归零；
 * 2. 盘外停轮——所轮询品种全部闭市时零网络请求，仅以 30s 的本地闹钟重估开市状态
 *    （isMarketOpen 是纯本地时间计算，不产生请求）；
 * 3. 页面可见性——隐藏时同样只挂重估闹钟，回前台由 visibilitychange 立即补拍。
 */

/** 盘中基础间隔。原为固定 5s；3s 保证图表末柱刷新延迟 P95 ≤ 5s（验收口径）。 */
export const POLL_OPEN_MS = 3000;
/** 失败退避封顶：网络/数据源故障时最慢 60s 一拍，避免打挂已故障的源 */
export const POLL_MAX_MS = 60_000;
/** 盘外/隐藏时的本地重估闹钟：零网络，只重算开市状态与可见性 */
export const IDLE_WAKE_MS = 30_000;

export type PollDecision =
  /** 立即拉取一拍，ms 后再评估下一拍 */
  | { kind: 'poll'; ms: number }
  /** 零请求等待，ms 后重估（盘外开市检测 / 隐藏回前台检测） */
  | { kind: 'wait'; ms: number };

/**
 * 下一拍决策。
 * @param anyOpen 所轮询品种中是否存在开市市场（任一开市即轮询——报价按批拉取，
 *                混合列表无法按市场拆分单条请求；全闭市才停轮）
 * @param hidden 页面是否隐藏
 * @param consecutiveFails 连续失败拍数（成功由调用方归零）
 */
export function nextPollDecision(anyOpen: boolean, hidden: boolean, consecutiveFails: number): PollDecision {
  if (hidden || !anyOpen) return { kind: 'wait', ms: IDLE_WAKE_MS };
  const fails = Math.max(consecutiveFails, 0);
  const ms = Math.min(POLL_OPEN_MS * 2 ** fails, POLL_MAX_MS);
  return { kind: 'poll', ms };
}
