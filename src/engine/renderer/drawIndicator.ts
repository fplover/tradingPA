import type { Bar } from '@/types/market';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { DrawGeometry } from './drawSeries';

/**
 * 指标绘制：line / histogram / band / level 四种 plot 类型。
 * 坐标系为面板局部坐标（调用方已 translate）。
 *
 * 同帧复用（架构评估 #4）：computeWindow 带实例级脏缓存，autoscale
 * （indicatorRange）/ 本函数 / 图例（indicatorValuesAt）在一帧内对同一
 * (instance, 窗口) 的调用只触发一次 compute——消费方无需传结果，直接调
 * computeWindow 即自动合并。图例用 50 根回看窗口，与绘制窗口是两个键，
 * 各自缓存、跨帧复用（十字光标移动时绘制窗口命中、仅图例窗口重算）。
 */
export function drawIndicator(
  ctx: CanvasRenderingContext2D,
  instance: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  const { outputs, ctxFrom } = instance.computeWindow(bars, from, to);
  const n = to - from + 1;
  if (n <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();

  // 零轴（histogram 用）
  const zeroY = priceScale.priceToY(0);

  for (const plot of instance.def.plots) {
    const values = outputs[plot.key];
    if (!values || instance.isPlotHidden(plot.key)) continue;
    const style = instance.styleFor(plot.key, plot.style);

    if (style.kind === 'histogram') {
      const spacing = viewport.spacing;
      const bodyW = Math.max(1, Math.min(spacing * 0.7, 30));
      for (const up of [true, false]) {
        ctx.fillStyle = up ? (style.upColor ?? style.color) : (style.downColor ?? style.color);
        ctx.beginPath();
        for (let i = from; i <= to; i++) {
          const v = values[i - ctxFrom];
          if (v === undefined) continue;
          // colorByBar：按 K 线涨跌分群；否则按数值正负分群（零值不绘制）
          const inGroup = style.colorByBar ? bars[i].close >= bars[i].open === up : Math.sign(v) === (up ? 1 : -1);
          if (!inGroup) continue;
          const x = viewport.indexToX(i) - bodyW / 2;
          if (x > geo.chartW || x + bodyW < 0) continue;
          const y = priceScale.priceToY(v);
          const top = Math.min(y, zeroY);
          const h = Math.max(1, Math.abs(zeroY - y));
          ctx.rect(x, top, bodyW, h);
        }
        ctx.fill();
      }
      continue;
    }

    if (style.kind === 'band') {
      const other = outputs[style.bandWith ?? ''];
      if (!other) continue;
      ctx.fillStyle = style.color;
      ctx.beginPath();
      // 逐连续段填充：上/下带任一 undefined 即断开（不再回退 0 价），下一有效点
      // moveTo 开新段；段内上带正向走到底后，下带原路折返，closePath 闭合。
      let i = from;
      while (i <= to) {
        const v = values[i - ctxFrom];
        const w = other[i - ctxFrom];
        if (v === undefined || w === undefined) {
          i++;
          continue;
        }
        // 段右界 j：上/下带同时有效的最大连续 index
        let j = i;
        while (j < to) {
          const nv = values[j + 1 - ctxFrom];
          const nw = other[j + 1 - ctxFrom];
          if (nv === undefined || nw === undefined) break;
          j++;
        }
        ctx.moveTo(viewport.indexToX(i), priceScale.priceToY(v));
        for (let k = i + 1; k <= j; k++) {
          const kv = values[k - ctxFrom];
          if (kv === undefined) break;
          ctx.lineTo(viewport.indexToX(k), priceScale.priceToY(kv));
        }
        for (let k = j; k >= i; k--) {
          const kw = other[k - ctxFrom];
          if (kw === undefined) break;
          ctx.lineTo(viewport.indexToX(k), priceScale.priceToY(kw));
        }
        ctx.closePath();
        i = j + 1;
      }
      ctx.fill();
      continue;
    }

    // line / level
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth ?? 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    for (let i = from; i <= to; i++) {
      const v = values[i - ctxFrom];
      if (v === undefined) {
        pen = false;
        continue;
      }
      const x = viewport.indexToX(i);
      const y = priceScale.priceToY(v);
      if (!pen) {
        ctx.moveTo(x, y);
        pen = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** 指标在可见范围内的值域（用于副图自动缩放）。
 *  与 drawIndicator 同窗口：脏缓存保证一帧内两者只算一次。 */
export function indicatorRange(
  instance: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  to: number,
): { low: number; high: number } {
  const { outputs, ctxFrom } = instance.computeWindow(bars, from, to);
  let low = Infinity;
  let high = -Infinity;
  for (const key of Object.keys(outputs)) {
    if (key === 'band') continue;
    const values = outputs[key];
    for (let i = from; i <= to; i++) {
      const v = values[i - ctxFrom];
      if (v === undefined) continue;
      if (v < low) low = v;
      if (v > high) high = v;
    }
  }
  return { low, high };
}

/** 取某个 index 上全部 plot 的值（图例用）。
 *  窗口为 (index-50, index) 的 50 根回看：与绘制窗口分离，跨帧复用。 */
export function indicatorValuesAt(
  instance: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  index: number,
): Array<{ label: string; value: number }> {
  const { outputs, ctxFrom } = instance.computeWindow(bars, from, index);
  const out: Array<{ label: string; value: number }> = [];
  for (const plot of instance.def.plots) {
    if (instance.isPlotHidden(plot.key)) continue;
    const v = outputs[plot.key]?.[index - ctxFrom];
    if (v !== undefined) out.push({ label: plot.label, value: v });
  }
  return out;
}
