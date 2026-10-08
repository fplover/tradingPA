import { create } from 'zustand';
import { compilePine, DEFAULT_PINE_SCRIPT, type PineError } from '@/indicators/pine/compile';
import { clearPineAlerts } from '@/indicators/pine/alerts';
import { registerCustomDef, unregisterCustomDef } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';

/** 编辑器草稿编译产物的固定 id；保存后的脚本各自持有稳定 id */
export const DRAFT_ID = 'pine_custom';

export interface PineScript {
  id: string;
  name: string;
  source: string;
}

const STORAGE_KEY = 'tradingpa.pine.scripts';

let seq = 0;
function newId(): string {
  seq += 1;
  return `pine_${Date.now().toString(36)}_${seq}`;
}

function loadScripts(): PineScript[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as PineScript[];
      if (Array.isArray(list)) return list.filter((s) => s && typeof s.source === 'string');
    }
  } catch {
    /* 损坏则忽略 */
  }
  return [];
}

function persist(scripts: PineScript[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
  } catch {
    /* 忽略 */
  }
}

interface PineStore {
  scripts: PineScript[];
  editorSource: string;
  errors: PineError[];
  /** 最近一次运行成功的草稿名称 */
  draftName: string | null;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setEditorSource: (source: string) => void;
  /** 编译草稿；成功则注册为可添加的指标 */
  run: () => boolean;
  /** 保存草稿为脚本（同名覆盖）并注册 */
  save: () => void;
  remove: (id: string) => void;
  loadIntoEditor: (id: string) => void;
  addDraftToChart: () => void;
}

const initialScripts = loadScripts();
// 启动时把已保存脚本编译进注册表
for (const s of initialScripts) {
  const { def } = compilePine(s.source, s.id);
  if (def) registerCustomDef(def);
}

export const usePineStore = create<PineStore>((set, get) => ({
  scripts: initialScripts,
  editorSource: DEFAULT_PINE_SCRIPT,
  errors: [],
  draftName: null,
  panelOpen: false,

  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setEditorSource: (editorSource) => set({ editorSource, errors: [] }),

  run: () => {
    const { editorSource } = get();
    const { def, errors } = compilePine(editorSource, DRAFT_ID);
    if (!def) {
      set({ errors, draftName: null });
      return false;
    }
    registerCustomDef(def);
    set({ errors: [], draftName: def.name });
    return true;
  },

  save: () => {
    const { editorSource, scripts } = get();
    const { def, errors } = compilePine(editorSource, DRAFT_ID);
    if (!def) {
      set({ errors, draftName: null });
      return;
    }
    const existing = scripts.find((s) => s.name === def.name);
    const id = existing?.id ?? newId();
    const script: PineScript = { id, name: def.name, source: editorSource };
    const next = existing ? scripts.map((s) => (s.id === id ? script : s)) : [...scripts, script];
    persist(next);
    const { def: savedDef } = compilePine(editorSource, id);
    if (savedDef) registerCustomDef(savedDef);
    // 草稿登记即陈旧：alertcondition 元数据已随新 id 重新登记，清掉 DRAFT_ID 残留
    // （后续草稿使用 run/addDraftToChart 会重新登记；已入图草稿指标的报警触发走
    //  computeExtra 旁路采样，不依赖本注册表）
    clearPineAlerts(DRAFT_ID);
    set({ scripts: next, errors: [], draftName: def.name });
  },

  remove: (id) => {
    const { scripts } = get();
    // 删除不存在的 id：直接返回，不动任何登记（避免误清同 id 的既有元数据）
    if (!scripts.some((s) => s.id === id)) return;
    const next = scripts.filter((s) => s.id !== id);
    persist(next);
    unregisterCustomDef(id);
    // 与 save 路径同源：脚本删除后其 alertcondition 登记一并注销
    clearPineAlerts(id);
    useIndicatorStore.getState().remove(id);
    set({ scripts: next });
  },

  loadIntoEditor: (id) => {
    const s = get().scripts.find((x) => x.id === id);
    if (s) set({ editorSource: s.source, errors: [] });
  },

  addDraftToChart: () => {
    if (!get().run()) return;
    useIndicatorStore.getState().add(DRAFT_ID);
  },
}));
