import type { PlotKind, PlotStyle } from '../core/types';
import type { HlineStmt, PaintStmt, PlotStmt } from './ast';
import { COLORS } from './series';
import { parseExprSrc } from './expr';

/**
 * 绘图指令（plot / hline / bgcolor / barcolor）参数解析。
 * 位置参数取第一个顶层逗号前；title/color/linewidth/style 走关键字提取。
 */

/** 取第一个顶层逗号分隔的 [首个实参, 其余] */
function topCommaSplit(inner: string): [string, string] {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) return [inner.slice(0, i), inner.slice(i + 1)];
  }
  return [inner, ''];
}

function kwNumber(rest: string, key: string): number | null {
  const m = rest.match(new RegExp(`${key}\\s*=\\s*(-?[0-9.]+)`, 'i'));
  return m ? Number(m[1]) : null;
}

/** 解析 color= 值：color.xxx 常量或 #hex；未知返回 null */
function resolveColor(rest: string): string | null {
  const tok = rest.match(/color\s*=\s*"?([\w.#]+)"?/i)?.[1] ?? null;
  if (!tok) return null;
  if (tok.startsWith('#')) return tok;
  return COLORS[tok] ?? null;
}

function callInner(text: string): string {
  return text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
}

export function parsePlotDirective(text: string, line: number): PlotStmt {
  const [exprSrc, rest] = topCommaSplit(callInner(text));
  const title = rest.match(/"([^"]*)"/)?.[1] ?? '';
  const width = kwNumber(rest, 'linewidth') ?? kwNumber(rest, 'line_width') ?? 1;
  const styleRaw = rest.match(/style\s*=\s*plot\.style_(\w+)/i)?.[1] ?? 'line';
  const color = resolveColor(rest) ?? COLORS['color.blue'];
  const kind: PlotKind = styleRaw === 'histogram' || styleRaw === 'columns' ? 'histogram' : 'line';
  const style: PlotStyle =
    kind === 'histogram'
      ? { kind: 'histogram', color, upColor: '#26a69a', downColor: '#ef5350', colorByBar: false }
      : { kind: 'line', color, lineWidth: width };
  return { t: 'plot', expr: parseExprSrc(exprSrc), title, style, line };
}

export function parseHlineDirective(text: string, line: number): HlineStmt {
  const [priceSrc, rest] = topCommaSplit(callInner(text));
  const title = rest.match(/"([^"]*)"/)?.[1] ?? '';
  return { t: 'hline', price: parseExprSrc(priceSrc), title, color: resolveColor(rest), line };
}

/** bgcolor/barcolor：纯 color.xxx 常量 → 恒生效；否则视为条件序列 */
export function parsePaintDirective(text: string, line: number): PaintStmt {
  const kind = /^bgcolor/.test(text) ? 'bgcolor' : 'barcolor';
  const [argSrc, rest] = topCommaSplit(callInner(text));
  const kwColor = resolveColor(rest);
  const trimmed = argSrc.trim();
  if (/^color\.\w+$/.test(trimmed)) {
    return { t: kind, color: COLORS[trimmed] ?? kwColor ?? COLORS['color.blue'], cond: null, line };
  }
  return { t: kind, color: kwColor ?? COLORS['color.blue'], cond: trimmed ? parseExprSrc(trimmed) : null, line };
}
