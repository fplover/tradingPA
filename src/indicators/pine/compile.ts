import type { Bar } from '@/types/market';
import type { IndicatorDef, IndicatorParam, IndicatorPlot, ParamValue, PlotStyle } from '../core/types';
import { COLORS, math, ops, sourceSeries, ta, toSeries, type S } from './series';

/**
 * Pine v5 子集编译器：把脚本编译成标准 IndicatorDef，
 * 从而复用既有的副图/图例/设置对话框/模板管线。
 * 支持：indicator()/study()、input.int/input.bool/input.source、赋值、
 * plot()、ta.sma/ema/rsi/stdev/highest/lowest/change/crossover/crossunder/nz、
 * math.*、open/high/low/close/volume/hl2/hlc3/ohlc4、color.*、四则与比较/逻辑运算。
 */

export interface PineError {
  line: number;
  message: string;
}

export interface CompileResult {
  def: IndicatorDef | null;
  errors: PineError[];
}

type Expr =
  | { t: 'num'; v: number }
  | { t: 'ident'; name: string }
  | { t: 'bin'; op: string; l: Expr; r: Expr }
  | { t: 'un'; op: string; e: Expr }
  | { t: 'call'; fn: string; args: Expr[] };

interface PlotSpec {
  expr: Expr;
  title: string;
  style: PlotStyle;
  line: number;
}

// ---------- tokenizer ----------

interface Tok {
  t: 'num' | 'ident' | 'str' | 'op';
  v: string;
}

const OPS = ['>=', '<=', '==', '!=', '&&', '||', '+', '-', '*', '/', '>', '<', '(', ')', ',', '='];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j).replace(/_/g, '') });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w.]/.test(src[j])) j++;
      out.push({ t: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j++;
      out.push({ t: 'str', v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`无法识别的字符「${c}」`);
    out.push({ t: 'op', v: op });
    i += op.length;
  }
  return out;
}

// ---------- parser ----------

class Parser {
  private pos = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private next(): Tok {
    const t = this.toks[this.pos++];
    if (!t) throw new Error('表达式意外结束');
    return t;
  }
  private eat(op: string): boolean {
    if (this.peek()?.t === 'op' && this.peek()?.v === op) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseExpr(): Expr {
    return this.parseOr();
  }
  private parseOr(): Expr {
    let l = this.parseAnd();
    while (this.peek()?.v === '||' || this.peek()?.v === 'or') {
      this.next();
      l = { t: 'bin', op: 'or', l, r: this.parseAnd() };
    }
    return l;
  }
  private parseAnd(): Expr {
    let l = this.parseCmp();
    while (this.peek()?.v === '&&' || this.peek()?.v === 'and') {
      this.next();
      l = { t: 'bin', op: 'and', l, r: this.parseCmp() };
    }
    return l;
  }
  private parseCmp(): Expr {
    let l = this.parseAdd();
    for (;;) {
      const op = this.peek()?.v;
      if (op === '>' || op === '<' || op === '>=' || op === '<=' || op === '==' || op === '!=') {
        this.next();
        l = { t: 'bin', op, l, r: this.parseAdd() };
        continue;
      }
      return l;
    }
  }
  private parseAdd(): Expr {
    let l = this.parseMul();
    for (;;) {
      const op = this.peek()?.v;
      if (op === '+' || op === '-') {
        this.next();
        l = { t: 'bin', op, l, r: this.parseMul() };
        continue;
      }
      return l;
    }
  }
  private parseMul(): Expr {
    let l = this.parseUnary();
    for (;;) {
      const op = this.peek()?.v;
      if (op === '*' || op === '/') {
        this.next();
        l = { t: 'bin', op, l, r: this.parseUnary() };
        continue;
      }
      return l;
    }
  }
  private parseUnary(): Expr {
    const op = this.peek()?.v;
    if (op === '-') {
      this.next();
      return { t: 'un', op: 'neg', e: this.parseUnary() };
    }
    if (op === '!' || op === 'not') {
      this.next();
      return { t: 'un', op: 'not', e: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    const t = this.next();
    if (t.t === 'num') return { t: 'num', v: Number(t.v) };
    if (t.t === 'str') return { t: 'ident', name: `str:${t.v}` };
    if (t.t === 'ident') {
      if (t.v === 'true') return { t: 'num', v: 1 };
      if (t.v === 'false') return { t: 'num', v: 0 };
      if (this.peek()?.v === '(') {
        this.next();
        const args: Expr[] = [];
        if (!this.eat(')')) {
          for (;;) {
            args.push(this.parseExpr());
            if (!this.eat(',')) break;
          }
          this.eat(')');
        }
        return { t: 'call', fn: t.v, args };
      }
      return { t: 'ident', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      const e = this.parseExpr();
      this.eat(')');
      return e;
    }
    throw new Error(`无法解析的记号「${t.v}」`);
  }
}

function parseExprSrc(src: string): Expr {
  return new Parser(tokenize(src)).parseExpr();
}

/** 静态收集 ta.* / math.* 调用里的字面量周期，用于估算 lookback */
function collectLookback(e: Expr, acc: { max: number }): void {
  if (e.t === 'call') {
    if (/^(ta|math)\./.test(e.fn) && e.args.length >= 2 && e.args[1].t === 'num') {
      acc.max = Math.max(acc.max, (e.args[1] as { v: number }).v);
    }
    for (const a of e.args) collectLookback(a, acc);
  } else if (e.t === 'bin') {
    collectLookback(e.l, acc);
    collectLookback(e.r, acc);
  } else if (e.t === 'un') {
    collectLookback(e.e, acc);
  }
}

const ALLOWED_FNS = new Set([
  'ta.sma',
  'ta.ema',
  'ta.rsi',
  'ta.stdev',
  'ta.highest',
  'ta.lowest',
  'ta.change',
  'ta.crossover',
  'ta.crossunder',
  'ta.nz',
  'math.abs',
  'math.max',
  'math.min',
  'math.round',
  'math.floor',
  'math.ceil',
  'math.sqrt',
  'math.log',
  'math.log10',
  'math.sign',
]);

const SOURCE_NAMES = new Set(['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4']);

/** 编译期校验函数与标识符，避免错误延迟到求值期才暴露 */
function validate(e: Expr, known: Set<string>, errors: PineError[], line: number): void {
  if (e.t === 'call') {
    if (!ALLOWED_FNS.has(e.fn)) errors.push({ line, message: `不支持的函数「${e.fn}」` });
    for (const a of e.args) validate(a, known, errors, line);
  } else if (e.t === 'bin') {
    validate(e.l, known, errors, line);
    validate(e.r, known, errors, line);
  } else if (e.t === 'un') {
    validate(e.e, known, errors, line);
  } else if (e.t === 'ident') {
    if (e.name.startsWith('str:')) return;
    if (!SOURCE_NAMES.has(e.name) && !known.has(e.name)) {
      errors.push({ line, message: '未定义的标识符: ' + e.name });
    }
  }
}

// ---------- compile ----------

export function compilePine(source: string, id: string): CompileResult {
  const errors: PineError[] = [];
  const lines = source.split(/\r?\n/);
  let name = '自定义指标';
  let overlay = false;
  const params: IndicatorParam[] = [];
  const assigns: Array<{ key: string; expr: Expr; line: number }> = [];
  const plots: PlotSpec[] = [];

  const argString = (callSrc: string, key: string): string | null => {
    const re = new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i');
    const m = callSrc.match(re);
    return m ? m[1] : null;
  };
  const argNumber = (callSrc: string, key: string): number | null => {
    const m = callSrc.match(new RegExp(`${key}\\s*=\\s*(-?[0-9.]+)`, 'i'));
    return m ? Number(m[1]) : null;
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const lineNo = idx + 1;
    if (!line || line.startsWith('//')) return;
    try {
      if (/^(indicator|study)\s*\(/.test(line)) {
        const m = line.match(/^\w+\s*\(\s*"([^"]*)"/);
        if (m) name = m[1];
        if (/overlay\s*=\s*true/i.test(line)) overlay = true;
        return;
      }
      if (line.startsWith('plot')) {
        const inner = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'));
        // 第一个参数为表达式：取到第一个顶层逗号
        const depth = { d: 0, end: inner.length };
        let inStr: string | null = null;
        for (let i = 0; i < inner.length; i++) {
          const c = inner[i];
          if (inStr) {
            if (c === inStr) inStr = null;
            continue;
          }
          if (c === '"' || c === "'") inStr = c;
          else if (c === '(') depth.d++;
          else if (c === ')') depth.d--;
          else if (c === ',' && depth.d === 0) {
            depth.end = i;
            break;
          }
        }
        const exprSrc = inner.slice(0, depth.end);
        const rest = inner.slice(depth.end);
        // 位置参数：第一个字符串即 plot 标题；color= 允许无引号标识符
        const title = rest.match(/"([^"]*)"/)?.[1] ?? name;
        const colorTok = rest.match(/color\s*=\s*"?([\w.#]+)"?/)?.[1] ?? null;
        const width = argNumber(rest, 'linewidth') ?? argNumber(rest, 'line_width') ?? 1;
        const styleRaw = rest.match(/style\s*=\s*plot\.style_(\w+)/i)?.[1] ?? 'line';
        const style: PlotStyle =
          styleRaw === 'histogram' || styleRaw === 'columns'
            ? { kind: 'histogram', color: COLORS['color.blue'], upColor: '#26a69a', downColor: '#ef5350', colorByBar: false }
            : { kind: 'line', color: COLORS['color.blue'], lineWidth: width };
        if (colorTok && COLORS[colorTok]) style.color = COLORS[colorTok];
        else if (colorTok && colorTok.startsWith('#')) style.color = colorTok;
        plots.push({ expr: parseExprSrc(exprSrc), title, style, line: lineNo });
        return;
      }
      const assign = line.match(/^([A-Za-z_][\w.]*)\s*=(?!=)\s*(.+)$/);
      if (assign) {
        const [, key, rhs] = assign;
        const inputMatch = rhs.match(/^input\.(int|bool|source)\s*\(/);
        if (inputMatch) {
          const kind = inputMatch[1];
          const label = argString(rhs, 'title') ?? argString(rhs, 'defval') ?? key;
          if (kind === 'int') {
            const def = Number(rhs.match(/input\.int\s*\(\s*(-?[0-9.]+)/)?.[1] ?? 1);
            params.push({
              key,
              label,
              type: 'number',
              default: def,
              min: argNumber(rhs, 'minval') ?? undefined,
              max: argNumber(rhs, 'maxval') ?? undefined,
              step: argNumber(rhs, 'step') ?? 1,
            });
          } else if (kind === 'bool') {
            const def = /input\.bool\s*\(\s*true/i.test(rhs);
            params.push({ key, label, type: 'boolean', default: def });
          } else {
            const def = rhs.match(/input\.source\s*\(\s*([\w.]+)/)?.[1] ?? 'close';
            params.push({
              key,
              label,
              type: 'select',
              default: def,
              options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].map((v) => ({ label: v, value: v })),
            });
          }
          return;
        }
        assigns.push({ key, expr: parseExprSrc(rhs), line: lineNo });
        return;
      }
      errors.push({ line: lineNo, message: `不支持的语句：${line.slice(0, 40)}` });
    } catch (e) {
      errors.push({ line: lineNo, message: e instanceof Error ? e.message : String(e) });
    }
  });

  if (plots.length === 0 && errors.length === 0) {
    errors.push({ line: lines.length, message: '脚本缺少 plot() 调用' });
  }
  const known = new Set<string>(params.map((p) => p.key));
  for (const a of assigns) known.add(a.key);
  for (const a of assigns) validate(a.expr, known, errors, a.line);
  for (const p of plots) validate(p.expr, known, errors, p.line);
  if (errors.length > 0) return { def: null, errors };

  const acc = { max: 100 };
  for (const a of assigns) collectLookback(a.expr, acc);
  for (const p of plots) collectLookback(p.expr, acc);

  const plotDefs: IndicatorPlot[] = plots.map((p, i) => ({ key: `p${i}`, label: p.title, style: p.style }));

  const def: IndicatorDef = {
    id,
    name,
    category: '自定义',
    overlay,
    lookback: Math.min(2000, Math.ceil(acc.max) + 50),
    params,
    plots: plotDefs,
    compute(bars: readonly Bar[], prm: Record<string, ParamValue>) {
      const n = bars.length;
      const env = new Map<string, S>();
      for (const [key, value] of Object.entries(prm)) {
        if (typeof value === 'number') env.set(key, toSeries(value, n));
        else if (typeof value === 'boolean') env.set(key, toSeries(value ? 1 : 0, n));
        else {
          const src = sourceSeries(bars, String(value));
          if (src) env.set(key, src);
        }
      }
      const evalExpr = (e: Expr): S => {
        switch (e.t) {
          case 'num':
            return toSeries(e.v, n);
          case 'ident': {
            if (e.name.startsWith('str:')) return toSeries(NaN, n);
            const src = sourceSeries(bars, e.name);
            if (src) return src;
            const v = env.get(e.name);
            if (v) return v;
            throw new Error(`未定义的标识符「${e.name}」`);
          }
          case 'un': {
            const a = evalExpr(e.e);
            return e.op === 'neg' ? ops.neg(a) : ops.not(a);
          }
          case 'bin': {
            const a = evalExpr(e.l);
            const b = evalExpr(e.r);
            switch (e.op) {
              case '+':
                return ops.add(a, b);
              case '-':
                return ops.sub(a, b);
              case '*':
                return ops.mul(a, b);
              case '/':
                return ops.div(a, b);
              case '>':
                return ops.gt(a, b);
              case '<':
                return ops.lt(a, b);
              case '>=':
                return ops.gte(a, b);
              case '<=':
                return ops.lte(a, b);
              case '==':
                return ops.eq(a, b);
              case '!=':
                return ops.not(ops.eq(a, b));
              case 'and':
                return ops.and(a, b);
              case 'or':
                return ops.or(a, b);
              default:
                throw new Error(`不支持的运算符「${e.op}」`);
            }
          }
          case 'call': {
            const args = e.args.map(evalExpr);
            const numArg = (i: number): number => {
              const s = args[i];
              const v = s?.[s.length - 1];
              if (typeof v !== 'number') throw new Error(`${e.fn} 的参数需为常量`);
              return v;
            };
            switch (e.fn) {
              case 'ta.sma':
                return ta.sma(args[0], numArg(1));
              case 'ta.ema':
                return ta.ema(args[0], numArg(1));
              case 'ta.rsi':
                return ta.rsi(args[0], numArg(1));
              case 'ta.stdev':
                return ta.stdev(args[0], numArg(1));
              case 'ta.highest':
                return ta.highest(args[0], numArg(1));
              case 'ta.lowest':
                return ta.lowest(args[0], numArg(1));
              case 'ta.change':
                return ta.change(args[0], e.args.length > 1 ? numArg(1) : 1);
              case 'ta.crossover':
                return ta.crossover(args[0], args[1]);
              case 'ta.crossunder':
                return ta.crossunder(args[0], args[1]);
              case 'ta.nz':
                return ta.nz(args[0]);
              case 'math.abs':
                return math.abs(args[0]);
              case 'math.max':
                return math.max(args[0], args[1]);
              case 'math.min':
                return math.min(args[0], args[1]);
              case 'math.round':
                return math.round(args[0]);
              case 'math.floor':
                return math.floor(args[0]);
              case 'math.ceil':
                return math.ceil(args[0]);
              case 'math.sqrt':
                return math.sqrt(args[0]);
              case 'math.log':
                return math.log(args[0]);
              case 'math.sign':
                return math.sign(args[0]);
              default:
                throw new Error(`不支持的函数「${e.fn}」`);
            }
          }
        }
      };
      for (const a of assigns) env.set(a.key, evalExpr(a.expr));
      const out: Record<string, S> = {};
      plots.forEach((p, i) => {
        out[`p${i}`] = evalExpr(p.expr);
      });
      return out;
    },
  };

  return { def, errors: [] };
}

export const DEFAULT_PINE_SCRIPT = `//@version=5
indicator("双均线交叉", overlay=true)
fast = input.int(9, "快线周期", minval=1, maxval=200)
slow = input.int(21, "慢线周期", minval=1, maxval=500)
src = input.source(close, "源")
f = ta.ema(src, fast)
s = ta.ema(src, slow)
plot(f, "快线", color=color.orange, linewidth=2)
plot(s, "慢线", color=color.blue, linewidth=2)
`;
