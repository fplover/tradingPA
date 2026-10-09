import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Instrument } from '@/types/instrument';
import { dataRegistry } from '@/data/sources/registry';
import { isMarketOpen } from '@/data/marketHours';
import type { Quote } from '@/data/sources/types';
import { nextPollDecision } from './pollSchedule';

interface QuoteStore {
  /** instrument id → 最新报价 */
  quotes: Record<string, Quote>;
  /** 最近一次刷新失败的提示；成功即清空 */
  lastError: string | null;
  updatedAt: number;
  /** 拉一拍报价。返回是否有数据落地——false（空响应/异常）计入轮询退避。 */
  refresh: (instruments: Instrument[]) => Promise<boolean>;
}

/** 同一时刻只允许一轮请求在途，避免慢响应时轮询堆叠 */
let inflight = false;

export const useQuoteStore = create<QuoteStore>((set) => ({
  quotes: {},
  lastError: null,
  updatedAt: 0,

  refresh: async (instruments) => {
    if (inflight || instruments.length === 0) return false;
    inflight = true;
    try {
      const rows = await dataRegistry.quotes(instruments);
      if (rows.length === 0) return false;
      set((s) => {
        const quotes = { ...s.quotes };
        for (const q of rows) quotes[q.id] = q;
        return { quotes, updatedAt: Date.now(), lastError: null };
      });
      return true;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : '行情刷新失败' });
      return false;
    } finally {
      inflight = false;
    }
  },
}));

/**
 * 轮询报价（二期-B1 自适应调度，决策核在 pollSchedule.ts）：
 * 盘中 3s 一拍；连续失败 ×2 退避封顶 60s；全部品种闭市或页面隐藏时零网络请求，
 * 仅挂 30s 本地重估闹钟；visibilitychange 回前台立即补拍。
 */
export function useQuotePolling(instruments: Instrument[]): void {
  const refresh = useQuoteStore((s) => s.refresh);
  const ref = useRef(instruments);
  // 渲染期写 ref 会触发 react-hooks/refs；改在提交后同步。beat 只由 setTimeout /
  // visibilitychange 事件调用，且下方 effect 在挂载时的首次 beat 必晚于本同步 effect
  // （同组件 effect 按声明序执行），读到的永不是尚未同步的旧值。
  useEffect(() => {
    ref.current = instruments;
  });
  const key = instruments.map((i) => i.id).join('|');

  useEffect(() => {
    if (key === '') return;
    let alive = true;
    let busy = false;
    let timer: number | null = null;
    let fails = 0;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    /** 一拍：可见且开市才发请求，随后按决策核挂下一拍（await 后重读 hidden） */
    const beat = async (): Promise<void> => {
      if (!alive || busy) return;
      busy = true;
      try {
        if (!document.hidden) {
          const ok = await refresh(ref.current);
          fails = ok ? 0 : Math.min(fails + 1, 10);
        }
      } finally {
        busy = false;
      }
      if (!alive) return;
      const anyOpen = ref.current.some((i) => isMarketOpen(i.market));
      const decision = nextPollDecision(anyOpen, document.hidden, fails);
      timer = window.setTimeout(() => void beat(), decision.ms);
    };

    void beat();
    // 回前台：取消挂起的等待闹钟立即补拍；若恰有一拍在途（busy），该拍自会续排
    const onVisible = () => {
      if (document.hidden || timer === null) return;
      clearTimer();
      void beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, refresh]);
}
