import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Instrument } from '@/types/instrument';
import { dataRegistry } from '@/data/sources/registry';
import type { Quote } from '@/data/sources/types';

interface QuoteStore {
  /** instrument id → 最新报价 */
  quotes: Record<string, Quote>;
  /** 最近一次刷新失败的提示；成功即清空 */
  lastError: string | null;
  updatedAt: number;
  refresh: (instruments: Instrument[]) => Promise<void>;
}

/** 同一时刻只允许一轮请求在途，避免慢响应时轮询堆叠 */
let inflight = false;

export const useQuoteStore = create<QuoteStore>((set) => ({
  quotes: {},
  lastError: null,
  updatedAt: 0,

  refresh: async (instruments) => {
    if (inflight || instruments.length === 0) return;
    inflight = true;
    try {
      const rows = await dataRegistry.quotes(instruments);
      if (rows.length === 0) return;
      set((s) => {
        const quotes = { ...s.quotes };
        for (const q of rows) quotes[q.id] = q;
        return { quotes, updatedAt: Date.now(), lastError: null };
      });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : '行情刷新失败' });
    } finally {
      inflight = false;
    }
  },
}));

/** 轮询报价。标签页隐藏时暂停，回到前台立刻补一次。 */
export function useQuotePolling(instruments: Instrument[], intervalMs = 5000): void {
  const refresh = useQuoteStore((s) => s.refresh);
  const ref = useRef(instruments);
  // 渲染期写 ref 会触发 react-hooks/refs；改在提交后同步。tick 只由 setInterval /
  // visibilitychange 事件调用，且下方 effect 在挂载时的首次 tick 必晚于本同步 effect
  // （同组件 effect 按声明序执行），读到的永不是尚未同步的旧值。
  useEffect(() => {
    ref.current = instruments;
  });
  const key = instruments.map((i) => i.id).join('|');

  useEffect(() => {
    if (key === '') return;
    const tick = () => {
      if (!document.hidden) void refresh(ref.current);
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [key, intervalMs, refresh]);
}
