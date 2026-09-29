/**
 * 命令面板模糊匹配（P1-E）：子序列匹配 + 连续/词首加分 + 长度惩罚。
 * 纯函数，可单测。返回 null = 不匹配；数值越大越靠前。
 */
const WORD_START = /[\s/·:・\-_(（【[]/;

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (q.length === 0) return 0;
  if (q.length > t.length) return null;
  let score = 0;
  let prev = -2;
  let from = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, from);
    if (idx === -1) return null;
    score += 1;
    if (idx === prev + 1) score += 3;
    else if (idx === 0 || WORD_START.test(t[idx - 1])) score += 2;
    prev = idx;
    from = idx + 1;
  }
  // 越短的目标越精准
  score -= (t.length - q.length) * 0.01;
  return score;
}

export interface Matchable {
  title: string;
  keywords?: string;
}

/**
 * 过滤并排序：标题命中优先于 keywords 命中（keywords 分数打五折）；
 * 空查询返回原顺序全量。排序稳定（同分保持注册顺序）。
 */
export function filterCommands<T extends Matchable>(items: T[], query: string): T[] {
  if (!query.trim()) return items.slice();
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const t = fuzzyScore(query, item.title);
    const k = item.keywords ? fuzzyScore(query, item.keywords) : null;
    let score: number | null = t;
    if (score === null && k !== null) score = k * 0.5;
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
