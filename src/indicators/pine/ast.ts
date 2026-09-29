import type { PlotStyle } from '../core/types';

/** Pine 编译错误（带行号） */
export interface PineError {
  line: number;
  message: string;
}

export interface CompileResult {
  def: import('../core/types').IndicatorDef | null;
  errors: PineError[];
  /** bgcolor/barcolor 指令旁路元数据（渲染接线属后续批次，见 pinePaint()） */
  paint: PaintDirective[];
}

/** 绘图指令元数据：颜色 + 条件序列（1=生效，0/undefined=不生效；null=恒生效） */
export interface PaintDirective {
  kind: 'bgcolor' | 'barcolor';
  color: string;
  cond: Array<number | undefined> | null;
  line: number;
}

// ---------- 表达式 AST ----------

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'ident'; name: string }
  | { t: 'bin'; op: string; l: Expr; r: Expr }
  | { t: 'un'; op: string; e: Expr }
  | { t: 'call'; fn: string; args: Expr[] };

// ---------- 语句 AST ----------

export type Stmt =
  | { t: 'assign'; key: string; expr: Expr; line: number }
  /** var 声明（向量化子集下与普通赋值同义，语法层区分保留） */
  | { t: 'var'; key: string; expr: Expr; line: number }
  /** 元组解构赋值：[a, b, c] = ta.macd(...) */
  | { t: 'tuple'; keys: string[]; expr: Expr; line: number }
  | { t: 'if'; cond: Expr; then: Stmt[]; els: Stmt[] | null; line: number }
  | { t: 'for'; varName: string; from: Expr; to: Expr; by: Expr | null; body: Stmt[]; line: number }
  /** 用户函数定义：f(x) => 块；body 最后一条必须是裸表达式（返回值） */
  | { t: 'fundef'; name: string; params: string[]; body: Stmt[]; line: number }
  /** 裸表达式语句（函数体返回值） */
  | { t: 'expr'; expr: Expr; line: number }
  | { t: 'indicator'; name: string; overlay: boolean; line: number }
  | { t: 'plot'; expr: Expr; title: string; style: PlotStyle; line: number }
  | { t: 'hline'; price: Expr; title: string; color: string | null; line: number }
  | { t: 'bgcolor'; color: string | null; cond: Expr | null; line: number }
  | { t: 'barcolor'; color: string | null; cond: Expr | null; line: number };

export type PlotStmt = Extract<Stmt, { t: 'plot' }>;
export type HlineStmt = Extract<Stmt, { t: 'hline' }>;
export type PaintStmt = Extract<Stmt, { t: 'bgcolor' } | { t: 'barcolor' }>;
export type FundefStmt = Extract<Stmt, { t: 'fundef' }>;

/** 解析后的脚本程序 */
export interface PineProgram {
  name: string;
  overlay: boolean;
  params: import('../core/types').IndicatorParam[];
  body: Stmt[];
  plots: PlotStmt[];
  hlines: HlineStmt[];
  paints: PaintStmt[];
  funcs: Map<string, FundefStmt>;
}
