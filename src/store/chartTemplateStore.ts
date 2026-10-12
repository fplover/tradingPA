import { create } from 'zustand';
import { parseChartPrefs, slicePrefs, useChartConfigStore } from '@/store/chartConfigStore';
import type { ChartPrefs } from '@/store/chartConfigStore';
// 通用件跨域复用（id 生成 / 重名解析 / 相对时间均与指标域无耦合）；indicatorTemplates 不导入本模块，无环
import { newTemplateId, resolveUniqueName } from '@/store/indicatorTemplates';

/**
 * 图表模板（三期-B1，TV 图表设置 Templates 形态）：多份**命名偏好快照**。
 * 快照单元是 B0 落盘的 `ChartPrefs` 切片，校验层直接共用 `parseChartPrefs`——
 * 模板读档与偏好读档面对的是同一类不可信输入（localStorage），不该有第二套兜底。
 * 依赖单向：本模块 → chartConfigStore；应用模板只写 store，引擎下发与落盘都由
 * B0 的既有链路（对话框下发 effect + 单点订阅）自然承接。
 */

/** 命名图表模板：偏好快照 + 名称 + 保存时间 */
export interface ChartTemplate {
  id: string;
  name: string;
  prefs: ChartPrefs;
  savedAt: number;
}

/** 模板落盘 key（含版本号，换 schema 时换键、旧档自然隔离） */
export const CHART_TEMPLATES_KEY = 'tradingpa.chartTemplates.v1';
/** 数量上限：图表模板是全局工作区快照，复用频次远低于指标组合，取比 MAX_TEMPLATES 更紧的 20 */
export const MAX_CHART_TEMPLATES = 20;

/** 单条快照拷贝：legendOpts 独立成对象，防模板与 store 状态共享引用相互污染 */
function clonePrefs(p: ChartPrefs): ChartPrefs {
  return { ...p, legendOpts: { ...p.legendOpts } };
}

/** 逐条归一化：缺字段 / 类型不符的条目丢弃，单条损坏不拖垮整份存档 */
function parseTemplate(v: unknown): ChartTemplate | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Partial<ChartTemplate>;
  if (typeof t.id !== 'string' || !t.id) return null;
  if (typeof t.name !== 'string' || !t.name) return null;
  if (!t.prefs || typeof t.prefs !== 'object') return null;
  return {
    id: t.id,
    name: t.name,
    prefs: parseChartPrefs(t.prefs),
    savedAt: typeof t.savedAt === 'number' && Number.isFinite(t.savedAt) ? t.savedAt : Date.now(),
  };
}

/** 读档（store 初始化时调用一次）：无档 / 隐私模式 / 坏 JSON → 空列表；逐条 + 逐字段兜底 */
export function loadChartTemplates(): ChartTemplate[] {
  let raw: string | null = null;
  try {
    if (typeof localStorage === 'undefined') return [];
    raw = localStorage.getItem(CHART_TEMPLATES_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseTemplate)
      .filter((t): t is ChartTemplate => t !== null)
      .slice(0, MAX_CHART_TEMPLATES);
  } catch {
    return [];
  }
}

/** 落盘：隐私模式 / 存储超额时静默失败，内存态继续可用（不阻断保存动作） */
function persistTemplates(list: ChartTemplate[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CHART_TEMPLATES_KEY, JSON.stringify(list.slice(0, MAX_CHART_TEMPLATES)));
  } catch {
    /* 忽略 */
  }
}

export interface ChartTemplateStore {
  templates: ChartTemplate[];
  /** 采集当前偏好存为新模板，重名自动加序号；返回新 id */
  saveTemplate: (name: string) => string;
  /** 应用模板 = 整份快照写回 chartConfigStore；未知 id 返回 false */
  applyTemplate: (id: string) => boolean;
  renameTemplate: (id: string, name: string) => void;
  deleteTemplate: (id: string) => void;
}

export const useChartTemplateStore = create<ChartTemplateStore>((set, get) => ({
  templates: loadChartTemplates(),
  saveTemplate: (name) => {
    const finalName = resolveUniqueName(
      name,
      get().templates.map((t) => t.name),
    );
    const entry: ChartTemplate = {
      id: newTemplateId(),
      name: finalName,
      prefs: clonePrefs(slicePrefs(useChartConfigStore.getState())),
      savedAt: Date.now(),
    };
    set((s) => ({ templates: [entry, ...s.templates].slice(0, MAX_CHART_TEMPLATES) }));
    persistTemplates(get().templates);
    return entry.id;
  },
  applyTemplate: (id) => {
    const tpl = get().templates.find((t) => t.id === id);
    if (!tpl) return false;
    // setState 同步生效：B0 的单点订阅随即落盘 chartPrefs，对话框的下发 effect 于同帧订阅后把画布五项推给引擎
    useChartConfigStore.setState(clonePrefs(tpl.prefs));
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
