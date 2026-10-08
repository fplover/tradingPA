/** 本地文本行 → 档位集合（百分比小数）：输入按 % 填写，此处 ÷100 存小数。
 *  校验规则：非法值（非数字/NaN）整批返回 null 不写入；空文本行视为待编辑新行（跳过）；
 *  重复值跳过并保持原档顺序；结果为空（无有效档）返回 null——至少保留 1 档。 */
export function parseLevelTexts(texts: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const t of texts) {
    if (t.trim() === '') continue;
    const n = Number(t.trim());
    if (!Number.isFinite(n)) return null;
    const v = Math.round((n / 100) * 1e6) / 1e6; // ÷100 存小数，并 round 掉二进制毛刺（23.6% → 0.236）
    if (out.includes(v)) continue; // 重复值跳过，保持原档顺序
    out.push(v);
  }
  return out.length === 0 ? null : out;
}
