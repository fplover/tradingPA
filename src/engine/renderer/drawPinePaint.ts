import type { Bar } from '@/types/market';
import type { BarPaint } from '@/indicators/core/types';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { ChartTypeId } from '@/types/market';
import type { DrawGeometry } from './drawSeries';

/** Pine 绘图指令渲染（P2-A①）：bgcolor 背景色带 + barcolor 蜡烛体色覆绘。
 *  条件序列取自指标实例的 computeExtra 旁路（与 compute 同窗口缓存，防串窗）。
 *  只作用于主价格面板（bgcolor/barcolor 是图表背景/蜡烛语义；副图指标面
 *  TV 亦不绘制 paint——已知边界）。 */

/** bgcolor 固定透明度（Pine 子集无 transp 入参；0x26/255 ≈ 0.15，TV 观感） */
const BG_ALPHA = '26';

/** barcolor 覆绘仅对蜡烛族图表类型生效（TV 语义：barcolor 只改蜡烛体色；
 *  线形/面积等类型上绘制体矩形会画出幽灵方块） */
const CANDLE_LIKE: ReadonlySet<ChartTypeId> = new Set<ChartTypeId>([
  'candles',
  'hollow',
  'heikin-ashi',
  'volume-candles',
  'renko',
  'kagi',
  'line-break',
  'point-figure',
  'range',
]);

/** 该图表类型是否绘制 barcolor 覆绘（PaneRenderer 调用点判据） */
export function isCandleLike(type: ChartTypeId): boolean {
  return CANDLE_LIKE.has(type);
}

function condOn(paint: BarPaint, i: number, ctxFrom: number): boolean {
  if (paint.cond === null) return true; // 纯 color.xxx 常量：恒生效
  const v = paint.cond[i - ctxFrom];
  return v !== undefined && v !== 0;
}

/**
 * 绘制 Pine paint 指令的一个相位。
 *  mode 'bg'：bgcolor 背景色带（K 线之前调用，画布层最底）；
 *  mode 'bar'：barcolor 蜡烛体色覆绘（K 线之后调用）。
 *  computeWindow 与 drawIndicator 同 (bars, from, to) 同键——一帧内只算一次。
 */
export function drawPinePaint(
  ctx: CanvasRenderingContext2D,
  instance: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  mode: 'bg' | 'bar',
): void {
  const { extra, ctxFrom } = instance.computeWindow(bars, from, to);
  if (extra === undefined || extra === null) return;
  const paints = extra as BarPaint[];
  if (paints.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();

  const spacing = viewport.spacing;

  for (const paint of paints) {
    if (paint.kind === 'bgcolor' && mode === 'bg') {
      ctx.fillStyle = paint.color + BG_ALPHA;
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        if (!condOn(paint, i, ctxFrom)) continue;
        const x = viewport.indexToX(i) - spacing / 2;
        if (x > geo.chartW || x + spacing < 0) continue;
        ctx.rect(x, 0, spacing, geo.chartH);
      }
      ctx.fill();
    }

    if (paint.kind === 'barcolor' && mode === 'bar') {
      // 体矩形与 drawCandles 同几何（spacing*0.7 钳 [1,30]），覆绘不改变影线
      const bodyW = Math.max(1, Math.min(spacing * 0.7, 30));
      ctx.fillStyle = paint.color;
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        if (!condOn(paint, i, ctxFrom)) continue;
        const bar: Bar | undefined = bars[i];
        if (!bar) continue;
        const xCenter = viewport.indexToX(i);
        const x = xCenter - bodyW / 2;
        if (x > geo.chartW || x + bodyW < 0) continue;
        const yOpen = priceScale.priceToY(bar.open);
        const yClose = priceScale.priceToY(bar.close);
        const top = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        ctx.rect(x, top, bodyW, bodyH);
      }
      ctx.fill();
    }
  }

  ctx.restore();
}
