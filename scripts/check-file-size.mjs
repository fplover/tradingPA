#!/usr/bin/env node
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseSync } from 'oxc-parser';

/**
 * 文件规模检查（第四轮审查后改度量口径）。
 *
 * ## 为什么改口径
 * 原红线是「单文件 ≤300 行」，但这条线一直在测量**格式产物**而非文件规模：
 * Prettier 全仓格式化（printWidth 120）折行后，>300 行的文件由 1 个变成 9 个；
 * 而 `ChartController.ts` 在 printWidth 100/120/140/160 下分别是 868/840/829/827 行
 * ——它在任何排版下都"超标"，原来的 637 行只是手写长行的假象。
 * 反过来，`indicators/builtin/trend.ts` 只有 270 物理行（行数排名第 29），
 * 逻辑内容却排全仓第 4——旧口径完全看不到这类"密度型"大文件。
 *
 * ## 新口径
 * **逻辑单元数**：统计语法树中代表「一块逻辑/结构」的节点——
 * 语句、类型/函数/枚举声明、类成员、对象字面量成员。该计数与排版完全无关
 * （折行、缩进、空行、注释都不影响），因此是稳定红线。
 *
 * ## 解析器（Vite 8 / oxc 生态统一，2026-10-03）
 * 解析器两迁：原 `typescript` 包 JS API → @babel/parser（TS 7 迁移）→ **oxc-parser**
 * （当前）。Vite 8 内置 Rolldown（oxc 生态），lint 已切 oxlint（同解析器栈），
 * 规模度量随之统一到 oxc，工具链零 babel / 零 eslint 依赖，原生 Rust 解析更快。
 * 计数语义与前两版保持等价（oxc 为 ESTree 命名）：
 * - 语句/声明面：以 Statement/Declaration 结尾的节点（排除 BlockStatement/EmptyStatement）；
 * - FunctionDeclaration/ClassDeclaration 语句+声明各计一次（与 TS 口径平价）；
 * - `export const x` 在 TS 是带修饰符的 VariableStatement（计 1），oxc 是
 *   ExportNamedDeclaration 包 VariableDeclaration（会计 2）→ 带 declaration 的
 *   export 包装节点不计，由内层声明计入，保持平价；
 * - 成员面：对象字面量成员 = Property（限父为 ObjectExpression，解构模式不计，
 *   同 TS PropertyAssignment 口径）+ SpreadElement（限对象内，同 SpreadAssignment）；
 *   类成员 = MethodDefinition（方法/getter/constructor 各一）/PropertyDefinition。
 * 切换解析器属实现层迁移，例外清单数值已按新口径重新校准（见 allowlist）。
 *
 * ## 例外清单
 * 与 ESLint 警告基线同理：把存量超标项**枚举化**（每项带理由与登记编号），
 * 门禁只对**新增**超标报警，同时提示已不合规的旧条目应当移除。
 * 比起为了"门禁全绿"而做大爆炸拆分，这样既保住门禁对新增长的作用，
 * 又让债务可见、有界、可逐条清偿。
 *
 * 用法：
 *   node scripts/check-file-size.mjs              # 检查（含例外清单判定）
 *   node scripts/check-file-size.mjs --top 20     # 列出最大的 N 个文件
 *   node scripts/check-file-size.mjs --summary    # 只打印分布
 */

const LIMIT = 300; // 逻辑单元上限
const HARD_LINE_CEILING = 900; // 宽松物理行护栏：只防极端膨胀，不作主判据

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'file-size-allowlist.json');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const SKIP_KEYS = new Set([
  'loc',
  'start',
  'end',
  'range',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'extra',
]);

function childNodes(node, fn) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) {
        if (c && typeof c === 'object' && typeof c.type === 'string') fn(c);
      }
    } else if (v && typeof v === 'object' && typeof v.type === 'string') {
      fn(v);
    }
  }
}

/** 语法树中的「逻辑单元」：语句 + 声明 + 类成员 + 对象字面量成员（oxc AST 口径，ESTree 命名） */
function countLogicalUnits(fileName, text) {
  const ret = parseSync(fileName, text);
  if (ret.errors && ret.errors.length > 0) {
    throw new Error(`oxc parse failed: ${fileName}: ${ret.errors[0]?.message ?? 'unknown'}`);
  }
  const ast = ret.program;
  let n = 0;
  const isMember = (t, parent) =>
    // 对象字面量成员（ESTree 的 Property 同时用于解构模式，须限父为 ObjectExpression）
    (t === 'Property' && parent?.type === 'ObjectExpression') ||
    // 对象内展开（同 TS SpreadAssignment；数组/调用展开不计）
    (t === 'SpreadElement' && parent?.type === 'ObjectExpression') ||
    // 类成员：方法/getter/setter/constructor 各计一
    t === 'MethodDefinition' ||
    // 类字段（oxc/ESTree 命名；ClassProperty 为兼容别名）
    t === 'PropertyDefinition' ||
    t === 'ClassProperty';

  (function visit(node, parent) {
    const t = node.type;
    if (
      (t.endsWith('Statement') || t.endsWith('Declaration')) &&
      t !== 'BlockStatement' &&
      t !== 'EmptyStatement'
    ) {
      // isStatement 面（含函数/类/变量/导入导出等声明语句）+1
      // `export const x` 的 TS 形态是带修饰符的 VariableStatement（计 1）；
      // export 包装节点不再计，由内层声明计入，保持平价
      const isWrappedDecl =
        (t === 'ExportNamedDeclaration' || t === 'ExportDefaultDeclaration') &&
        node.declaration != null;
      if (!isWrappedDecl) n++;
    }
    // TS 对 FunctionDeclaration/ClassDeclaration 语句+声明各计一次
    if (t === 'FunctionDeclaration' || t === 'ClassDeclaration') n++;
    if (isMember(t, parent)) n++;
    childNodes(node, (c) => visit(c, node));
  })(ast, null);
  return n;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];

const rows = walk(SRC).map((f) => {
  const text = readFileSync(f, 'utf8');
  const physical = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  return { file: relative(ROOT, f).replace(/\\/g, '/'), units: countLogicalUnits(f, text), physical };
});

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const topIdx = args.indexOf('--top');
const topN = topIdx >= 0 ? Number(args[topIdx + 1] ?? 20) : 0;

const unitsSorted = rows.map((r) => r.units).sort((a, b) => a - b);
const over = rows.filter((r) => r.units > LIMIT).sort((a, b) => b.units - a.units);
const overLines = rows.filter((r) => r.physical > HARD_LINE_CEILING);
const totalUnits = rows.reduce((s, r) => s + r.units, 0);
const totalLines = rows.reduce((s, r) => s + r.physical, 0);

console.log('文件规模检查（逻辑单元口径，格式无关；解析器 oxc-parser）');
console.log(`  扫描 ${rows.length} 个 .ts/.tsx；合计 ${totalUnits} 逻辑单元 / ${totalLines} 物理行`);
console.log(
  `  逻辑单元分布：中位 ${pct(unitsSorted, 0.5)} / p90 ${pct(unitsSorted, 0.9)} / p95 ${pct(unitsSorted, 0.95)} / p99 ${pct(unitsSorted, 0.99)} / 最大 ${unitsSorted[unitsSorted.length - 1]}`,
);
console.log(
  `  上限 ${LIMIT} 逻辑单元 → 超限 ${over.length} 个；物理行护栏 ${HARD_LINE_CEILING} → 超限 ${overLines.length} 个`,
);
console.log('');

const allow = existsSync(ALLOWLIST_PATH) ? JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) : { exceptions: [] };
const allowedFiles = new Set(allow.exceptions.map((e) => e.file));
const newViolations = over.filter((r) => !allowedFiles.has(r.file));
const staleExceptions = allow.exceptions.filter((e) => !rows.some((r) => r.file === e.file && r.units > LIMIT));

if (!summaryOnly && over.length > 0) {
  const lineRank = [...rows].sort((a, b) => b.physical - a.physical);
  console.log('超限文件：');
  for (const r of over) {
    const rank = lineRank.findIndex((x) => x.file === r.file) + 1;
    const tag = allowedFiles.has(r.file) ? '（例外清单）' : '★ 新增违规';
    console.log(
      `  ${String(r.units).padStart(4)} 单元  ${String(r.physical).padStart(5)} 行  行数排名 #${rank}  ${r.file}  ${tag}`,
    );
  }
  console.log('');
}

if (staleExceptions.length > 0) {
  console.log('例外清单中已不再超限、应当移除的条目：');
  for (const e of staleExceptions) console.log(`  ${e.file}`);
  console.log('');
}

if (topN > 0) {
  console.log(`逻辑单元最多的 ${topN} 个文件：`);
  for (const r of [...rows].sort((a, b) => b.units - a.units).slice(0, topN)) {
    console.log(`  ${String(r.units).padStart(4)} 单元  ${String(r.physical).padStart(5)} 行  ${r.file}`);
  }
  console.log('');
}

if (newViolations.length > 0 || overLines.length > 0) {
  console.log(`✖ 未通过：新增超限 ${newViolations.length} 个，物理行超护栏 ${overLines.length} 个`);
  process.exit(1);
}
console.log(`✓ 通过：无新增超限（存量例外 ${allow.exceptions.length} 个已登记，见 scripts/file-size-allowlist.json）`);
