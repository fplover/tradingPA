import { useEffect, useRef } from 'react';
import { IndicatorInstance } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useAlertStore, type AlertSample } from '@/store/alertStore';
import { sampleKey } from './alertLogic';
import type { Bar } from '@/types/market';

/**
 * 警报采样轮询（P1-C）：把「价格 + 已挂指标的 plot 值」喂给 alertStore.check。
 * - 价格源：报价/最新收盘（App 传入 lastPrice，与顶栏同源）。
 * - 指标源：按指标 id 缓存 IndicatorInstance 直接对 bars 计算末两根窗口，
 *   参数跟随指标面板当前设置（applyOptions 同值不失效脏缓存）。
 *   不依赖图表渲染器——指标未显示在图上也能触发警报。
 * - 穿越（crossUp/crossDown）依赖 store 内 lastSeen 逐采样推进，首轮无上一采样不触发。
 */
export function useAlertWatcher(symbol: string | undefined, bars: Bar[], price: number): void {
  const alerts = useAlertStore((s) => s.alerts);
  const activeIndicators = useIndicatorStore((s) => s.active);
  const checkRef = useRef(useAlertStore.getState().check);
  checkRef.current = useAlertStore.getState().check;
  const instancesRef = useRef(new Map<string, IndicatorInstance>());

  useEffect(() => {
    if (!symbol) return;
    const relevant = alerts.filter((a) => a.symbol === symbol && a.active);
    if (relevant.length === 0) return;
    const samples: AlertSample[] = [];

    if (relevant.some((a) => a.source.type === 'price')) {
      if (Number.isFinite(price) && price > 0) {
        samples.push({ key: sampleKey(symbol, { type: 'price' }), value: price });
      }
    }

    // 指标源：按指标 id 聚合所需 plot，一次窗口计算取多个 plot
    const need = new Map<string, Set<string>>();
    for (const a of relevant) {
      if (a.source.type !== 'indicator') continue;
      const set = need.get(a.source.indicatorId) ?? new Set<string>();
      set.add(a.source.plotKey);
      need.set(a.source.indicatorId, set);
    }
    if (need.size > 0 && bars.length >= 1) {
      const to = bars.length - 1;
      const from = Math.max(0, to - 1);
      for (const [indicatorId, plotKeys] of need) {
        const def = getIndicatorDef(indicatorId);
        if (!def) continue;
        let inst = instancesRef.current.get(indicatorId);
        // Pine 自定义指标可能重注册换 def，实例跟着换
        if (!inst || inst.def !== def) {
          inst = new IndicatorInstance(def, {});
          instancesRef.current.set(indicatorId, inst);
        }
        const entry = activeIndicators.find((x) => x.id === indicatorId);
        inst.applyOptions({ params: entry?.params ?? {} });
        const { outputs, ctxFrom } = inst.computeWindow(bars, from, to);
        for (const plotKey of plotKeys) {
          const v = outputs[plotKey]?.[to - ctxFrom];
          if (typeof v === 'number' && Number.isFinite(v)) {
            samples.push({ key: sampleKey(symbol, { type: 'indicator', indicatorId, plotKey }), value: v });
          }
        }
      }
    }

    if (samples.length > 0) checkRef.current(symbol, samples);
  }, [symbol, price, bars, alerts, activeIndicators]);
}
