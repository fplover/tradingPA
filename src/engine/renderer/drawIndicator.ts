import type { Bar } from '@/types/market';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { DrawGeometry } from './drawSeries';

/**
 * 指标绘制：line / histogram / band / level 四种 plot 类型。
 * 坐标系为面板局部坐标（调用方已 translate）。
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
    if (!values) continue;
    const style = plot.style;

    if (style.kind === 'histogram') {
      const spacing = viewport.spacing;
      const bodyW = Math.max(1, Math.min(spacing * 0.7, 30));
      for (const up of [true, false]) {
        ctx.fillStyle = up ? style.upColor ?? style.color : style.downColor ?? style.color;
        ctx.beginPath();
        for (let i = from; i <= to; i++) {
          const v = values[i - ctxFrom];
          if (v === undefined) continue;
          // colorByBar：按 K 线涨跌分群；否则按数值正负分群（零值不绘制）
          const inGroup = style.colorByBar
            ? bars[i].close >= bars[i].open === up
            : Math.sign(v) === (up ? 1 : -1);
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
      let started = false;
      let firstX = 0;
      for (let i = from; i <= to; i++) {
        const v = values[i - ctxFrom];
        const w = other[i - ctxFrom];
        if (v === undefined || w === undefined) {
          started = false;
          continue;
        }
        const x = viewport.indexToX(i);
        const y = priceScale.priceToY(v);
        if (!started) {
          ctx.moveTo(x, y);
          firstX = x;
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (started) {
        for (let i = to; i >= from; i--) {
          const w = other[i - ctxFrom];
          if (w === undefined) continue;
          ctx.lineTo(viewport.indexToX(i), priceScale.priceToY(w));
        }
        ctx.lineTo(firstX, priceScale.priceToY(other[from - ctxFrom] ?? 0));
        ctx.closePath();
        ctx.fill();
      }
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

/** 指标在可见范围内的值域（用于副图自动缩放） */
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

/** 取某个 index 上全部 plot 的值（图例用） */
export function indicatorValuesAt(
  instance: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  index: number,
): Array<{ label: string; value: number }> {
  const { outputs, ctxFrom } = instance.computeWindow(bars, from, index);
  const out: Array<{ label: string; value: number }> = [];
  for (const plot of instance.def.plots) {
    const v = outputs[plot.key]?.[index - ctxFrom];
    if (v !== undefined) out.push({ label: plot.label, value: v });
  }
  return out;
}
