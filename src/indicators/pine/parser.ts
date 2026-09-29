import type { PineProgram, Stmt } from './ast';
import { parseExprSrc } from './expr';
import { parseHlineDirective, parsePaintDirective, parsePlotDirective } from './directives';

/**
 * Pine v5 子集语句解析器（行制 + 缩进块）。
 * 顶层：indicator/study 头、input.* 赋值、普通/var 赋值、元组解构赋值、
 * 用户函数 f(x) => 块、plot/hline/bgcolor/barcolor 指令。
 * 块内：赋值、if/else/else if、for..to..by、裸表达式（函数体返回值）。
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
        if (!msg.startsWith('第 ')) throw new Error(`第 ${ln.no} 行：${msg}`);
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
      throw new Error(`第 ${line} 行：${msg}`);
    }
  }

  private dispatch(_ln: SrcLine, indent: number, nested: boolean, text: string, line: number): ParsedStmt {
    if (/^(indicator|study)\s*\(/.test(text)) {
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
        min: kwNum(rhs, 'minval'),
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

  private parseFundef(m: RegExpMatchArray, indent: number, line: number): void {
    const [, name, paramsSrc, inlineBody] = m;
    const params = paramsSrc.split(',').map((p) => p.trim()).filter(Boolean);
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

export function parseProgram(source: string): PineProgram {
  return new StmtParser(splitLines(source)).parse();
}
