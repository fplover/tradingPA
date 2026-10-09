import type { Expr, PineProgram, Stmt, SwitchArm } from './ast';
import { parseExprSrc } from './expr';
import {
  parseAlertDirective,
  parseHlineDirective,
  parsePaintDirective,
  parsePlotDirective,
  parseShapeDirective,
} from './directives';

/**
 * Pine v5 子集语句解析器（行制 + 缩进块）。
 * 顶层：indicator/study/strategy 头、input.* 赋值、普通/var/varip 赋值、
 * 元组解构赋值、用户函数 f(x) => 块、plot/hline/bgcolor/barcolor/plotshape/
 * plotchar/alertcondition 指令。
 * 块内：赋值、if/else/else if、switch（subject/条件两形态）、for..to..by、
 * strategy.entry/close/exit 骨架调用、裸表达式（函数体返回值）。
 * 注释（//）与空行跳过，行号按源行计。
 */

interface SrcLine {
  no: number;
  indent: number;
  text: string;
}

function splitLines(source: string): SrcLine[] {
  const out: SrcLine[] = [];
  source.split(/\r?\n/).forEach((raw, idx) => {
    if (!raw.trim() || raw.trim().startsWith('//')) return;
    let indent = 0;
    for (const ch of raw) {
      if (ch === '\t') indent += 4;
      else if (ch === ' ') indent++;
      else break;
    }
    out.push({ no: idx + 1, indent, text: raw.trim() });
  });
  return out;
}

type ParsedStmt = { kind: 'stmt'; stmt: Stmt } | { kind: 'none' };

class StmtParser {
  private i = 0;
  readonly prog: PineProgram = {
    name: '自定义指标',
    overlay: false,
    params: [],
    body: [],
    plots: [],
    hlines: [],
    paints: [],
    shapes: [],
    alerts: [],
    funcs: new Map(),
  };

  constructor(private lines: SrcLine[]) {}

  parse(): PineProgram {
    while (this.i < this.lines.length) {
      const ln = this.lines[this.i];
      if (ln.indent !== 0) throw new Error(`第 ${ln.no} 行：顶层语句不应缩进`);
      try {
        const r = this.parseOne(ln, 0, false);
        if (r.kind === 'stmt') this.prog.body.push(r.stmt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.startsWith('第 ')) throw new Error(`第 ${ln.no} 行：${msg}`, { cause: e });
        throw e;
      }
    }
    return this.prog;
  }

  /** 解析缩进块，返回语句列表 */
  private parseBlock(parentIndent: number, lineNo: number): Stmt[] {
    const first = this.lines[this.i];
    if (!first || first.indent <= parentIndent) {
      throw new Error(`第 ${lineNo} 行：语句缺少缩进块`);
    }
    const base = first.indent;
    const stmts: Stmt[] = [];
    while (this.i < this.lines.length && this.lines[this.i].indent === base) {
      const r = this.parseOne(this.lines[this.i], base, true);
      if (r.kind === 'stmt') stmts.push(r.stmt);
      else this.i++;
    }
    return stmts;
  }

  private parseOne(ln: SrcLine, indent: number, nested: boolean): ParsedStmt {
    const { text, no: line } = ln;
    try {
      return this.dispatch(ln, indent, nested, text, line);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('第 ')) throw e;
      throw new Error(`第 ${line} 行：${msg}`, { cause: e });
    }
  }

  private dispatch(_ln: SrcLine, indent: number, nested: boolean, text: string, line: number): ParsedStmt {
    // strategy("name") 头与 indicator/study 同位（骨架：仅取名称与 overlay）
    if (/^(indicator|study|strategy)\s*\(/.test(text)) {
      if (nested) throw new Error('indicator() 只能出现在顶层');
      const m = text.match(/^\w+\s*\(\s*"([^"]*)"/);
      if (m) this.prog.name = m[1];
      if (/overlay\s*=\s*true/i.test(text)) this.prog.overlay = true;
      this.i++;
      return { kind: 'none' };
    }
    if (/^plot\s*\(/.test(text)) {
      if (nested) throw new Error('plot 必须在顶层');
      this.prog.plots.push(parsePlotDirective(text, line));
      this.i++;
      return { kind: 'none' };
    }
    if (/^hline\s*\(/.test(text)) {
      if (nested) throw new Error('hline 必须在顶层');
      this.prog.hlines.push(parseHlineDirective(text, line));
      this.i++;
      return { kind: 'none' };
    }
    if (/^(bgcolor|barcolor)\s*\(/.test(text)) {
      if (nested) throw new Error('bgcolor/barcolor 必须在顶层');
      this.prog.paints.push(parsePaintDirective(text, line));
      this.i++;
      return { kind: 'none' };
    }
    if (/^plotshape\s*\(/.test(text)) {
      if (nested) throw new Error('plotshape 必须在顶层');
      this.prog.shapes.push(parseShapeDirective(text, line));
      this.i++;
      return { kind: 'none' };
    }
    if (/^plotchar\s*\(/.test(text)) {
      if (nested) throw new Error('plotchar 必须在顶层');
      this.prog.shapes.push(parseShapeDirective(text, line, true));
      this.i++;
      return { kind: 'none' };
    }
    if (/^alertcondition\s*\(/.test(text)) {
      if (nested) throw new Error('alertcondition 必须在顶层');
      this.prog.alerts.push(parseAlertDirective(text, line));
      this.i++;
      return { kind: 'none' };
    }
    const fundef = text.match(/^([A-Za-z_]\w*)\s*\(([^()]*)\)\s*=>\s*(.*)$/);
    if (fundef) {
      if (nested) throw new Error('函数定义必须在顶层');
      this.parseFundef(fundef, indent, line);
      return { kind: 'none' };
    }
    if (/^if\s+/.test(text)) {
      const cond = parseExprSrc(text.replace(/^if\s+/, ''));
      this.i++;
      const then = this.parseBlock(indent, line);
      const els = this.parseElse(indent);
      return { kind: 'stmt', stmt: { t: 'if', cond, then, els, line } };
    }
    if (/^switch\b/.test(text)) {
      const subjectText = text.replace(/^switch\b/, '').trim();
      this.i++;
      const subject = subjectText ? parseExprSrc(subjectText) : null;
      const arms = this.parseSwitchArms(indent, line);
      return { kind: 'stmt', stmt: { t: 'switch', subject, arms, line } };
    }
    const stratM = text.match(/^strategy\.(entry|close|exit)\s*\(/);
    if (stratM) {
      const st = parseStrategyStmt(text, line);
      this.i++;
      return { kind: 'stmt', stmt: st };
    }
    const forM = text.match(/^for\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s+to\s+(.+?)(?:\s+by\s+(.+))?$/);
    if (forM) {
      const [, varName, fromS, toS, byS] = forM;
      this.i++;
      const body = this.parseBlock(indent, line);
      return {
        kind: 'stmt',
        stmt: {
          t: 'for',
          varName,
          from: parseExprSrc(fromS),
          to: parseExprSrc(toS),
          by: byS ? parseExprSrc(byS) : null,
          body,
          line,
        },
      };
    }
    const varipM = text.match(/^varip\s+([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (varipM) {
      // varip ≡ var（向量化离线模型无实时回滚），语法层保留区分
      this.i++;
      return { kind: 'stmt', stmt: { t: 'var', key: varipM[1], expr: parseExprSrc(varipM[2]), line } };
    }
    const varM = text.match(/^var\s+([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (varM) {
      this.i++;
      return { kind: 'stmt', stmt: { t: 'var', key: varM[1], expr: parseExprSrc(varM[2]), line } };
    }
    const tupleM = text.match(/^\[([^\]]+)\]\s*=(?!=)\s*(.+)$/);
    if (tupleM) {
      const keys = tupleM[1].split(',').map((k) => k.trim());
      if (keys.some((k) => !/^[A-Za-z_]\w*$/.test(k))) throw new Error('元组解构左侧需为变量名列表');
      this.i++;
      return { kind: 'stmt', stmt: { t: 'tuple', keys, expr: parseExprSrc(tupleM[2]), line } };
    }
    const assign = text.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (assign) {
      const isInput = this.parseInput(assign[1], assign[2]);
      this.i++;
      return isInput
        ? { kind: 'none' }
        : { kind: 'stmt', stmt: { t: 'assign', key: assign[1], expr: parseExprSrc(assign[2]), line } };
    }
    if (nested) {
      this.i++;
      return { kind: 'stmt', stmt: { t: 'expr', expr: parseExprSrc(text), line } };
    }
    throw new Error(`不支持的语句：${text.slice(0, 40)}`);
  }

  /** input.* 装配为参数元数据（返回 true）；否则按普通赋值处理（返回 false） */
  private parseInput(key: string, rhs: string): boolean {
    const inputMatch = rhs.match(/^input\.(int|bool|source)\s*\(/);
    if (!inputMatch) return false;
    const kind = inputMatch[1];
    const label = rhs.match(/title\s*=\s*"([^"]*)"/i)?.[1] ?? rhs.match(/defval\s*=\s*"([^"]*)"/i)?.[1] ?? key;
    if (kind === 'int') {
      const def = Number(rhs.match(/input\.int\s*\(\s*(-?[0-9.]+)/)?.[1] ?? 1);
      this.prog.params.push({
        key,
        label,
        type: 'number',
        default: def,
        // 未声明 minval 时兜底 1：周期类参数取 0/负会在运行期抛错（旧行为为指标静默空白）
        min: kwNum(rhs, 'minval') ?? 1,
        max: kwNum(rhs, 'maxval'),
        step: kwNum(rhs, 'step') ?? 1,
      });
    } else if (kind === 'bool') {
      const def = /input\.bool\s*\(\s*true/i.test(rhs);
      this.prog.params.push({ key, label, type: 'boolean', default: def });
    } else {
      const def = rhs.match(/input\.source\s*\(\s*([\w.]+)/)?.[1] ?? 'close';
      this.prog.params.push({
        key,
        label,
        type: 'select',
        default: def,
        options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].map((v) => ({ label: v, value: v })),
      });
    }
    return true;
  }

  /** switch 臂解析：`模式 => 单行表达式` 或 `模式 =>` + 缩进块；空模式（=>）为默认臂 */
  private parseSwitchArms(parentIndent: number, lineNo: number): SwitchArm[] {
    const first = this.lines[this.i];
    if (!first || first.indent <= parentIndent) {
      throw new Error(`第 ${lineNo} 行：switch 缺少缩进臂块`);
    }
    const base = first.indent;
    const arms: SwitchArm[] = [];
    while (this.i < this.lines.length && this.lines[this.i].indent === base) {
      const ln = this.lines[this.i];
      const m = ln.text.match(/^(.*?)=>(.*)$/);
      if (!m) throw new Error(`第 ${ln.no} 行：switch 臂需为「模式 => 语句」`);
      const patternText = m[1].trim();
      const bodyText = m[2].trim();
      const pattern = patternText ? parseExprSrc(patternText) : null;
      this.i++;
      // 内联臂体按语句解析（赋值/strategy 调用/裸表达式），不推进行游标
      const body = bodyText ? [parseInlineStmt(bodyText, ln.no)] : this.parseBlock(base, ln.no);
      arms.push({ pattern, body });
    }
    return arms;
  }

  private parseFundef(m: RegExpMatchArray, indent: number, line: number): void {
    const [, name, paramsSrc, inlineBody] = m;
    const params = paramsSrc
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (params.some((p) => !/^[A-Za-z_]\w*$/.test(p))) throw new Error(`函数「${name}」参数名不合法`);
    this.i++;
    const body = inlineBody.trim()
      ? [{ t: 'expr', expr: parseExprSrc(inlineBody), line } as Stmt]
      : this.parseBlock(indent, line);
    const last = body[body.length - 1];
    if (!last || last.t !== 'expr') throw new Error(`函数「${name}」体末行需为返回表达式`);
    this.prog.funcs.set(name, { t: 'fundef', name, params, body, line });
  }

  private parseElse(indent: number): Stmt[] | null {
    const ln = this.lines[this.i];
    if (!ln || ln.indent !== indent) return null;
    if (ln.text === 'else') {
      this.i++;
      return this.parseBlock(indent, ln.no);
    }
    if (/^else\s+if\s+/.test(ln.text)) {
      const line = ln.no;
      this.i++;
      const cond = parseExprSrc(ln.text.replace(/^else\s+if\s+/, ''));
      const then = this.parseBlock(indent, line);
      const els = this.parseElse(indent);
      return [{ t: 'if', cond, then, els, line }];
    }
    return null;
  }
}

function kwNum(rhs: string, key: string): number | undefined {
  const m = rhs.match(new RegExp(`${key}\\s*=\\s*(-?[0-9.]+)`, 'i'));
  return m ? Number(m[1]) : undefined;
}

/** switch 内联臂体语句解析：赋值 / strategy 调用 / 裸表达式（不推进行游标） */
function parseInlineStmt(text: string, line: number): Stmt {
  const assign = text.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
  if (assign) return { t: 'assign', key: assign[1], expr: parseExprSrc(assign[2]), line };
  if (/^strategy\.(entry|close|exit)\s*\(/.test(text)) return parseStrategyStmt(text, line);
  return { t: 'expr', expr: parseExprSrc(text), line };
}

/** strategy.* 骨架调用语句（见 strategy.ts 语义边界说明） */
function parseStrategyStmt(text: string, line: number): Stmt {
  const entryM = text.match(/^strategy\.entry\s*\(\s*"([^"]*)"\s*,\s*(strategy\.long|strategy\.short)\s*\)$/);
  if (entryM) {
    return {
      t: 'strategy',
      op: 'entry',
      id: entryM[1],
      dir: entryM[2] === 'strategy.long' ? 1 : -1,
      stop: null,
      limit: null,
      line,
    };
  }
  const closeM = text.match(/^strategy\.close\s*\(\s*"([^"]*)"\s*\)$/);
  if (closeM) {
    return { t: 'strategy', op: 'close', id: closeM[1], dir: null, stop: null, limit: null, line };
  }
  const exitM = text.match(/^strategy\.exit\s*\((.*)\)\s*$/);
  if (exitM) {
    const parts = splitArgs(exitM[1]);
    if (parts.length < 1 || !/^"[^"]*"$/.test(parts[0])) {
      throw new Error('strategy.exit 第 1 参数需为字符串 id');
    }
    let stop: Expr | null = null;
    let limit: Expr | null = null;
    for (const p of parts.slice(1)) {
      const nm = p.match(/^(stop|limit)\s*=\s*(.+)$/);
      if (!nm) throw new Error('strategy.exit 骨架仅支持具名参数 stop=/limit=');
      if (nm[1] === 'stop') stop = parseExprSrc(nm[2]);
      else limit = parseExprSrc(nm[2]);
    }
    if (!stop && !limit) throw new Error('strategy.exit 骨架需至少提供 stop= 或 limit=');
    return { t: 'strategy', op: 'exit', id: parts[0].slice(1, -1), dir: null, stop, limit, line };
  }
  throw new Error(
    'strategy.* 骨架仅支持 strategy.entry("id", strategy.long|strategy.short) / strategy.close("id") / strategy.exit("id", stop=, limit=)',
  );
}

/** 顶层逗号切分（括号/字符串感知），用于 strategy.exit 具名参数解析 */
function splitArgs(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let quote: string | null = null;
  for (const ch of src) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseProgram(source: string): PineProgram {
  return new StmtParser(splitLines(source)).parse();
}
