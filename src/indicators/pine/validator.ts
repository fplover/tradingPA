import type { Expr, FundefStmt, PineError, PineProgram, Stmt } from './ast';
import { FNS, PINE_FN_NAMES } from './taFunctions';
import { STRATEGY_BUILTINS } from './strategy';
import type { FnDef } from './ta-shared';

/**
 * Pine 子集编译期静态校验与 lookback 估算：
 * - 标识符必须为内置源 / strategy.* 内置序列 / input 参数 / 脚本内声明
 *   （含块内与函数参数）
 * - 函数必须为注册的 ta/math 函数或脚本内用户函数，且参数数量匹配
 * - 函数声明的标量位（FnDef.scalars，周期/长度/倍数）不接受序列实参：
 *   序列在编译期即报错，不再由「合成 K 线末值」静默决定周期（三期-D3b）
 * - lookback 取 ta/math 调用中标量位实参的最大周期：字面量取字面值，参数化周期取
 *   input 的 maxval 上界（未声明则默认值）——与内置指标「固定大 lookback
 *   覆盖最大可设长度」同口径，避免用户把周期调大后脚本左侧整段 undefined
 */

const SOURCE_NAMES = new Set(['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4']);

/** 表达式的常量形（三期-D3b，仅供标量位规则使用）：
 *  const=可证逐 bar 同值，series=必为逐 bar 变化的序列，unknown=不判定（不报错，运行期 scalar() 兜底） */
type Shape = 'const' | 'series' | 'unknown';

function shapeOf(e: Expr, names: Map<string, Shape>): Shape {
  switch (e.t) {
    case 'num':
      return 'const';
    case 'ident':
      if (SOURCE_NAMES.has(e.name) || STRATEGY_BUILTINS.has(e.name)) return 'series';
      return names.get(e.name) ?? 'unknown';
    // 调用结果在本引擎一律是序列（ta/math/用户函数同口径；input.* 已在解析期折成参数，不成调用节点）
    case 'call':
      return 'series';
    case 'un':
      return shapeOf(e.e, names);
    case 'bin': {
      const l = shapeOf(e.l, names);
      const r = shapeOf(e.r, names);
      if (l === 'series' || r === 'series') return 'series';
      return l === 'const' && r === 'const' ? 'const' : 'unknown';
    }
  }
}

/** 名字 → 常量形：按源码顺序前向走声明与赋值，取末次写入的形（与执行顺序同构）。
 *  用户函数体不在静态校验范围（validateProgram 不下钻 prog.funcs），其标量位由运行期 scalar() 兜底。 */
function collectShapes(stmts: Stmt[], names: Map<string, Shape>): void {
  for (const st of stmts) {
    switch (st.t) {
      case 'assign':
      case 'var':
        names.set(st.key, shapeOf(st.expr, names));
        break;
      case 'tuple':
        st.keys.forEach((k) => names.set(k, shapeOf(st.expr, names)));
        break;
      case 'if':
        collectShapes(st.then, names);
        if (st.els) collectShapes(st.els, names);
        break;
      case 'switch':
        for (const arm of st.arms) collectShapes(arm.body, names);
        break;
      case 'for':
        // 循环变量逐轮取边界值，非常量也不是序列：不判定
        names.set(st.varName, 'unknown');
        collectShapes(st.body, names);
        break;
      default:
        break;
    }
  }
}

/** 标量位实参形状校验：声明为标量的位置（FnDef.scalars）传序列表达式即编译期报错 */
function validateScalarArgs(
  e: Extract<Expr, { t: 'call' }>,
  def: FnDef,
  names: Map<string, Shape>,
  errors: PineError[],
  line: number,
): void {
  for (const i of def.scalars ?? []) {
    const arg = e.args[i];
    if (arg && shapeOf(arg, names) === 'series') {
      errors.push({ line, message: `「${e.fn}」第 ${i + 1} 个参数需为常量，不能传序列表达式` });
    }
  }
}

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
  names: Map<string, Shape>,
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
      validateScalarArgs(e, def, names, errors, line);
    } else {
      errors.push({ line, message: `不支持的函数「${e.fn}」` });
    }
    for (const a of e.args) validateExpr(a, known, funcs, errors, line, names);
  } else if (e.t === 'bin') {
    validateExpr(e.l, known, funcs, errors, line, names);
    validateExpr(e.r, known, funcs, errors, line, names);
  } else if (e.t === 'un') {
    validateExpr(e.e, known, funcs, errors, line, names);
  } else if (e.t === 'ident') {
    if (e.name.startsWith('str:')) return;
    if (SOURCE_NAMES.has(e.name) || STRATEGY_BUILTINS.has(e.name) || known.has(e.name)) return;
    errors.push({ line, message: '未定义的标识符: ' + e.name });
  }
}

/** 名字 → 常量形：input 数值参数为常量源，其余按体内末次写入的形 */
function shapeMap(prog: PineProgram): Map<string, Shape> {
  const names = new Map<string, Shape>();
  for (const p of prog.params) if (p.type === 'number') names.set(p.key, 'const');
  collectShapes(prog.body, names);
  return names;
}

function walkStmts(
  stmts: Stmt[],
  known: Set<string>,
  prog: PineProgram,
  errors: PineError[],
  names: Map<string, Shape>,
): void {
  for (const st of stmts) {
    switch (st.t) {
      case 'assign':
      case 'var':
      case 'tuple':
        validateExpr(st.expr, known, prog.funcs, errors, st.line, names);
        break;
      case 'if':
        validateExpr(st.cond, known, prog.funcs, errors, st.line, names);
        walkStmts(st.then, known, prog, errors, names);
        if (st.els) walkStmts(st.els, known, prog, errors, names);
        break;
      case 'switch':
        if (st.subject) validateExpr(st.subject, known, prog.funcs, errors, st.line, names);
        for (const arm of st.arms) {
          if (arm.pattern) validateExpr(arm.pattern, known, prog.funcs, errors, st.line, names);
          walkStmts(arm.body, known, prog, errors, names);
        }
        break;
      case 'strategy':
        if (st.stop) validateExpr(st.stop, known, prog.funcs, errors, st.line, names);
        if (st.limit) validateExpr(st.limit, known, prog.funcs, errors, st.line, names);
        break;
      case 'for':
        validateExpr(st.from, known, prog.funcs, errors, st.line, names);
        validateExpr(st.to, known, prog.funcs, errors, st.line, names);
        if (st.by) validateExpr(st.by, known, prog.funcs, errors, st.line, names);
        walkStmts(st.body, known, prog, errors, names);
        break;
      case 'expr':
        validateExpr(st.expr, known, prog.funcs, errors, st.line, names);
        break;
      default:
        break;
    }
  }
}

/** 全程序校验：标识符、函数存在性与参数数量、标量位实参形状 */
export function validateProgram(prog: PineProgram, errors: PineError[]): void {
  const known = new Set<string>(prog.params.map((p) => p.key));
  collectDeclared(prog.body, known);
  for (const name of prog.funcs.keys()) known.add(name);
  const names = shapeMap(prog);
  walkStmts(prog.body, known, prog, errors, names);
  for (const p of prog.plots) validateExpr(p.expr, known, prog.funcs, errors, p.line, names);
  for (const h of prog.hlines) validateExpr(h.price, known, prog.funcs, errors, h.line, names);
  for (const p of prog.paints) if (p.cond) validateExpr(p.cond, known, prog.funcs, errors, p.line, names);
  for (const s of prog.shapes) {
    validateExpr(s.cond, known, prog.funcs, errors, s.line, names);
    if (s.price) validateExpr(s.price, known, prog.funcs, errors, s.line, names);
  }
  for (const a of prog.alerts) validateExpr(a.cond, known, prog.funcs, errors, a.line, names);
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
    } else {
      // 标量位声明（FnDef.scalars）即周期来源：不再按「第 2 个实参」猜位置
      // （旧启发式对 ta.atr/cci/mfi/wpr/donchian 的 0 号位整个漏计，对 ta.macd/tsi 只取到快线周期）
      const def = FNS[e.fn];
      if (def) {
        for (const i of def.scalars ?? []) {
          const arg = e.args[i];
          const p = arg ? periodOf(arg, periods) : undefined;
          if (p !== undefined) acc.max = Math.max(acc.max, p);
        }
      } else if (calls) {
        recordCallPeriods(e.fn, e.args, periods ?? EMPTY_PERIODS, calls);
      }
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
