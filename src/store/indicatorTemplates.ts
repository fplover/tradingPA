// 指标模板持久化域（TV 指标对话框 Templates 形态）：多命名模板的 localStorage
// 序列化 / 坏数据兜底 / 旧单槽 key 迁移，及面板用纯函数（重名解析 / 行排序 / 相对时间）。
// 自 indicatorStore 拆出（单文件 ≤300 行红线）：store 只保留状态与动作。
// ActiveIndicator 仅为类型引用（import type 编译期擦除），无模块初始化环。
import type { ActiveIndicator } from '@/store/indicatorStore';

/** 命名指标模板：整份 active 列表的快照 + 名称 + 保存时间 */
export interface IndicatorTemplate {
  id: string;
  name: string;
  list: ActiveIndicator[];
  savedAt: number;
}

/** 多模板存储 key */
export const TEMPLATES_KEY = 'tradingpa.indicatorTemplates';
/** 旧版单槽 key（仅存一份 active 列表，无名无管理）；迁移后清除 */
export const LEGACY_KEY = 'tradingpa.indicatorTemplate';

/** 命名模板数量上限，防止 localStorage 无上限增长（与 MAX_SAVED_LAYOUTS 同思路） */
export const MAX_TEMPLATES = 50;

/** 旧单槽迁移后的默认名 */
export const DEFAULT_TEMPLATE_NAME = '默认模板';

/** 空名称回落名（面板保存按钮同时置灰，这里兜底 store 直调 / rename 空输入） */
export const UNNAMED_TEMPLATE = '未命名模板';

function isActiveIndicator(v: unknown): v is ActiveIndicator {
  return !!v && typeof v === 'object' && typeof (v as ActiveIndicator).id === 'string';
}

/** 单条快照拷贝：params 浅拷贝防存档与内存态相互污染（与 captureSnapshot 同语义） */
function cloneEntry(a: ActiveIndicator): ActiveIndicator {
  return { ...a, params: { ...a.params } };
}

/** 逐条归一化：缺字段 / 类型不符的条目丢弃，单条损坏不拖垮整份存档 */
function parseTemplate(v: unknown): IndicatorTemplate | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Partial<IndicatorTemplate>;
  if (typeof t.id !== 'string' || !t.id) return null;
  if (typeof t.name !== 'string' || !t.name) return null;
  if (!Array.isArray(t.list)) return null;
  return {
    id: t.id,
    name: t.name,
    savedAt: typeof t.savedAt === 'number' && Number.isFinite(t.savedAt) ? t.savedAt : Date.now(),
    list: t.list.filter(isActiveIndicator).map(cloneEntry),
  };
}

let idSeq = 0;
export function newTemplateId(): string {
  idSeq += 1;
  return `tpl-${Date.now().toString(36)}-${idSeq}`;
}

/** 旧单槽迁移：新 key 缺失时把旧 key 的 active 列表迁为一条「默认模板」，
 *  成功后写新 key 并清除旧 key（防重复迁移、防丢用户数据）。无旧档 / 旧档损坏 /
 *  旧档为空列表时返回 null（保持无模板态，不写新 key）。 */
function migrateLegacy(): IndicatorTemplate[] | null {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as unknown;
    if (!Array.isArray(parsed)) return null;
    const list = parsed.filter(isActiveIndicator).map(cloneEntry);
    if (list.length === 0) return null;
    const templates: IndicatorTemplate[] = [
      { id: newTemplateId(), name: DEFAULT_TEMPLATE_NAME, list, savedAt: Date.now() },
    ];
    persistTemplates(templates);
    localStorage.removeItem(LEGACY_KEY);
    return templates;
  } catch {
    return null;
  }
}

/** 读档（store 初始化时调用一次）：新 key 缺失 → 尝试旧单槽迁移；其余走归一化兜底 */
export function loadTemplates(): IndicatorTemplate[] {
  // 初值无意义：下面 try 内必赋值，catch 直接 return（eslint 10 的 no-useless-assignment）
  let raw: string | null;
  try {
    raw = localStorage.getItem(TEMPLATES_KEY);
  } catch {
    return [];
  }
  if (raw === null) {
    const migrated = migrateLegacy();
    if (migrated) return migrated;
  }
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseTemplate)
      .filter((t): t is IndicatorTemplate => t !== null)
      .slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

/** 落盘：隐私模式 / 存储超额时静默失败，内存态继续可用（不阻断保存动作） */
export function persistTemplates(list: IndicatorTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list.slice(0, MAX_TEMPLATES)));
  } catch {
    /* 忽略 */
  }
}

/** 重名解析：名称已被占用时追加「 (2)」「 (3)」…序号（TV 保存重名不覆盖既有模板）。
 *  taken 为现有名称集合（rename 场景传入除自身外的名称）；空名回落 UNNAMED_TEMPLATE。 */
export function resolveUniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const name = base.trim() || UNNAMED_TEMPLATE;
  if (!used.has(name)) return name;
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}

/** 模板行排序：最新保存在前（与命名布局 savedLayouts 展示顺序一致） */
export function sortTemplates(list: IndicatorTemplate[]): IndicatorTemplate[] {
  return [...list].sort((a, b) => b.savedAt - a.savedAt);
}

/** 相对时间（模板行展示）：刚刚 / N 分钟前 / N 小时前 / N 天前 / 超出一个月落具体日期 */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days} 天前`;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
