#!/usr/bin/env node
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

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
 * **逻辑单元数**：用 TypeScript 解析器统计语法树中代表「一块逻辑/结构」的节点——
 * 语句、类型/函数/枚举声明、类成员、对象字面量成员。该计数与排版完全无关
 * （折行、缩进、空行、注释都不影响），因此是稳定红线。
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

/** 语法树中的「逻辑单元」：语句 + 声明 + 类成员 + 对象字面量成员 */
function countLogicalUnits(fileName, text) {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.ES2022,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let n = 0;
  const isMember = (k) =>
    k === ts.SyntaxKind.PropertyAssignment ||
    k === ts.SyntaxKind.ShorthandPropertyAssignment ||
    k === ts.SyntaxKind.SpreadAssignment ||
    k === ts.SyntaxKind.MethodDeclaration ||
    k === ts.SyntaxKind.PropertyDeclaration ||
    k === ts.SyntaxKind.GetAccessor ||
    k === ts.SyntaxKind.SetAccessor ||
    k === ts.SyntaxKind.Constructor;

  (function visit(node) {
    const k = node.kind;
    if (ts.isStatement(node) && k !== ts.SyntaxKind.Block && k !== ts.SyntaxKind.EmptyStatement) n++;
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      n++;
    }
    if (isMember(k)) n++;
    ts.forEachChild(node, visit);
  })(sf);
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

console.log('文件规模检查（逻辑单元口径，格式无关）');
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
