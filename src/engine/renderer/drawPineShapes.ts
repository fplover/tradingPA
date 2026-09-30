import type { Bar } from '@/types/market';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { DrawGeometry } from './drawSeries';
import type { ShapeDirective } from '@/indicators/pine/ast';
import { TV_FONT } from '../theme';

/** Pine plotshape/plotchar 渲染（P2-A②）：条件标记图形，K 线之后绘制（不被
 *  barcolor 体色覆绘遮盖）。指令序列取自指标实例的 computeExtra 旁路（与 compute
 *  同窗口缓存，防串窗），接入方式同 drawPinePaint。
 *  只作用于主价格面板（overlay 语义；副图指标面 TV 亦不绘制 shape——已知边界）。
 *  plotshape/plotchar 不产数值 plot：不参与 indicatorRange 与图例数值。 */

/** location.belowbar/abovebar 的标记外偏（像素）：size + 固定间距 */
function markY(sh: ShapeDirective, i: number, ctxFrom: number, bar: Bar, ps: PriceScale): number | null {
  switch (sh.location) {
    case 'abovebar':
      return ps.priceToY(bar.high) - sh.size - 2;
    case 'belowbar':
      return ps.priceToY(bar.low) + sh.size + 2;
    case 'absolute': {
      const p = sh.price?.[i - ctxFrom];
      return typeof p === 'number' && Number.isFinite(p) ? ps.priceToY(p) : null;
    }
  }
}

/** 画一种 shape.* 路径（TV 常用子集；描边系用 stroke，填充系用 fill，统一 fillStyle 色） */
function drawShape(ctx: CanvasRenderingContext2D, style: string, cx: number, cy: number, r: number): void {
  ctx.lineWidth = Math.max(1, r / 4);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (style) {
    case 'triangleup':
    case 'triangledown': {
      const dir = style === 'triangleup' ? -1 : 1; // -1 尖端朝上
      ctx.beginPath();
      ctx.moveTo(cx, cy + dir * r);
      ctx.lineTo(cx - r, cy - dir * r);
      ctx.lineTo(cx + r, cy - dir * r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'xcross':
    case 'circle-cross': {
      // 圆环 + 内部交叉（xcross=✕，circle-cross=＋）；同色描边保证可见
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      const k = r * 0.5;
      ctx.beginPath();
      if (style === 'xcross') {
        ctx.moveTo(cx - k, cy - k);
        ctx.lineTo(cx + k, cy + k);
        ctx.moveTo(cx + k, cy - k);
        ctx.lineTo(cx - k, cy + k);
      } else {
        ctx.moveTo(cx - k, cy);
        ctx.lineTo(cx + k, cy);
        ctx.moveTo(cx, cy - k);
        ctx.lineTo(cx, cy + k);
      }
      ctx.stroke();
      break;
    }
    case 'circle':
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      break;
    default: {
      // cross（✕）及其余未知名：对角线交叉
      const k = r * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - k, cy - k);
      ctx.lineTo(cx + k, cy + k);
      ctx.moveTo(cx + k, cy - k);
      ctx.lineTo(cx - k, cy + k);
      ctx.stroke();
      break;
    }
  }
}

/**
 * 绘制 Pine shape 指令（plotshape/plotchar）的全部可见标记。
 * computeWindow 与 drawIndicator 同 (bars, from, to) 同键——一帧内只算一次；
 * extra 中混有 paint/alert 指令，按 kind 过滤（与 drawPinePaint 互为相位隔离）。
 */
export function drawPineShapes(
  ctx: CanvasRenderingContext2D,
  instance: IndicatorInstance,
  bars: readonly Bar[],
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  const { extra, ctxFrom } = instance.computeWindow(bars, from, to);
  if (extra === undefined || extra === null) return;
  const shapes = (extra as ShapeDirective[]).filter((e) => e.kind === 'shape' || e.kind === 'char');
  if (shapes.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();

  for (const sh of shapes) {
    ctx.fillStyle = sh.color;
    ctx.strokeStyle = sh.color;
    if (sh.kind === 'char') {
      ctx.font = `${sh.size}px ${TV_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }
    const margin = sh.size * 2 + 4;
    for (let i = from; i <= to; i++) {
      const v = sh.cond === null ? 1 : sh.cond[i - ctxFrom];
      // 非零有限数为真（Pine 布尔语义）；undefined/0/NaN 不画
      if (v === undefined || v === 0 || !Number.isFinite(v)) continue;
      const x = viewport.indexToX(i);
      if (x < -margin || x > geo.chartW + margin) continue;
      const bar: Bar | undefined = bars[i];
      if (!bar) continue;
      const y = markY(sh, i, ctxFrom, bar, priceScale);
      if (y === null) continue;
      if (sh.kind === 'char') {
        ctx.fillText(sh.style, x, y);
      } else {
        drawShape(ctx, sh.style, x, y, sh.size);
      }
      if (sh.text) {
        // text= 附加文本：标记右侧 10px 小字（左对齐）
        ctx.font = `10px ${TV_FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(sh.text, x + sh.size + 2, y);
        // 恢复字符标记的居中/字号基准（被文本绘制改动）
        if (sh.kind === 'char') {
          ctx.font = `${sh.size}px ${TV_FONT}`;
          ctx.textAlign = 'center';
        }
      }
    }
  }

  ctx.restore();
}
