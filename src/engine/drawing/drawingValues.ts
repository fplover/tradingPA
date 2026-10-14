/**
 * 画线在某像素 x 上的价格读数（三期-C2 数据窗口）。
 *
 * 口径（2026-10-14 用户裁决「甲档出数，其余一律 —」）：只有「在该 x 上画着一条确定高度的线」
 * 的族给读数，其余族返回空数组。**有效区间判据与渲染层逐字同源**——共用 `geom.rayEndPix`、
 * `fibMath.fibLevelEndX`、同一「两点像素直线」插值，保证「屏幕上画着线 ⇒ 表里有数、
 * 屏幕上线不经过该 x ⇒ 表里空」。反过来若此处另起一套时间域判据，表格就会报出画面上没有的数。
 *
 * 像素域插值后再 `yToPrice`：对数轴下像素线性 ≠ 价格线性，表里的数必须是屏幕上那条线的高度。
 * 唯档位组（fib / fib-extension / percent-line）反向——渲染本就是「价格域公式 → priceToY」，
 * 故读数直接取同一价格域公式，与画布同一个值。
 */
import type { Drawing } from './types';
import type { DrawContext } from './coords';
import { pointToPixel } from './coords';
import type { PriceScale } from '../scale/PriceScale';
import { rayEndPix } from './geom';
import {
  FIB_EXTENSION_LEVELS,
  FIB_FAN_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  fibExtensionPrice,
  fibLevelEndX,
  fibRetracementPrice,
} from './fibMath';
import { PERCENT_LEVELS, percentPrice } from './percentMath';
import { FIB_CHANNEL_LEVELS, channelLineAt } from './fibTailMath';
import { fanRayEndPix } from './fibRender';

type Pix = { x: number; y: number };

/** 一条读数：label = 档位名（无档位的单值族为空串），value = 价格 */
export interface DrawingReading {
  label: string;
  value: number;
}

/** 线段（含端点）在 x 上的读数；两端同 x 的垂直线无价格读数。 */
function segReading(a: Pix, b: Pix, x: number, scale: PriceScale, label = ''): DrawingReading[] {
  if (a.x === b.x || x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) return [];
  const f = (x - a.x) / (b.x - a.x);
  return [{ label, value: scale.yToPrice(a.y + (b.y - a.y) * f) }];
}

/** 水平档位组：档位价用渲染同一价格域公式；x 须落在 [x0, endX] 这段线内（末端与渲染同 fibLevelEndX）。 */
function levelReadings(
  levels: readonly number[],
  priceOf: (level: number) => number,
  x0: number,
  endX: number,
  x: number,
): DrawingReading[] {
  if (x < x0 || x > endX) return [];
  return levels.map((lv) => ({ label: `${(lv * 100).toFixed(1)}%`, value: priceOf(lv) }));
}

/** 回撤 / 百分比线的水平档组公共面：两点锚 → [x0, endX]（与 drawFibRetracement 同式）。 */
function pairLevelSpan(pts: readonly Pix[], chartW: number): { x0: number; endX: number } {
  const x0 = Math.min(pts[0].x, pts[1].x);
  return { x0, endX: fibLevelEndX(x0, Math.max(pts[0].x, pts[1].x), chartW) };
}

export function drawingReadingsAt(d: Drawing, x: number, dctx: DrawContext): DrawingReading[] {
  const pts = d.points.map((p) => pointToPixel(p, dctx));
  const scale = dctx.priceScale;
  if (pts.length === 0) return [];
  switch (d.type) {
    case 'hline':
      return [{ label: '', value: d.points[0].price }];
    case 'price-note':
      // 锚价旗标 + 虚线延伸到右缘（miscRender.drawPriceNote）：锚点之右才有这根线
      return x >= pts[0].x ? [{ label: '', value: d.points[0].price }] : [];
    case 'trendline':
    case 'arrow':
    case 'info-line':
    // 测量段与趋势线同一条两点像素直线（`measureRender.ts:37-40` 只多虚线与浮层标签，
    // 浮层标签是统计文字不是价格，故不进出数）
    case 'measure':
      return pts.length < 2 ? [] : segReading(pts[0], pts[1], x, scale);
    case 'ray':
      return pts.length < 2 ? [] : segReading(pts[0], rayEndPix(pts[0], pts[1], dctx.geo.chartW), x, scale);
    case 'channel': {
      if (pts.length < 3) return [];
      // 平行偏移量取像素（与 drawDrawings 的 channel 分支同式）
      const ox = pts[2].x - pts[0].x;
      const oy = pts[2].y - pts[0].y;
      return [
        ...segReading(pts[0], pts[1], x, scale, '基线'),
        ...segReading({ x: pts[0].x + ox, y: pts[0].y + oy }, { x: pts[1].x + ox, y: pts[1].y + oy }, x, scale, '副线'),
      ];
    }
    case 'fib':
    case 'fib-auto': {
      if (pts.length < 2) return [];
      const { x0, endX } = pairLevelSpan(pts, dctx.geo.chartW);
      const [p0, p1] = d.points;
      return levelReadings(
        d.levels ?? FIB_RETRACEMENT_LEVELS,
        (lv) => fibRetracementPrice(p0.price, p1.price, lv),
        x0,
        endX,
        x,
      );
    }
    case 'fib-extension': {
      if (pts.length < 3) return [];
      const x0 = Math.min(pts[0].x, pts[1].x, pts[2].x);
      const endX = fibLevelEndX(x0, Math.max(pts[0].x, pts[1].x, pts[2].x), dctx.geo.chartW);
      const [e0, e1, pivot] = d.points;
      return levelReadings(
        d.levels ?? FIB_EXTENSION_LEVELS,
        (lv) => fibExtensionPrice(e0.price, e1.price, pivot.price, lv),
        x0,
        endX,
        x,
      );
    }
    case 'percent-line': {
      if (pts.length < 2) return [];
      const { x0, endX } = pairLevelSpan(pts, dctx.geo.chartW);
      const [p0, p1] = d.points;
      return levelReadings(d.levels ?? PERCENT_LEVELS, (lv) => percentPrice(p0.price, p1.price, lv), x0, endX, x);
    }
    case 'fib-fan': {
      if (pts.length < 2) return [];
      const out: DrawingReading[] = [];
      for (const lv of FIB_FAN_LEVELS) {
        const end = fanRayEndPix(d.points[0], d.points[1], lv, dctx);
        out.push(...segReading(pts[0], end, x, scale, `${(lv * 100).toFixed(1)}%`));
      }
      return out;
    }
    case 'fib-channel': {
      if (d.points.length < 3) return [];
      const out: DrawingReading[] = [];
      // 档位线是世界点线段（channelLineAt），换算到像素后与其余线族同一插值
      for (const lv of d.levels ?? FIB_CHANNEL_LEVELS) {
        const line = channelLineAt(d.points[0], d.points[1], d.points[2], lv);
        out.push(...segReading(pointToPixel(line.a, dctx), pointToPixel(line.b, dctx), x, scale, String(lv)));
      }
      return out;
    }
    default:
      // 乙（区域盒）/ 丙（形态标注）/ 丁（文字标记）/ 戊（角度·时间·曲线构造）档：该 x 上无确定价格
      return [];
  }
}
