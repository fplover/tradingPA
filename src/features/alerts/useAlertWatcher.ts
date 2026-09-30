import { useEffect, useRef } from 'react';
import { IndicatorInstance } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useAlertStore, type AlertSample } from '@/store/alertStore';
import { sampleKey, type AlertSource, type PriceAlert } from './alertLogic';
import { deserializeDrawings, type Drawing } from '@/engine/drawing/types';
import type { Bar } from '@/types/market';

/**
 * 警报采样轮询（P1-C）：把「价格 + 已挂指标的 plot 值」喂给 alertStore.check。
 * - 价格源：报价/最新收盘（App 传入 lastPrice，与顶栏同源）。
 * - 指标源：按指标 id 缓存 IndicatorInstance 直接对 bars 计算末两根窗口，
 *   参数跟随指标面板当前设置（applyOptions 同值不失效脏缓存）。
 *   不依赖图表渲染器——指标未显示在图上也能触发警报。
 * - Pine 条件源（P2-A③）：条件序列走同一 watcher 的 computeExtra 旁路取数
 *   （与 paint/shapes 同窗缓存），每报价/每帧随指标计算采样，不另起定时器。
 * - 画线水平线源（P2-D②）：经画线数据桥读 renderer.exportDrawings()，采样值 =
 *   市场价、阈值 = 水平线当前价（拖动后随下一报价 tick 同步）；同一 bar 内只触发
 *   一次由 runAlertCheck 的冷却逻辑保证，不新起定时器。
 * - 穿越（crossUp/crossDown）依赖 store 内 lastSeen 逐采样推进，首轮无上一采样不触发。
 */

// ---------- 画线数据桥（P2-D②） ----------
// App 直调 useAlertWatcher（签名不变），单图 renderer 的 exportDrawings getter 由
// ChartWorkspace 登记；水平线采样与 AlertPanel 源列表共用这一读数入口。
// 只经 ChartController 既有公开 API（exportDrawings）取数，不触引擎内部。

let drawingsGetter: (() => string | null) | null = null;
const drawingsListeners = new Set<() => void>();

/** 登记/摘除画线 getter（renderer 就绪与卸载时由 ChartWorkspace 调用） */
export function setDrawingsGetter(getter: (() => string | null) | null): void {
  drawingsGetter = getter;
  for (const cb of drawingsListeners) cb();
}

/** 画线变更广播（renderer.onDrawingsChanged 转发：放置/删除/撤销/导入等） */
export function notifyDrawingsChanged(): void {
  for (const cb of drawingsListeners) cb();
}

export function subscribeDrawings(cb: () => void): () => void {
  drawingsListeners.add(cb);
  return () => {
    drawingsListeners.delete(cb);
  };
}

/** 当前画线（反序列化；无 getter 或解析失败给空表） */
export function currentDrawings(): Drawing[] {
  const raw = drawingsGetter?.();
  return raw ? deserializeDrawings(raw) : [];
}

export interface HlineOption {
  id: string;
  price: number;
}

/** 可见水平线 → {id, price}（警报面板源列表与采样共用的提取口径） */
export function hlinePrices(drawings: readonly Drawing[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of drawings) {
    if (d.type !== 'hline' || d.visible === false) continue;
    const p = d.points[0]?.price;
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) out.set(d.id, p);
  }
  return out;
}

// useSyncExternalStore 快照缓存：序列化串未变则返回同一引用（防渲染循环）。
// 拖拽画线不触发广播，快照在面板下次渲染时按串 diff 自然刷新（采样不走缓存，始终读实时值）。
let hlinesCache: HlineOption[] = [];
let hlinesCacheRaw: string | null = null;
export function currentHlines(): HlineOption[] {
  const raw = drawingsGetter?.() ?? null;
  if (raw !== hlinesCacheRaw) {
    hlinesCacheRaw = raw;
    hlinesCache = [...hlinePrices(raw ? deserializeDrawings(raw) : [])].map(([id, price]) => ({ id, price }));
  }
  return hlinesCache;
}

/** 水平线警报（source 收窄后的形态，供同步计划与采样共用） */
type LineAlert = PriceAlert & { source: Extract<AlertSource, { type: 'line' }> };

/**
 * 水平线阈值同步计划（纯函数）：阈值跟随水平线当前价——拖动水平线即迁移触发位
 * （TV 画线警报语义）；水平线已删 → 不同步（采样侧停采，警报保留但不触发）。
 */
export function lineThresholdSyncs(
  alerts: readonly PriceAlert[],
  levels: ReadonlyMap<string, number>,
): Array<{ id: string; threshold: number }> {
  const out: Array<{ id: string; threshold: number }> = [];
  for (const a of alerts) {
    if (a.source.type !== 'line') continue;
    const level = levels.get(a.source.drawingId);
    if (level === undefined || level === a.threshold) continue;
    out.push({ id: a.id, threshold: level });
  }
  return out;
}

/** computeExtra 中的 alertcondition 条目结构（本地结构化类型，避免渲染层反向依赖 pine 包） */
interface ExtraAlertEntry {
  kind: string;
  key: string;
  cond: Array<number | undefined> | null;
}

/**
 * 从 computeExtra 旁路提取 Pine 条件采样（纯函数，窗口对齐由 ctxFrom 保证）。
 * 条件为布尔语义：非零有限数 → 1，0/undefined/NaN → 0（Pine na 视为不成立）。
 */
export function pineAlertSamples(
  extra: unknown,
  ctxFrom: number,
  to: number,
  symbol: string,
  indicatorId: string,
  keys: ReadonlySet<string>,
): AlertSample[] {
  if (extra === undefined || extra === null) return [];
  const entries = extra as ExtraAlertEntry[];
  const out: AlertSample[] = [];
  for (const e of entries) {
    if (e.kind !== 'alertcondition' || !e.key || !keys.has(e.key)) continue;
    const v = e.cond?.[to - ctxFrom];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out.push({ key: sampleKey(symbol, { type: 'pine', indicatorId, key: e.key }), value: v !== 0 ? 1 : 0 });
  }
  return out;
}

export function useAlertWatcher(symbol: string | undefined, bars: Bar[], price: number): void {
  const alerts = useAlertStore((s) => s.alerts);
  const activeIndicators = useIndicatorStore((s) => s.active);
  const checkRef = useRef(useAlertStore.getState().check);
  checkRef.current = useAlertStore.getState().check;
  const updateRef = useRef(useAlertStore.getState().update);
  updateRef.current = useAlertStore.getState().update;
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

    // 指标/Pine 条件源：按指标 id 聚合所需 plot 与条件键，一次窗口计算取多个输出
    const need = new Map<string, { plots: Set<string>; pines: Set<string> }>();
    for (const a of relevant) {
      if (a.source.type === 'indicator') {
        const set = need.get(a.source.indicatorId) ?? { plots: new Set<string>(), pines: new Set<string>() };
        set.plots.add(a.source.plotKey);
        need.set(a.source.indicatorId, set);
      } else if (a.source.type === 'pine') {
        const set = need.get(a.source.indicatorId) ?? { plots: new Set<string>(), pines: new Set<string>() };
        set.pines.add(a.source.key);
        need.set(a.source.indicatorId, set);
      }
    }
    if (need.size > 0 && bars.length >= 1) {
      const to = bars.length - 1;
      const from = Math.max(0, to - 1);
      for (const [indicatorId, want] of need) {
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
        const { outputs, ctxFrom, extra } = inst.computeWindow(bars, from, to);
        for (const plotKey of want.plots) {
          const v = outputs[plotKey]?.[to - ctxFrom];
          if (typeof v === 'number' && Number.isFinite(v)) {
            samples.push({ key: sampleKey(symbol, { type: 'indicator', indicatorId, plotKey }), value: v });
          }
        }
        if (want.pines.size > 0) {
          samples.push(...pineAlertSamples(extra, ctxFrom, to, symbol, indicatorId, want.pines));
        }
      }
    }

    // 画线水平线源（P2-D②）：阈值先同步为水平线当前价（拖动迁移触发位），
    // 再以市场价为采样值喂 check；水平线已删 → 停采样（警报保留但不触发）
    const lineAlerts = relevant.filter((a): a is LineAlert => a.source.type === 'line');
    if (lineAlerts.length > 0) {
      const levels = hlinePrices(currentDrawings());
      for (const sync of lineThresholdSyncs(lineAlerts, levels)) updateRef.current(sync.id, { threshold: sync.threshold });
      if (Number.isFinite(price) && price > 0) {
        for (const a of lineAlerts) {
          if (!levels.has(a.source.drawingId)) continue;
          samples.push({ key: sampleKey(symbol, a.source), value: price });
        }
      }
    }

    if (samples.length > 0) checkRef.current(symbol, samples);
  }, [symbol, price, bars, alerts, activeIndicators]);
}
