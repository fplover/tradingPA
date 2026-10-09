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

/** 运行期 shape 指令元数据（plotshape/plotchar，computeExtra 旁路）：
 *  条件序列 + 每标记属性（barIndex 由渲染层按窗推导；absolute 定位取 price 序列） */
export interface ShapeDirective {
  kind: 'shape' | 'char';
  /** kind='shape' 时为 shape.* 名；kind='char' 时为 plotchar 字符 */
  style: string;
  color: string;
  location: 'belowbar' | 'abovebar' | 'absolute';
  /** 标记尺寸（像素；三角形高/半径、字符字号） */
  size: number;
  cond: Array<number | undefined> | null;
  /** location.absolute 时的价格序列（与 cond 同窗对齐） */
  price: Array<number | undefined> | null;
  /** plotshape text= 附加文本 */
  text: string | null;
  line: number;
}

/** 运行期 alertcondition 指令元数据（computeExtra 旁路）：条件序列供警报 watcher 采样 */
export interface AlertDirective {
  kind: 'alertcondition';
  /** def 内条件键（a0/a1/...），警报源引用用 */
  key: string;
  title: string;
  message: string;
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

/** switch 臂：pattern=null 为默认臂（`=>` 左侧为空） */
export interface SwitchArm {
  pattern: Expr | null;
  body: Stmt[];
}

export type Stmt =
  | { t: 'assign'; key: string; expr: Expr; line: number }
  /** var / varip 声明（向量化离线子集下与普通赋值同义：varip 无实时回滚，语法层保留区分） */
  | { t: 'var'; key: string; expr: Expr; line: number }
  /** 元组解构赋值：[a, b, c] = ta.macd(...) */
  | { t: 'tuple'; keys: string[]; expr: Expr; line: number }
  | { t: 'if'; cond: Expr; then: Stmt[]; els: Stmt[] | null; line: number }
  /** switch：subject 形态（switch x）与条件形态（switch）；空 pattern 臂为默认臂 */
  | { t: 'switch'; subject: Expr | null; arms: SwitchArm[]; line: number }
  /** strategy 骨架语句：entry/close/exit 最小语义（见 strategy.ts StratSim） */
  | {
      t: 'strategy';
      op: 'entry' | 'close' | 'exit';
      id: string;
      dir: 1 | -1 | null;
      stop: Expr | null;
      limit: Expr | null;
      line: number;
    }
  | { t: 'for'; varName: string; from: Expr; to: Expr; by: Expr | null; body: Stmt[]; line: number }
  /** 用户函数定义：f(x) => 块；body 最后一条必须是裸表达式（返回值） */
  | { t: 'fundef'; name: string; params: string[]; body: Stmt[]; line: number }
  /** 裸表达式语句（函数体返回值） */
  | { t: 'expr'; expr: Expr; line: number }
  | { t: 'indicator'; name: string; overlay: boolean; line: number }
  | { t: 'plot'; expr: Expr; title: string; style: PlotStyle; line: number }
  | { t: 'hline'; price: Expr; title: string; color: string | null; line: number }
  | { t: 'bgcolor'; color: string | null; cond: Expr | null; line: number }
  | { t: 'barcolor'; color: string | null; cond: Expr | null; line: number }
  /** plotshape/plotchar：条件标记图形（不产数值 plot，不参与 indicatorRange/图例） */
  | {
      t: 'plotshape' | 'plotchar';
      cond: Expr;
      title: string;
      /** plotshape 的 shape.* 名；plotchar 的字符走 char 字段 */
      style: string;
      char: string | null;
      location: 'belowbar' | 'abovebar' | 'absolute';
      color: string;
      size: number;
      text: string | null;
      /** location.absolute 时的价格表达式 */
      price: Expr | null;
      line: number;
    }
  /** alertcondition：编译期注册条件（供警报面板选源；TV 纯警报脚本无 plot 亦合法） */
  | { t: 'alertcondition'; cond: Expr; title: string; message: string; line: number };

export type PlotStmt = Extract<Stmt, { t: 'plot' }>;
export type HlineStmt = Extract<Stmt, { t: 'hline' }>;
export type PaintStmt = Extract<Stmt, { t: 'bgcolor' } | { t: 'barcolor' }>;
export type ShapeStmt = Extract<Stmt, { t: 'plotshape' | 'plotchar' }>;
export type AlertStmt = Extract<Stmt, { t: 'alertcondition' }>;
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
  shapes: ShapeStmt[];
  alerts: AlertStmt[];
  funcs: Map<string, FundefStmt>;
}
