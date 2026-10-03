import type { PlotKind, PlotStyle } from '../core/types';
import type { AlertStmt, HlineStmt, PaintStmt, PlotStmt, ShapeStmt } from './ast';
import { COLORS } from './series';
import { parseExprSrc } from './expr';

/**
 * 绘图指令（plot / hline / bgcolor / barcolor / plotshape / plotchar / alertcondition）
 * 参数解析。位置参数取第一个顶层逗号前；title/color/linewidth/style 走关键字提取。
 * plotshape/plotchar 额外支持 shape、location、size 常量与 text、char、price 关键字，
 * 以及 TV 常用位置序（series, title, style 或 char, location, color, size, text）。
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

/** 按顶层逗号全量拆分（字符串/括号感知） */
function splitTopCommas(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  out.push(inner.slice(start));
  return out;
}

/** 去引号字符串字面量值；非字符串返回 null */
function strVal(v: string): string | null {
  const t = v.trim();
  const m = t.match(/^"([^"]*)"$/) ?? t.match(/^'([^']*)'$/);
  return m ? m[1] : null;
}

/** 解析颜色 token：color.xxx 常量或 #hex；未知返回 null */
function colorToken(v: string): string | null {
  const t = v.trim().replace(/^"|"$/g, '');
  if (t.startsWith('#')) return /^#[0-9a-fA-F]{3,8}$/.test(t) ? t : null;
  return COLORS[t] ?? null;
}

/** TV 常用 shape 子集（渲染层 drawPineShapes 按名画路径） */
const SHAPE_NAMES = new Set(['triangleup', 'triangledown', 'circle', 'xcross', 'cross', 'diamond', 'circle-cross']);
const LOCATION_NAMES = new Set(['belowbar', 'abovebar', 'absolute']);
/** size.* 常量 → 像素；数值 size= 直接取用（钳 [2,40]） */
const SIZE_MAP: Record<string, number> = { tiny: 4, small: 6, normal: 8, large: 12, huge: 16 };

function clampSize(n: number): number {
  return Math.max(2, Math.min(40, Math.round(n)));
}

/**
 * plotshape/plotchar 指令解析。
 * 首位置参数 = 条件序列；title/style/location/color/size/text/char/price 走关键字，
 * 其余按 TV 位置序兜底（字符串：plotshape→title/text，plotchar→title/char；
 * shape.*→style，location.*→location，颜色 token→color，数字→size，
 * 剩余表达式仅在 location.absolute 时作为 price）。
 */
export function parseShapeDirective(text: string, line: number, isChar = false): ShapeStmt {
  const args = splitTopCommas(callInner(text));
  const condSrc = args[0];
  if (!condSrc.trim()) throw new Error(`${isChar ? 'plotchar' : 'plotshape'} 缺少条件参数`);
  const name = isChar ? 'plotchar' : 'plotshape';

  let title = '';
  let style = isChar ? '' : 'circle';
  let char: string | null = null;
  let location: ShapeStmt['location'] = 'abovebar';
  let color = COLORS['color.blue'];
  let size = SIZE_MAP.normal;
  let textOut: string | null = null;
  let priceSrc: string | null = null;
  const positional: string[] = [];

  for (const arg of args.slice(1)) {
    const kw = arg.trim().match(/^(\w+)\s*=\s*([\s\S]*)$/);
    if (!kw) {
      positional.push(arg);
      continue;
    }
    const k = kw[1].toLowerCase();
    const v = kw[2];
    switch (k) {
      case 'title':
        title = strVal(v) ?? title;
        break;
      case 'text':
        textOut = strVal(v) ?? textOut;
        break;
      case 'char':
        char = strVal(v) ?? char;
        break;
      case 'style': {
        const m = v.trim().match(/^shape\.([\w-]+)$/);
        if (m) style = m[1];
        break;
      }
      case 'location': {
        const m = v.trim().match(/^location\.(\w+)$/);
        if (m) location = m[1] as ShapeStmt['location'];
        break;
      }
      case 'color': {
        const c = colorToken(v);
        if (c) color = c;
        else throw new Error(`无法解析的颜色「${v.trim()}」`);
        break;
      }
      case 'size': {
        const m = v.trim().match(/^size\.(\w+)$/);
        if (m) {
          if (SIZE_MAP[m[1]] === undefined) throw new Error(`未知的 size「${m[1]}」`);
          size = SIZE_MAP[m[1]];
        } else {
          const n = Number(v.trim());
          if (!Number.isFinite(n)) throw new Error('size 需为数字或 size.* 常量');
          size = clampSize(n);
        }
        break;
      }
      case 'price':
        priceSrc = v.trim();
        break;
      default:
        break; // 未识别关键字忽略（与 plot 解析一致，容忍 offset/editable 等 TV 参数）
    }
  }

  let strSeen = 0;
  for (const p of positional) {
    const t = p.trim();
    if (!t) continue;
    if (/^".*"$/.test(t) || /^'.*'$/.test(t)) {
      const v = strVal(t)!;
      if (strSeen === 0) title = v;
      else if (isChar) char = char ?? v;
      else textOut = textOut ?? v;
      strSeen++;
      continue;
    }
    const sm = t.match(/^shape\.([\w-]+)$/);
    if (sm) {
      style = sm[1];
      continue;
    }
    const lm = t.match(/^location\.(\w+)$/);
    if (lm) {
      location = lm[1] as ShapeStmt['location'];
      continue;
    }
    const cm = t.match(/^(color\.\w+|#[0-9a-fA-F]{3,8})$/);
    if (cm) {
      color = colorToken(cm[1]) ?? color;
      continue;
    }
    if (/^-?[0-9.]+$/.test(t)) {
      size = clampSize(Number(t));
      continue;
    }
    if (location === 'absolute' && !priceSrc) {
      priceSrc = t;
      continue;
    }
    throw new Error(`${name} 无法识别的位置参数「${t}」（absolute 定位价格请用 price= 或第三位置参数）`);
  }

  if (!isChar && !SHAPE_NAMES.has(style))
    throw new Error(`不支持的 shape「shape.${style}」（可用：${[...SHAPE_NAMES].join('/')}）`);
  if (!LOCATION_NAMES.has(location)) throw new Error(`不支持的 location「location.${location}」`);
  if (location === 'absolute' && !priceSrc) throw new Error(`${name} location.absolute 需提供 price= 价格表达式`);

  return {
    t: isChar ? 'plotchar' : 'plotshape',
    cond: parseExprSrc(condSrc),
    title,
    style,
    // plotchar 字符缺省 ★（TV 默认）；plotshape 的 char 恒为 null
    char: isChar ? (char ?? '★') : null,
    location,
    color,
    size,
    text: textOut,
    price: priceSrc ? parseExprSrc(priceSrc) : null,
    line,
  };
}

/** alertcondition：条件序列 + title/message 关键字（纯警报脚本无 plot 亦合法） */
export function parseAlertDirective(text: string, line: number): AlertStmt {
  const args = splitTopCommas(callInner(text));
  const condSrc = args[0];
  if (!condSrc.trim()) throw new Error('alertcondition 缺少条件参数');
  let title = '';
  let message: string | null = null;
  for (const arg of args.slice(1)) {
    const kw = arg.trim().match(/^(\w+)\s*=\s*([\s\S]*)$/);
    if (!kw) continue;
    const k = kw[1].toLowerCase();
    if (k === 'title') title = strVal(kw[2]) ?? title;
    else if (k === 'message') message = strVal(kw[2]) ?? message;
  }
  return {
    t: 'alertcondition',
    cond: parseExprSrc(condSrc),
    title,
    message: message ?? title,
    line,
  };
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
