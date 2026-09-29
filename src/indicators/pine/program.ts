import type { Bar } from '@/types/market';
import type { IndicatorDef, IndicatorPlot, ParamValue } from '../core/types';
import type { CompileResult, PaintDirective, PineProgram } from './ast';
import { COLORS } from './series';
import { parseProgram } from './parser';
import { runProgram } from './interpreter';
import { collectLookbackExpr, collectLookbackStmts, validateProgram } from './validator';
import type { S } from './series';

/**
 * Pine 编译装配：解析 → 静态校验 → 构建 IndicatorDef（复用副图/图例/设置管线）。
 * 运行期错误前置（AC-B2）：编译完成后用合成 K 线 dry-run 一遍 compute，
 * 运行期抛错即转编译错误返回（def=null）；运行期兜底不再穿透渲染循环（rAF）。
 */

interface RuntimeMeta {
  paint: PaintDirective[];
  lastError?: string;
}

/** def → 运行期元数据（paint 条件序列 / 最近一次运行期错误） */
const metaMap = new WeakMap<IndicatorDef, RuntimeMeta>();

/** 读取脚本 bgcolor/barcolor 指令的最近一次计算结果（渲染接线用，P2） */
export function pinePaint(def: IndicatorDef): PaintDirective[] | undefined {
  return metaMap.get(def)?.paint;
}

/** 读取最近一次 compute 的运行期错误（正常应为 undefined） */
export function pineRuntimeError(def: IndicatorDef): string | undefined {
  return metaMap.get(def)?.lastError;
}

/** 合成探针 K 线：覆盖默认 lookback 基线（150），OHLC 自洽、量能为正 */
function probeBars(n = 220): Bar[] {
  const t0 = new Date(2024, 0, 1).getTime();
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const close = 100 + Math.sin(i / 7) * 5 + i * 0.01;
    out.push({
      time: t0 + i * 60_000,
      open: close - 0.5,
      high: close + 1,
      low: close - 1.5,
      close,
      volume: 1000 + (i % 10) * 50,
    });
  }
  return out;
}

function parseErrorLine(e: unknown): { line: number; message: string } {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/^第 (\d+) 行：/);
  return { line: m ? Number(m[1]) : 1, message: m ? msg.slice(m[0].length) : msg };
}

function emptyOutputs(n: number, keys: string[]): Record<string, S> {
  const out: Record<string, S> = {};
  for (const k of keys) out[k] = new Array<number | undefined>(n).fill(undefined);
  return out;
}

export function compilePine(source: string, id: string): CompileResult {
  let prog: PineProgram;
  try {
    prog = parseProgram(source);
  } catch (e) {
    return { def: null, errors: [parseErrorLine(e)], paint: [] };
  }

  const errors: import('./ast').PineError[] = [];
  validateProgram(prog, errors);
  if (prog.plots.length === 0 && prog.hlines.length === 0 && errors.length === 0) {
    errors.push({ line: source.split(/\r?\n/).length, message: '脚本缺少 plot() 调用' });
  }
  if (errors.length > 0) return { def: null, errors, paint: [] };

  const acc = { max: 100 };
  collectLookbackStmts(prog.body, acc);
  for (const p of prog.plots) collectLookbackExpr(p.expr, acc);
  for (const h of prog.hlines) collectLookbackExpr(h.price, acc);
  for (const p of prog.paints) if (p.cond) collectLookbackExpr(p.cond, acc);

  const defaults: Record<string, ParamValue> = {};
  for (const p of prog.params) defaults[p.key] = p.default;

  const plotKeys = prog.plots.map((_, i) => `p${i}`);
  const hlineKeys = prog.hlines.map((_, i) => `h${i}`);
  const allKeys = [...plotKeys, ...hlineKeys];

  const meta: RuntimeMeta = { paint: [] };
  const def: IndicatorDef = {
    id,
    name: prog.name,
    category: '自定义',
    overlay: prog.overlay,
    lookback: Math.min(2000, Math.ceil(acc.max) + 50),
    params: prog.params,
    plots: buildPlotDefs(prog),
    compute(bars: readonly Bar[], prm: Record<string, ParamValue>) {
      try {
        const r = runProgram(prog, bars, { ...defaults, ...prm });
        const out: Record<string, S> = {};
        r.plots.forEach((s, i) => (out[`p${i}`] = s));
        r.hlines.forEach((s, i) => (out[`h${i}`] = s));
        meta.paint = prog.paints.map((p, i) => ({
          kind: p.t,
          color: p.color ?? COLORS['color.blue'],
          cond: r.paintConds[i],
          line: p.line,
        }));
        meta.lastError = undefined;
        return out;
      } catch (e) {
        // 运行期兜底：返回全 undefined 输出，不向渲染循环（rAF）抛错
        meta.lastError = e instanceof Error ? e.message : String(e);
        return emptyOutputs(bars.length, allKeys);
      }
    },
  };
  metaMap.set(def, meta);

  // AC-B2 前置校验：合成 K 线 dry-run，运行期抛错转为编译错误（不进图表渲染）
  try {
    def.compute(probeBars(), {});
  } catch {
    /* compute 内部兜底，不应走到这里 */
  }
  const rt = meta.lastError;
  if (rt) {
    metaMap.delete(def);
    return { def: null, errors: [{ line: 1, message: `运行期校验失败：${rt}` }], paint: [] };
  }

  return { def, errors: [], paint: meta.paint };
}

/** plot + hline 合并为 plot 定义，按行号排序（legend 顺序与脚本一致）；key 独立于排序 */
function buildPlotDefs(prog: PineProgram): IndicatorPlot[] {
  const entries: Array<{ line: number; plot: IndicatorPlot }> = [];
  prog.plots.forEach((p, i) => {
    entries.push({
      line: p.line,
      plot: { key: `p${i}`, label: p.title || prog.name, style: p.style },
    });
  });
  prog.hlines.forEach((h, i) => {
    entries.push({
      line: h.line,
      plot: {
        key: `h${i}`,
        label: h.title || 'hline',
        style: { kind: 'level', color: h.color ?? COLORS['color.blue'], lineWidth: 1 },
      },
    });
  });
  return entries.sort((a, b) => a.line - b.line).map((e) => e.plot);
}
