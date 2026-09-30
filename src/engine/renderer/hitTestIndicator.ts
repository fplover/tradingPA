/** 指标折线命中 + 主面板指标选中（TV 式选择工具栏的引擎支撑）。
 *  纯函数、无 canvas 依赖：与 drawIndicator 同窗口（computeWindow 脏缓存同帧复用），
 *  只对主面板叠加指标、只在 pointerdown 调一次，不进渲染路径。 */
import type { Bar } from '@/types/market';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { BarSeries } from '@/data/BarSeries';
import { distToSegment } from '../drawing/geom';
import type { BBox, SelectionPopupTracker } from './selectionPopup';

// 供输入层窄接线复用（选择工具栏状态机类型与命中模块同源，避免调用方反向 import）
export type { BBox, SelectionPopupTracker } from './selectionPopup';

/** 折线命中容差（与画线 body 命中同款 6px） */
const HIT_TOL = 6;

/** 指标所在面板的最小形状（InputPane 结构子集，避免反向依赖） */
export interface IndicatorHitPane {
  y: number;
  height: number;
  priceScale: PriceScale;
  indicators: readonly IndicatorInstance[];
}

/** 指标选中宿主窄接口（InputHost 结构子集） */
export interface StudyHitHost {
  panes(): readonly IndicatorHitPane[];
  displaySeries(): BarSeries;
  readonly viewport: Viewport;
  visibleRange(): { from: number; to: number };
  /** 主面板当前可见指标（hideStudies / 可见周期过滤由宿主策略决定） */
  visibleStudies(): readonly IndicatorInstance[];
  chartW(): number;
}

/** histogram 柱体矩形命中（与 drawIndicator 同几何：零轴起柱、bodyW = clamp(间距×0.7, 1, 30)） */
function histogramHit(
  values: Array<number | undefined>,
  ctxFrom: number,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  x: number,
  y: number,
): boolean {
  const bodyW = Math.max(1, Math.min(viewport.spacing * 0.7, 30));
  const zeroY = priceScale.priceToY(0);
  for (let i = from; i <= to; i++) {
    const v = values[i - ctxFrom];
    if (v === undefined) continue;
    const bx = viewport.indexToX(i) - bodyW / 2;
    if (x < bx || x > bx + bodyW) continue;
    const vy = priceScale.priceToY(v);
    if (y >= Math.min(vy, zeroY) && y <= Math.max(vy, zeroY)) return true;
  }
  return false;
}

/** 指标折线命中：line/level/band 取可见值折线任一段距 (x, y) ≤ 6px；
 *  histogram 取柱体矩形。窗口与 drawIndicator 一致（computeWindow 同键复用脏缓存），
 *  未定义值处断线不连段（与渲染一致）。 */
export function hitTestIndicatorLine(
  inst: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  x: number,
  y: number,
): boolean {
  const { outputs, ctxFrom } = inst.computeWindow(bars, from, to);
  for (const plot of inst.def.plots) {
    if (inst.isPlotHidden(plot.key)) continue;
    const values = outputs[plot.key];
    if (!values) continue;
    if (inst.styleFor(plot.key, plot.style).kind === 'histogram') {
      if (histogramHit(values, ctxFrom, from, to, viewport, priceScale, x, y)) return true;
      continue;
    }
    for (let i = from; i < to; i++) {
      const v0 = values[i - ctxFrom];
      const v1 = values[i + 1 - ctxFrom];
      if (v0 === undefined || v1 === undefined) continue; // 断点不连段（与渲染一致）
      if (
        distToSegment(x, y, viewport.indexToX(i), priceScale.priceToY(v0), viewport.indexToX(i + 1), priceScale.priceToY(v1)) <=
        HIT_TOL
      ) {
        return true;
      }
    }
  }
  return false;
}

/** 指标可见 defined 值的像素范围（min/max y 与首末可见 index 的 x；无 defined 值 → null） */
export function indicatorPixelBBox(
  inst: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
): BBox | null {
  const { outputs, ctxFrom } = inst.computeWindow(bars, from, to);
  let box: BBox | null = null;
  for (const plot of inst.def.plots) {
    if (inst.isPlotHidden(plot.key)) continue;
    const values = outputs[plot.key];
    if (!values) continue;
    for (let i = from; i <= to; i++) {
      const v = values[i - ctxFrom];
      if (v === undefined) continue;
      const px = viewport.indexToX(i);
      const py = priceScale.priceToY(v);
      if (!box) box = { x0: px, y0: py, x1: px, y1: py };
      else {
        if (px < box.x0) box.x0 = px;
        if (py < box.y0) box.y0 = py;
        if (px > box.x1) box.x1 = px;
        if (py > box.y1) box.y1 = py;
      }
    }
  }
  return box;
}

/** 主面板指标选中：仅主面板、仅传入的可见指标；命中返回 uid + 像素 bbox（供工具栏锚点） */
export function hitTestIndicatorAt(
  main: IndicatorHitPane,
  studies: readonly IndicatorInstance[],
  bars: readonly Bar[],
  from: number,
  to: number,
  viewport: Viewport,
  x: number,
  y: number,
): { uid: string; bbox: BBox } | null {
  if (y < main.y || y >= main.y + main.height) return null;
  const ly = y - main.y; // 面板局部坐标（priceScale 语义）
  for (const inst of studies) {
    if (!hitTestIndicatorLine(inst, bars, from, to, viewport, main.priceScale, x, ly)) continue;
    const bbox = indicatorPixelBBox(inst, bars, from, to, viewport, main.priceScale);
    if (bbox) return { uid: inst.uid, bbox };
  }
  return null;
}

/** 指标选中（TV 式选择工具栏）：主面板可见指标折线命中 → 选中并推送；
 *  未命中 / 不在主面板 → 清除（与画线选中互斥，互斥规则在 tracker 内） */
export function selectStudyAt(host: StudyHitHost, popup: SelectionPopupTracker, x: number, y: number): void {
  const main = host.panes()[0];
  const { from, to } = host.visibleRange();
  const hit = main ? hitTestIndicatorAt(main, host.visibleStudies(), host.displaySeries().raw(), from, to, host.viewport, x, y) : null;
  popup.setStudySelection(hit?.uid ?? null, hit?.bbox ?? null, host.chartW());
}
