/**
 * Pine v5 子集编译器 — barrel 重导出（保持既有 import 兼容，调用点零 diff）。
 *
 * 模块拆分：
 * - tokenizer.ts   词法分析
 * - ast.ts         AST 与编译产物类型
 * - parser.ts      语句/表达式解析（缩进块）
 * - series.ts      序列运算原语（ops/ta 基础/math/source/color）
 * - taFunctions.ts ta 系与 math 系函数注册表与分发
 * - taCore.ts      依赖 K 线的 ta 实现（tr/atr/adx/cci/mfi/wpr/psar/supertrend/fisher）
 * - interpreter.ts 向量化解释执行（if/for/掩码/用户函数）+ 静态校验
 * - program.ts     编译装配、dry-run 前置校验、绘图指令旁路
 * - alerts.ts      alertcondition 编译期注册表（警报面板列源）
 *
 * 能力：indicator()/study()、input.int/bool/source、赋值/var、元组解构赋值、
 * if/else/else if、for..to..by、用户函数、plot/hline/bgcolor/barcolor、
 * plotshape/plotchar（条件标记图形）、alertcondition（编译期注册条件）、
 * ta.* 32 个、math.* 10 个。运行期错误编译期 dry-run 前置拦截（AC-B2）。
 */

export { compilePine, pinePaint, pineRuntimeError, pineRuntimeErrors, subscribePineRuntimeErrors } from './program';
export { pineAlertsOf, type PineAlertMeta } from './alerts';
export type { PineError, CompileResult, PaintDirective, ShapeDirective, AlertDirective } from './ast';
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
