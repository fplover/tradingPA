import type { Expr, PineError, PineProgram, Stmt } from './ast';
import { FNS, PINE_FN_NAMES } from './taFunctions';

/**
 * Pine 子集编译期静态校验与 lookback 估算：
 * - 标识符必须为内置源 / input 参数 / 脚本内声明（含块内与函数参数）
 * - 函数必须为注册的 ta/math 函数或脚本内用户函数，且参数数量匹配
 * - lookback 取 ta/math 调用中的最大字面量周期（基线 100，装配层封顶 2000）
 */

const SOURCE_NAMES = new Set(['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4']);

function collectDeclared(stmts: Stmt[], known: Set<string>): void {
  for (const st of stmts) {
    switch (st.t) {
      case 'assign':
      case 'var':
        known.add(st.key);
        break;
      case 'tuple':
        st.keys.forEach((k) => known.add(k));
        break;
      case 'if':
        collectDeclared(st.then, known);
        if (st.els) collectDeclared(st.els, known);
        break;
      case 'for':
        known.add(st.varName);
        collectDeclared(st.body, known);
        break;
      default:
        break;
    }
  }
}

function validateExpr(e: Expr, known: Set<string>, funcs: PineProgram['funcs'], errors: PineError[], line: number): void {
  if (e.t === 'call') {
    const fundef = funcs.get(e.fn);
    if (fundef) {
      if (e.args.length !== fundef.params.length) {
        errors.push({ line, message: `函数「${e.fn}」需要 ${fundef.params.length} 个参数，实际 ${e.args.length}` });
      }
    } else if (PINE_FN_NAMES.has(e.fn)) {
      const def = FNS[e.fn];
      if (e.args.length < def.min || e.args.length > def.max) {
        errors.push({ line, message: `「${e.fn}」参数数量应为 ${def.min}${def.max !== def.min ? `-${def.max}` : ''}` });
      }
    } else {
      errors.push({ line, message: `不支持的函数「${e.fn}」` });
    }
    for (const a of e.args) validateExpr(a, known, funcs, errors, line);
  } else if (e.t === 'bin') {
    validateExpr(e.l, known, funcs, errors, line);
    validateExpr(e.r, known, funcs, errors, line);
  } else if (e.t === 'un') {
    validateExpr(e.e, known, funcs, errors, line);
  } else if (e.t === 'ident') {
    if (e.name.startsWith('str:')) return;
    if (!SOURCE_NAMES.has(e.name) && !known.has(e.name)) {
      errors.push({ line, message: '未定义的标识符: ' + e.name });
    }
  }
}

function validateStmts(stmts: Stmt[], known: Set<string>, prog: PineProgram, errors: PineError[]): void {
  for (const st of stmts) {
    switch (st.t) {
      case 'assign':
      case 'var':
      case 'tuple':
        validateExpr(st.expr, known, prog.funcs, errors, st.line);
        break;
      case 'if':
        validateExpr(st.cond, known, prog.funcs, errors, st.line);
        validateStmts(st.then, known, prog, errors);
        if (st.els) validateStmts(st.els, known, prog, errors);
        break;
      case 'for':
        validateExpr(st.from, known, prog.funcs, errors, st.line);
        validateExpr(st.to, known, prog.funcs, errors, st.line);
        if (st.by) validateExpr(st.by, known, prog.funcs, errors, st.line);
        validateStmts(st.body, known, prog, errors);
        break;
      case 'expr':
        validateExpr(st.expr, known, prog.funcs, errors, st.line);
        break;
      default:
        break;
    }
  }
}

/** 全程序校验：标识符、函数存在性与参数数量 */
export function validateProgram(prog: PineProgram, errors: PineError[]): void {
  const known = new Set<string>(prog.params.map((p) => p.key));
  collectDeclared(prog.body, known);
  for (const name of prog.funcs.keys()) known.add(name);
  validateStmts(prog.body, known, prog, errors);
  for (const p of prog.plots) validateExpr(p.expr, known, prog.funcs, errors, p.line);
  for (const h of prog.hlines) validateExpr(h.price, known, prog.funcs, errors, h.line);
  for (const p of prog.paints) if (p.cond) validateExpr(p.cond, known, prog.funcs, errors, p.line);
}

export function collectLookbackExpr(e: Expr, acc: { max: number }): void {
  if (e.t === 'call') {
    if (/^(ta|math)\./.test(e.fn) && e.args.length >= 2 && e.args[1].t === 'num') {
      acc.max = Math.max(acc.max, e.args[1].v);
    }
    for (const a of e.args) collectLookbackExpr(a, acc);
  } else if (e.t === 'bin') {
    collectLookbackExpr(e.l, acc);
    collectLookbackExpr(e.r, acc);
  } else if (e.t === 'un') {
    collectLookbackExpr(e.e, acc);
  }
}

export function collectLookbackStmts(stmts: Stmt[], acc: { max: number }): void {
  for (const st of stmts) {
    switch (st.t) {
      case 'assign':
      case 'var':
      case 'tuple':
      case 'expr':
        collectLookbackExpr(st.expr, acc);
        break;
      case 'if':
        collectLookbackExpr(st.cond, acc);
        collectLookbackStmts(st.then, acc);
        if (st.els) collectLookbackStmts(st.els, acc);
        break;
      case 'for':
        collectLookbackExpr(st.from, acc);
        collectLookbackExpr(st.to, acc);
        if (st.by) collectLookbackExpr(st.by, acc);
        collectLookbackStmts(st.body, acc);
        break;
      default:
        break;
    }
  }
}
