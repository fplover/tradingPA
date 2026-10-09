import type { Expr, FundefStmt, PineError, PineProgram, Stmt } from './ast';
import { FNS, PINE_FN_NAMES } from './taFunctions';
import { STRATEGY_BUILTINS } from './strategy';

/**
 * Pine 子集编译期静态校验与 lookback 估算：
 * - 标识符必须为内置源 / strategy.* 内置序列 / input 参数 / 脚本内声明
 *   （含块内与函数参数）
 * - 函数必须为注册的 ta/math 函数或脚本内用户函数，且参数数量匹配
 * - lookback 取 ta/math 调用中的最大周期：字面量取字面值，参数化周期取
 *   input 的 maxval 上界（未声明则默认值）——与内置指标「固定大 lookback
 *   覆盖最大可设长度」同口径，避免用户把周期调大后脚本左侧整段 undefined
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
      case 'switch':
        for (const arm of st.arms) collectDeclared(arm.body, known);
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

function validateExpr(
  e: Expr,
  known: Set<string>,
  funcs: PineProgram['funcs'],
  errors: PineError[],
  line: number,
): void {
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
    if (SOURCE_NAMES.has(e.name) || STRATEGY_BUILTINS.has(e.name) || known.has(e.name)) return;
    errors.push({ line, message: '未定义的标识符: ' + e.name });
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
      case 'switch':
        if (st.subject) validateExpr(st.subject, known, prog.funcs, errors, st.line);
        for (const arm of st.arms) {
          if (arm.pattern) validateExpr(arm.pattern, known, prog.funcs, errors, st.line);
          validateStmts(arm.body, known, prog, errors);
        }
        break;
      case 'strategy':
        if (st.stop) validateExpr(st.stop, known, prog.funcs, errors, st.line);
        if (st.limit) validateExpr(st.limit, known, prog.funcs, errors, st.line);
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
  for (const s of prog.shapes) {
    validateExpr(s.cond, known, prog.funcs, errors, s.line);
    if (s.price) validateExpr(s.price, known, prog.funcs, errors, s.line);
  }
  for (const a of prog.alerts) validateExpr(a.cond, known, prog.funcs, errors, a.line);
}

/** 参数化周期估值表：input.int 参数 → 用户可设的最大周期（maxval 上界，未声明则默认值） */
function paramPeriods(prog: PineProgram): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of prog.params) {
    if (p.type !== 'number') continue;
    const v = p.max ?? p.default;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) m.set(p.key, v);
  }
  return m;
}

/** 周期实参估值：字面量取字面值，input 参数/函数形参绑定取估值；序列实参不计入 */
function periodOf(e: Expr, periods?: Map<string, number>): number | undefined {
  if (e.t === 'num') return e.v;
  if (e.t === 'ident') return periods?.get(e.name);
  return undefined;
}

/** 用户函数调用点的周期实参表：函数名 → 形参位置 → 周期估值（多调用点取最大） */
type CallPeriods = Map<string, Map<number, number>>;

const EMPTY_PERIODS: Map<string, number> = new Map();

/** 记录用户函数调用点各形参位置的周期实参（供函数体作用域绑定形参） */
function recordCallPeriods(fn: string, args: Expr[], periods: Map<string, number>, calls: CallPeriods): void {
  let pos = calls.get(fn);
  if (!pos) {
    pos = new Map();
    calls.set(fn, pos);
  }
  args.forEach((a, i) => {
    const p = periodOf(a, periods);
    if (p !== undefined) pos!.set(i, Math.max(pos!.get(i) ?? 0, p));
  });
}

export function collectLookbackExpr(
  e: Expr,
  acc: { max: number },
  periods?: Map<string, number>,
  calls?: CallPeriods,
): void {
  if (e.t === 'call') {
    // pivothigh/pivotlow 的 lookback = left + right（取末两个数值实参之和）
    if (/^ta\.pivot(high|low)$/.test(e.fn)) {
      const tail = e.args.slice(-2).map((x) => periodOf(x, periods));
      if (tail.every((v) => v !== undefined)) {
        acc.max = Math.max(acc.max, (tail[0] as number) + (tail[1] as number));
      }
    } else if (/^(ta|math)\./.test(e.fn) && e.args.length >= 2) {
      const p = periodOf(e.args[1], periods);
      if (p !== undefined) acc.max = Math.max(acc.max, p);
    } else if (calls) {
      recordCallPeriods(e.fn, e.args, periods ?? EMPTY_PERIODS, calls);
    }
    for (const a of e.args) collectLookbackExpr(a, acc, periods, calls);
  } else if (e.t === 'bin') {
    collectLookbackExpr(e.l, acc, periods, calls);
    collectLookbackExpr(e.r, acc, periods, calls);
  } else if (e.t === 'un') {
    collectLookbackExpr(e.e, acc, periods, calls);
  }
}

export function collectLookbackStmts(
  stmts: Stmt[],
  acc: { max: number },
  periods?: Map<string, number>,
  calls?: CallPeriods,
): void {
  for (const st of stmts) {
    switch (st.t) {
      case 'assign':
      case 'var':
      case 'tuple':
      case 'expr':
        collectLookbackExpr(st.expr, acc, periods, calls);
        break;
      case 'if':
        collectLookbackExpr(st.cond, acc, periods, calls);
        collectLookbackStmts(st.then, acc, periods, calls);
        if (st.els) collectLookbackStmts(st.els, acc, periods, calls);
        break;
      case 'switch':
        if (st.subject) collectLookbackExpr(st.subject, acc, periods, calls);
        for (const arm of st.arms) {
          if (arm.pattern) collectLookbackExpr(arm.pattern, acc, periods, calls);
          collectLookbackStmts(arm.body, acc, periods, calls);
        }
        break;
      case 'strategy':
        if (st.stop) collectLookbackExpr(st.stop, acc, periods, calls);
        if (st.limit) collectLookbackExpr(st.limit, acc, periods, calls);
        break;
      case 'for':
        collectLookbackExpr(st.from, acc, periods, calls);
        collectLookbackExpr(st.to, acc, periods, calls);
        if (st.by) collectLookbackExpr(st.by, acc, periods, calls);
        collectLookbackStmts(st.body, acc, periods, calls);
        break;
      case 'fundef':
        // 用户函数体（prog.funcs 持有，不在 body 里）：函数体内的周期同样计入
        collectLookbackStmts(st.body, acc, periods, calls);
        break;
      default:
        break;
    }
  }
}

/** 函数体作用域：input 参数估值 + 形参按调用点周期实参绑定 */
function fundefPeriods(f: FundefStmt, periods: Map<string, number>, calls: CallPeriods): Map<string, number> {
  const pos = calls.get(f.name);
  if (!pos) return periods;
  const m = new Map(periods);
  f.params.forEach((p, i) => {
    const v = pos.get(i);
    if (v !== undefined) m.set(p, v);
  });
  return m;
}

/** 全程序 lookback 估算：函数体 + 顶层语句 + plot/hline/绘图指令条件一并纳入。
 *  两遍遍历：第一遍顺带记录用户函数调用点的周期实参，第二遍按绑定后的形参
 *  重扫函数体（形参周期才能计入）。 */
export function collectLookback(prog: PineProgram): number {
  const acc = { max: 100 };
  const periods = paramPeriods(prog);
  const calls: CallPeriods = new Map();
  collectLookbackStmts(prog.body, acc, periods, calls);
  for (const p of prog.plots) collectLookbackExpr(p.expr, acc, periods, calls);
  for (const h of prog.hlines) collectLookbackExpr(h.price, acc, periods, calls);
  for (const p of prog.paints) if (p.cond) collectLookbackExpr(p.cond, acc, periods, calls);
  for (const s of prog.shapes) {
    collectLookbackExpr(s.cond, acc, periods, calls);
    if (s.price) collectLookbackExpr(s.price, acc, periods, calls);
  }
  for (const a of prog.alerts) collectLookbackExpr(a.cond, acc, periods, calls);
  for (const f of prog.funcs.values()) {
    // 先按未绑定形参扫一遍（记录函数体内的嵌套调用点），再按调用点绑定形参重扫
    collectLookbackStmts(f.body, acc, periods, calls);
    collectLookbackStmts(f.body, acc, fundefPeriods(f, periods, calls));
  }
  return acc.max;
}
