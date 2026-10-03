import { create } from 'zustand';
import type { ParamValue, PlotKind } from '@/indicators/core/types';
import {
  loadTemplates,
  MAX_TEMPLATES,
  newTemplateId,
  persistTemplates,
  resolveUniqueName,
  type IndicatorTemplate,
} from '@/store/indicatorTemplates';

export type { IndicatorTemplate } from '@/store/indicatorTemplates';

/** 逐 plot 的样式覆盖（TV 指标设置「样式」页） */
export interface PlotStyleOverride {
  color?: string;
  lineWidth?: number;
  /** 绘制类型覆盖（TV 样式页 plot 类型下拉） */
  kind?: PlotKind;
  hidden?: boolean;
}

export interface ActiveIndicator {
  id: string;
  params: Record<string, ParamValue>;
  /** 显示名覆盖（样式页顶部可编辑） */
  displayName?: string;
  /** 小数位覆盖；undefined = 跟随默认 */
  precision?: number;
  styles?: Record<string, PlotStyleOverride>;
  /** 可见周期 id 列表；undefined/null = 全部周期可见 */
  visibleTimeframes?: string[];
}

const FAV_KEY = 'tradingpa.indicatorFavorites';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) {
      const list = JSON.parse(raw) as string[];
      if (Array.isArray(list)) return list.filter((x) => typeof x === 'string');
    }
  } catch {
    /* 忽略 */
  }
  return [];
}

interface IndicatorStore {
  active: ActiveIndicator[];
  favorites: string[];
  /** 已保存的命名指标模板（最新在前；TV 指标对话框 Templates 分区数据源） */
  templates: IndicatorTemplate[];
  panelOpen: boolean;
  settingsFor: string | null;
  add: (id: string, params?: Record<string, ParamValue>) => void;
  remove: (id: string) => void;
  updateParams: (id: string, params: Record<string, ParamValue>) => void;
  /** AVWAP 锚点写回（P2-D③）：引擎落锚后经回调把 anchorTime 落入 params；
   *  同值短路——已是该锚点不新建 state（避免 store→engine→store 回环） */
  setAnchorTime: (id: string, anchorTime: number) => void;
  updateInstance: (id: string, patch: Partial<Omit<ActiveIndicator, 'id' | 'params'>>) => void;
  toggleFavorite: (id: string) => void;
  replaceAll: (list: ActiveIndicator[]) => void;
  setPanelOpen: (open: boolean) => void;
  setSettingsFor: (id: string | null) => void;
  /** 命名保存当前指标组合（重名自动追加序号，不覆盖既有模板）；返回新模板 id */
  saveTemplate: (name: string) => string;
  /** 应用模板：整量替换 active；未知 id 返回 false */
  loadTemplate: (id: string) => boolean;
  /** 重命名（空名回落「未命名模板」；目标名被占用时解析到未占用序号） */
  renameTemplate: (id: string, name: string) => void;
  /** 删除模板；未知 id 忽略 */
  deleteTemplate: (id: string) => void;
}

export const useIndicatorStore = create<IndicatorStore>((set, get) => ({
  // 默认挂 VOL 成交量指标（副图直方图），可通过工具栏复选框或指标面板增删
  active: [{ id: 'vol', params: {} }],
  favorites: loadFavorites(),
  templates: loadTemplates(),
  panelOpen: false,
  settingsFor: null,
  add: (id, params) =>
    set((s) => (s.active.some((a) => a.id === id) ? s : { active: [...s.active, { id, params: params ?? {} }] })),
  remove: (id) => set((s) => ({ active: s.active.filter((a) => a.id !== id), settingsFor: null })),
  updateParams: (id, params) =>
    set((s) => ({ active: s.active.map((a) => (a.id === id ? { ...a, params: { ...a.params, ...params } } : a)) })),
  setAnchorTime: (id, anchorTime) =>
    set((s) => {
      const entry = s.active.find((a) => a.id === id);
      // 同值短路 / 目标不存在：原样返回，不新建 state（useChartCommands 不会重复下发）
      if (!entry || entry.params.anchorTime === anchorTime) return s;
      return { active: s.active.map((a) => (a.id === id ? { ...a, params: { ...a.params, anchorTime } } : a)) };
    }),
  updateInstance: (id, patch) => set((s) => ({ active: s.active.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  toggleFavorite: (id) =>
    set((s) => {
      const favorites = s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
      } catch {
        /* 忽略 */
      }
      return { favorites };
    }),
  replaceAll: (list) => set({ active: list }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setSettingsFor: (settingsFor) => set({ settingsFor }),
  saveTemplate: (name) => {
    const finalName = resolveUniqueName(
      name,
      get().templates.map((t) => t.name),
    );
    const entry: IndicatorTemplate = {
      id: newTemplateId(),
      name: finalName,
      list: get().active.map((a) => ({ ...a, params: { ...a.params } })),
      savedAt: Date.now(),
    };
    set((s) => ({ templates: [entry, ...s.templates].slice(0, MAX_TEMPLATES) }));
    persistTemplates(get().templates);
    return entry.id;
  },
  loadTemplate: (id) => {
    const tpl = get().templates.find((t) => t.id === id);
    if (!tpl) return false;
    get().replaceAll(tpl.list.map((a) => ({ ...a, params: { ...a.params } })));
    return true;
  },
  renameTemplate: (id, name) => {
    const s = get();
    const target = s.templates.find((t) => t.id === id);
    if (!target) return;
    // 占用名集合剔除自身：改回原名时不产生序号
    const finalName = resolveUniqueName(
      name,
      s.templates.filter((t) => t.id !== id).map((t) => t.name),
    );
    if (finalName === target.name) return;
    set({ templates: s.templates.map((t) => (t.id === id ? { ...t, name: finalName } : t)) });
    persistTemplates(get().templates);
  },
  deleteTemplate: (id) => {
    const s = get();
    if (!s.templates.some((t) => t.id === id)) return;
    set({ templates: s.templates.filter((t) => t.id !== id) });
    persistTemplates(get().templates);
  },
}));
