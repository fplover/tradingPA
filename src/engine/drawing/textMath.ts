/** 文本类工具纯几何（P2-B）：字符宽度估算 + 文本框尺寸 + 价格位数估计。
 *  不依赖 canvas / DOM：渲染（textRender）、命中测试（drawDrawings）、单测共用。
 *  宽度口径：CJK 全宽 = fontSize，拉丁/数字 ≈ 0.6 × fontSize（Trebuchet MS 近似）。
 *  渲染取精确宽度用 ctx.measureText，命中取本估算 + 4px 外扩，两者偏差在容差内。 */

/** CJK 及全宽符号区段（表意文字/韩文/全角 ASCII/中文标点） */
const CJK_RE = /[\u1100-\u11ff\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;

/** 估算文本像素宽（CJK 全宽 / 拉丁 0.6 宽） */
export function measureTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += CJK_RE.test(ch) ? fontSize : fontSize * 0.6;
  return w;
}

/** 多行文本切分（\n）；空串按单行空串处理（便签允许空内容占位） */
export function splitTextLines(text: string): string[] {
  if (text === '') return [''];
  return text.split('\n');
}

/** 便签背景框尺寸：行高 = fontSize × 1.4，内边距 8/6，最小宽 40（宽取整） */
export function noteBoxSize(lines: readonly string[], fontSize: number): { w: number; h: number } {
  const lineHeight = Math.round(fontSize * 1.4);
  const w = Math.round(Math.max(40, Math.max(...lines.map((l) => measureTextWidth(l, fontSize))) + 16));
  const h = lines.length * lineHeight + 12;
  return { w, h };
}

/** 价签/标签框尺寸：内边距 6/3，最小宽 28（宽取整） */
export function labelBoxSize(text: string, fontSize: number): { w: number; h: number } {
  const w = Math.round(Math.max(28, measureTextWidth(text, fontSize) + 12));
  const h = fontSize + 8;
  return { w, h };
}

/** 锚定文本命中盒（渲染为无框文本 + 锚点圆点）：文本宽 + 8，行高 + 8（宽取整） */
export function textBoxSize(lines: readonly string[], fontSize: number): { w: number; h: number } {
  const w = Math.round(Math.max(...lines.map((l) => measureTextWidth(l, fontSize))) + 8);
  const h = lines.length * Math.round(fontSize * 1.4) + 8;
  return { w, h };
}

/** 箭头标记命中盒：14px 箭杆 + 6px 箭头 + 间隙后的文本（宽取整） */
export function arrowMarkBoxSize(text: string, fontSize: number): { w: number; h: number } {
  const w = Math.round(24 + measureTextWidth(text, fontSize) + 8);
  const h = Math.max(fontSize + 8, 16);
  return { w, h };
}

/** 价格标签内容估算字符数（命中盒用）：整数位 + 小数点 + 2 位小数，至少 4 字符 */
export function estimatePriceChars(price: number): number {
  return Math.max(4, String(Math.abs(Math.round(price))).length + 3);
}
