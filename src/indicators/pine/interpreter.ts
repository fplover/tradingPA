import type { Bar } from '@/types/market';
import type { Expr, PineProgram, Stmt } from './ast';
import { ops, sourceSeries, toSeries, type S } from './series';
import { callFunction, type TaCtx } from './taFunctions';
import { STRATEGY_BUILTINS, StratSim } from './strategy';

/**
 * Pine 子集解释器：向量化（序列对齐 bars，逐元素运算）语义。
 * - if/switch/for 在分支掩码（mask）下执行：掩码为真的 bar 上赋值生效，
 *   其余 bar 保留变量原值（对齐 TV「分支未命中保持前值」语义）。
 * - if/switch 条件按 Pine 语义取真假：na（undefined）与 NaN 均为假。
 * - 标识符解析顺序为用户定义变量/函数参数优先，strategy.* 内置序列次之
 *   （仅脚本体结束后可用），内置源序列兜底。
 * - 用户函数调用在子作用域求值（可读全局，写入仅限本作用域），限深 32。
 * - for 循环限次 1000（超限抛错 → 编译期 dry-run 前置拦截，见 program.ts）。
 * - strategy.entry/close/exit 记录至 StratSim，脚本体执行完毕后统一逐 bar 结算。
 */

export const MAX_LOOP_ITER = 1000;
const MAX_CALL_DEPTH = 32;

class Scope {
  vars = new Map<string, S>();
  constructor(public parent: Scope | null) {}
  lookup(name: string): S | undefined {
    const own = this.vars.get(name);
    if (own !== undefined) return own;
    // 沿父作用域链上溯（等价于原先的 while 走链，且不再把 this 别名给局部变量）
    return this.parent ? this.parent.lookup(name) : undefined;
  }
}

interface InterpCtx {
  n: number;
  funcs: PineProgram['funcs'];
  taCtx: TaCtx;
  depth: number;
  strat: StratSim;
}

// ---------- 掩码工具 ----------

function andMask(a: S | null, b: S): S {
  if (!a) return b;
  return a.map((v, i) => (v === 1 && b[i] === 1 ? 1 : 0));
}

function notMask(a: S): S {
  return a.map((v) => (v === 1 ? 0 : 1));
}

/** 掩码赋值：mask=1 处取新值，其余保留 prev（无 prev 则 undefined） */
function maskedAssign(prev: S | undefined, val: S, mask: S | null): S {
  if (!mask) return val;
  return val.map((v, i) => (mask[i] === 1 ? v : prev?.[i]));
}

// ---------- 表达式求值 ----------

function evalExpr(e: Expr, scope: Scope, ctx: InterpCtx, allowTuple = false): S {
  switch (e.t) {
    case 'num':
      return toSeries(e.v, ctx.n);
    case 'ident': {
      if (e.name.startsWith('str:')) return toSeries(NaN, ctx.n);
      // 用户定义变量/函数参数优先，strategy.* 内置序列次之，内置源序列仅作兜底
      const v = scope.lookup(e.name);
      if (v) return v;
      if (STRATEGY_BUILTINS.has(e.name)) return ctx.strat.value(e.name);
      const src = sourceSeries(ctx.taCtx.bars, e.name);
      if (src) return src;
      throw new Error(`未定义的标识符「${e.name}」`);
    }
    case 'un': {
      const a = evalExpr(e.e, scope, ctx);
      return e.op === 'neg' ? ops.neg(a) : ops.not(a);
    }
    case 'bin': {
      const a = evalExpr(e.l, scope, ctx);
      const b = evalExpr(e.r, scope, ctx);
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
      const fundef = ctx.funcs.get(e.fn);
      if (fundef) {
        if (ctx.depth >= MAX_CALL_DEPTH) throw new Error(`函数「${e.fn}」调用层级超过上限 ${MAX_CALL_DEPTH}`);
        if (e.args.length !== fundef.params.length) {
          throw new Error(`函数「${e.fn}」需要 ${fundef.params.length} 个参数，实际 ${e.args.length}`);
        }
        const child = new Scope(scope);
        fundef.params.forEach((p, i) => child.vars.set(p, evalExpr(e.args[i], scope, ctx)));
        const sub: InterpCtx = { ...ctx, depth: ctx.depth + 1 };
        return execStmts(fundef.body, child, null, sub) ?? toSeries(NaN, ctx.n);
      }
      const args = e.args.map((a) => evalExpr(a, scope, ctx));
      const r = callFunction(e.fn, args, ctx.taCtx);
      if (Array.isArray(r[0])) {
        if (!allowTuple) throw new Error(`「${e.fn}」返回多序列，须用 [a, b, ...] = 调用`);
        return r as unknown as S;
      }
      return r as S;
    }
  }
}

// ---------- 语句执行 ----------

function execStmts(stmts: Stmt[], scope: Scope, mask: S | null, ctx: InterpCtx): S | undefined {
  let last: S | undefined;
  for (const st of stmts) {
    switch (st.t) {
      case 'assign':
      case 'var': {
        const val = evalExpr(st.expr, scope, ctx);
        scope.vars.set(st.key, maskedAssign(scope.lookup(st.key), val, mask));
        break;
      }
      case 'tuple': {
        const r = evalExpr(st.expr, scope, ctx, true);
        if (!Array.isArray(r[0])) throw new Error('元组解构赋值右侧须为多序列函数调用（如 ta.macd）');
        const list = r as unknown as S[];
        if (list.length !== st.keys.length) {
          throw new Error(`元组解构数量不匹配：右侧 ${list.length} 个，左侧 ${st.keys.length} 个`);
        }
        st.keys.forEach((k, i) => scope.vars.set(k, maskedAssign(scope.lookup(k), list[i], mask)));
        break;
      }
      case 'if': {
        const cond = evalExpr(st.cond, scope, ctx);
        execStmts(st.then, scope, andMask(mask, truthyMask(cond)), ctx);
        if (st.els) execStmts(st.els, scope, andMask(mask, notMask(truthyMask(cond))), ctx);
        break;
      }
      case 'switch': {
        // 逐臂首中即停（掩码链与 if/else 同构：命中臂吃掉对应 bar，其余 bar 传给后续臂）
        const subj = st.subject ? evalExpr(st.subject, scope, ctx) : null;
        let rest = mask;
        for (const arm of st.arms) {
          if (!arm.pattern) {
            execStmts(arm.body, scope, rest, ctx); // 默认臂：到达即命中
            break;
          }
          const pat = evalExpr(arm.pattern, scope, ctx);
          // subject 形态按相等匹配（ops.eq：na==na=1 口径）；条件形态按真假
          const matched = subj ? ops.eq(subj, pat) : truthyMask(pat);
          execStmts(arm.body, scope, andMask(rest, matched), ctx);
          rest = andMask(rest, notMask(matched));
        }
        break;
      }
      case 'strategy': {
        if (st.op === 'entry') ctx.strat.entry(st.dir === -1 ? -1 : 1, st.id, mask);
        else if (st.op === 'close') ctx.strat.close(st.id, mask);
        else
          ctx.strat.exit(
            st.id,
            mask,
            st.stop ? evalExpr(st.stop, scope, ctx) : null,
            st.limit ? evalExpr(st.limit, scope, ctx) : null,
          );
        break;
      }
      case 'for': {
        const from = lastNum(evalExpr(st.from, scope, ctx), 'for 起始值');
        const to = lastNum(evalExpr(st.to, scope, ctx), 'for 结束值');
        const step = st.by ? lastNum(evalExpr(st.by, scope, ctx), 'for 步长') : from <= to ? 1 : -1;
        if (step === 0) throw new Error('for 步长不能为 0');
        const count = Math.floor((to - from) / step) + 1;
        if (count > MAX_LOOP_ITER) throw new Error(`循环次数 ${count} 超过上限 ${MAX_LOOP_ITER}`);
        for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
          scope.vars.set(st.varName, toSeries(i, ctx.n));
          execStmts(st.body, scope, mask, ctx);
        }
        break;
      }
      case 'expr':
        last = evalExpr(st.expr, scope, ctx);
        break;
      case 'fundef':
      case 'indicator':
      case 'plot':
      case 'hline':
      case 'bgcolor':
      case 'barcolor':
      case 'plotshape':
      case 'plotchar':
      case 'alertcondition':
        throw new Error('绘图指令与函数定义只能在顶层');
    }
  }
  return last;
}

/** 布尔语境掩码：na（undefined）与 NaN 均为假（if/switch 条件同口径） */
function truthyMask(cond: S): S {
  return cond.map((v) => (v !== undefined && !Number.isNaN(v) && v !== 0 ? 1 : 0));
}

function lastNum(a: S, what: string): number {
  const v = a[a.length - 1];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what}需为常量`);
  return v;
}

// ---------- 程序运行 ----------

export interface RunResult {
  plots: S[];
  hlines: S[];
  paintConds: Array<S | null>;
  /** plotshape/plotchar：条件序列 + absolute 定位价格序列（逐指令与 prog.shapes 对齐） */
  shapeRuns: Array<{ cond: S | null; price: S | null }>;
  /** alertcondition：条件序列（逐指令与 prog.alerts 对齐） */
  alertConds: Array<S | null>;
}

/** 运行已编译程序：params 注入 → 执行语句 → 求 plot/hline/绘图指令条件序列 */
export function runProgram(prog: PineProgram, bars: readonly Bar[], params: Record<string, unknown>): RunResult {
  const n = bars.length;
  const scope = new Scope(null);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'number') scope.vars.set(k, toSeries(v, n));
    else if (typeof v === 'boolean') scope.vars.set(k, toSeries(v ? 1 : 0, n));
    else if (typeof v === 'string') {
      const src = sourceSeries(bars, v);
      if (src) scope.vars.set(k, src);
    }
  }
  const ctx: InterpCtx = { n, funcs: prog.funcs, taCtx: { bars }, depth: 0, strat: new StratSim() };
  execStmts(prog.body, scope, null, ctx);
  // strategy 骨架结算：内置序列（position_size/netprofit/equity）此后才可解析
  ctx.strat.finalize(bars);
  return {
    plots: prog.plots.map((p) => evalExpr(p.expr, scope, ctx)),
    hlines: prog.hlines.map((h) => evalExpr(h.price, scope, ctx)),
    paintConds: prog.paints.map((p) => (p.cond ? evalExpr(p.cond, scope, ctx) : null)),
    shapeRuns: prog.shapes.map((s) => ({
      cond: evalExpr(s.cond, scope, ctx),
      price: s.price ? evalExpr(s.price, scope, ctx) : null,
    })),
    alertConds: prog.alerts.map((a) => evalExpr(a.cond, scope, ctx)),
  };
}
