import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { DrawContext } from '@/engine/drawing/drawDrawings';
import {
  FIB_ARC_LEVELS,
  FIB_EXTENSION_LEVELS,
  FIB_FAN_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  FIB_ZONE_COUNT,
  detectVisibleSwing,
  fibArcAngles,
  fibArcHit,
  fibExtensionPrice,
  fibFanEdgePrice,
  fibLevelEndX,
  fibRetracementPrice,
  fibZoneOffsets,
  fibZoneTimes,
} from '@/engine/drawing/fibMath';
import {
  drawFibArc,
  drawFibExtension,
  drawFibFan,
  drawFibRetracement,
  drawFibTimezone,
  fanRayEndPix,
  hitTestFib,
} from '@/engine/drawing/fibRender';
import { createMockCtx, asCtx, callsOf, fillTexts, hasCall, hasPair, propSets, type MockCtx } from './helpers/mock-ctx';

/**
 * B6 斐波那契家族单测：
 * - fibMath：比率常量 + 锚点→价位/时间/角度纯函数 + Auto Fib 简化算法边界
 * - fibRender：canvas mock 断言各变体绘制序列（线组/弧/时区）+ 命中测试
 */

beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// ---------- fibMath：比率常量（对齐 TV 默认档） ----------

describe('斐波那契比率常量（TV 默认档）', () => {
  it('回撤 7 档：0/0.236/0.382/0.5/0.618/0.786/1', () => {
    expect([...FIB_RETRACEMENT_LEVELS]).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
  });
  it('扩展 9 档：0.236/0.382/0.5/0.618/0.786/1/1.272/1.618/2.618', () => {
    expect([...FIB_EXTENSION_LEVELS]).toEqual([0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618]);
    for (let i = 1; i < FIB_EXTENSION_LEVELS.length; i++) {
      expect(FIB_EXTENSION_LEVELS[i]).toBeGreaterThan(FIB_EXTENSION_LEVELS[i - 1]);
    }
  });
  it('扇形/弧线各 3 档：0.382/0.5/0.618', () => {
    expect([...FIB_FAN_LEVELS]).toEqual([0.382, 0.5, 0.618]);
    expect([...FIB_ARC_LEVELS]).toEqual([0.382, 0.5, 0.618]);
  });
});

// ---------- fibMath：回撤/扩展价位 ----------

describe('fibRetracementPrice', () => {
  it('0 = 起点价，1 = 终点价，0.5 = 中点', () => {
    expect(fibRetracementPrice(100, 200, 0)).toBe(100);
    expect(fibRetracementPrice(100, 200, 1)).toBe(200);
    expect(fibRetracementPrice(100, 200, 0.5)).toBe(150);
  });
  it('下跌段（p1 < p0）比率线递减', () => {
    expect(fibRetracementPrice(200, 100, 0.618)).toBeCloseTo(138.2, 10);
  });
});

describe('fibExtensionPrice（枢轴 = 第 3 点）', () => {
  it('上升趋势：比率线落在枢轴上方', () => {
    // 起点 100 → 终点 200，回撤枢轴 150
    expect(fibExtensionPrice(100, 200, 150, 0.236)).toBeCloseTo(173.6, 10);
    expect(fibExtensionPrice(100, 200, 150, 0.382)).toBeCloseTo(188.2, 10);
    expect(fibExtensionPrice(100, 200, 150, 0.5)).toBe(200);
    expect(fibExtensionPrice(100, 200, 150, 0.618)).toBeCloseTo(211.8, 10);
    expect(fibExtensionPrice(100, 200, 150, 0.786)).toBeCloseTo(228.6, 10);
    expect(fibExtensionPrice(100, 200, 150, 1)).toBe(250);
    expect(fibExtensionPrice(100, 200, 150, 1.272)).toBeCloseTo(277.2, 10);
    expect(fibExtensionPrice(100, 200, 150, 1.618)).toBeCloseTo(311.8, 10);
    expect(fibExtensionPrice(100, 200, 150, 2.618)).toBeCloseTo(411.8, 10);
  });
  it('下降趋势：符号天然反转，比率线落在枢轴下方', () => {
    expect(fibExtensionPrice(200, 100, 150, 0.236)).toBeCloseTo(126.4, 10);
    expect(fibExtensionPrice(200, 100, 150, 1)).toBe(50);
    expect(fibExtensionPrice(200, 100, 150, 2.618)).toBeCloseTo(-111.8, 10);
  });
});

// ---------- fibMath：扇形边缘价 ----------

describe('fibFanEdgePrice', () => {
  it('边缘价 = 起点 + 全程价差 × 比率 × (边缘时间跨度 / 锚点时间跨度)', () => {
    // 锚点 t=0 → t=10（价 100→200），边缘 t=20：边缘跨度/锚跨度 = 2
    expect(fibFanEdgePrice(100, 200, 0, 10, 20, 0.5)).toBe(200);
    expect(fibFanEdgePrice(100, 200, 0, 10, 20, 1)).toBe(300);
    expect(fibFanEdgePrice(100, 200, 0, 10, 20, 0.382)).toBeCloseTo(176.4, 10);
  });
  it('零时间跨度（垂直锚线）退化为起点价，不除零', () => {
    expect(fibFanEdgePrice(100, 200, 5, 5, 20, 0.618)).toBe(100);
  });
  it('边缘在锚点左侧（下跌段向左延伸）价差符号延续', () => {
    // p0: t=10 价 200 → p1: t=0 价 100（向左下跌）；0.5 档斜率 = -50/-10 = 5/单位
    // 边缘 t=-10（锚点左 20 单位）：200 + 5 × (-20) = 100
    expect(fibFanEdgePrice(200, 100, 10, 0, -10, 0.5)).toBe(100);
  });
});

// ---------- fibMath：时区数列 ----------

describe('fibZoneOffsets / fibZoneTimes', () => {
  it('数列前 10 项：1,2,3,5,8,13,21,34,55,89', () => {
    expect(fibZoneOffsets(10)).toEqual([1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
  });
  it('count = 0 返回空数组', () => {
    expect(fibZoneOffsets(0)).toEqual([]);
  });
  it('时间点 = 锚点 + 偏移 × bar 间隔', () => {
    const T0 = 1_000_000;
    expect(fibZoneTimes(T0, 60_000, 5)).toEqual([T0 + 60_000, T0 + 120_000, T0 + 180_000, T0 + 300_000, T0 + 480_000]);
  });
  it('FIB_ZONE_COUNT 足够覆盖视口（≥ 20 项）', () => {
    expect(FIB_ZONE_COUNT).toBeGreaterThanOrEqual(20);
    expect(fibZoneOffsets(FIB_ZONE_COUNT)).toHaveLength(FIB_ZONE_COUNT);
  });
});

// ---------- fibMath：弧线角度与命中 ----------

describe('fibArcAngles / fibArcHit', () => {
  it('第 2 锚点在右上（canvas 角）：象限弧从 -π/2 扫到 0', () => {
    const [a0, a1] = fibArcAngles({ x: 0, y: 0 }, { x: 100, y: -80 });
    expect(a0).toBeCloseTo(-Math.PI / 2, 12);
    expect(a1).toBeCloseTo(0, 12);
  });
  it('第 2 锚点在右下：从 0 扫到 π/2', () => {
    const [a0, a1] = fibArcAngles({ x: 0, y: 0 }, { x: 100, y: 80 });
    expect(a0).toBeCloseTo(0, 12);
    expect(a1).toBeCloseTo(Math.PI / 2, 12);
  });
  it('第 2 锚点在左上：从 π 扫到 3π/2', () => {
    const [a0, a1] = fibArcAngles({ x: 0, y: 0 }, { x: -100, y: -80 });
    expect(a0).toBeCloseTo(Math.PI, 12);
    expect(a1).toBeCloseTo((Math.PI * 3) / 2, 12);
  });
  it('第 2 锚点在左下：从 π/2 扫到 π', () => {
    const [a0, a1] = fibArcAngles({ x: 0, y: 0 }, { x: -100, y: 80 });
    expect(a0).toBeCloseTo(Math.PI / 2, 12);
    expect(a1).toBeCloseTo(Math.PI, 12);
  });
  it('弧上点命中、弧外不中、象限背面不中、基线可命中', () => {
    // 圆心（第 1 锚点）在原点，第 2 锚点在右上 → 弧向右上象限张开
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 100, y: -80 };
    // 0.5 弧：rx=50, ry=40；顶点 (0,-40)、右点 (50,0)、弧中点 (35.36,-28.28)
    expect(fibArcHit(p0, p1, 0, -40)).toBe(true);
    expect(fibArcHit(p0, p1, 50, 0)).toBe(true);
    expect(fibArcHit(p0, p1, 35.36, -28.28)).toBe(true);
    // 0.618 弧顶点 (0,-49.44)
    expect(fibArcHit(p0, p1, 0, -49.44)).toBe(true);
    // 象限背面（左上/左下）不中
    expect(fibArcHit(p0, p1, -50, 0)).toBe(false);
    expect(fibArcHit(p0, p1, 0, 50)).toBe(false);
    // 距任一弧 > 6px
    expect(fibArcHit(p0, p1, 0, -60)).toBe(false);
    // 远离
    expect(fibArcHit(p0, p1, 500, 0)).toBe(false);
    // 基线（两锚点连线）可命中，与渲染一致
    expect(fibArcHit(p0, p1, 50, -40)).toBe(true);
  });
});

// ---------- fibMath：Auto Fib 简化算法（可见区间最高/最低点对） ----------

describe('detectVisibleSwing（Auto Fib 简化算法）', () => {
  const T0 = 1_000_000;
  const bar = (time: number, high: number, low: number): Bar => ({
    time,
    open: low,
    high,
    low,
    close: (high + low) / 2,
    volume: 1,
  });

  it('最高点在最低点之前：start = 高点，end = 低点（按时间排序）', () => {
    const bars = [bar(T0, 10, 8), bar(T0 + 1, 12, 9), bar(T0 + 2, 11, 7)];
    const swing = detectVisibleSwing(bars, 0, 2);
    expect(swing).toEqual({ start: { time: T0 + 1, price: 12 }, end: { time: T0 + 2, price: 7 } });
  });

  it('最低点在最高点之前：start = 低点，end = 高点', () => {
    const bars = [bar(T0, 11, 7), bar(T0 + 1, 12, 9), bar(T0 + 2, 10, 8)];
    const swing = detectVisibleSwing(bars, 0, 2);
    expect(swing).toEqual({ start: { time: T0, price: 7 }, end: { time: T0 + 1, price: 12 } });
  });

  it('区间越界时 clamp 到有效范围', () => {
    const bars = [bar(T0, 10, 8), bar(T0 + 1, 12, 9), bar(T0 + 2, 11, 7)];
    expect(detectVisibleSwing(bars, -5, 100)).toEqual({
      start: { time: T0 + 1, price: 12 },
      end: { time: T0 + 2, price: 7 },
    });
  });

  it('from > to（空区间）返回 null', () => {
    const bars = [bar(T0, 10, 8), bar(T0 + 1, 12, 9)];
    expect(detectVisibleSwing(bars, 1, 0)).toBeNull();
  });

  it('不足两根 bar 返回 null', () => {
    expect(detectVisibleSwing([bar(T0, 10, 8)], 0, 0)).toBeNull();
    expect(detectVisibleSwing([], 0, 5)).toBeNull();
  });

  it('最高最低同根（无波动）返回 null', () => {
    const flat = [bar(T0, 5, 5), bar(T0 + 1, 5, 5)];
    expect(detectVisibleSwing(flat, 0, 1)).toBeNull();
  });

  it('最高价并列时取更早的一根（稳定可预期）', () => {
    const bars = [bar(T0, 10, 6), bar(T0 + 1, 10, 9), bar(T0 + 2, 5, 4)];
    expect(detectVisibleSwing(bars, 0, 2)).toEqual({ start: { time: T0, price: 10 }, end: { time: T0 + 2, price: 4 } });
  });
});

// ---------- fibRender：canvas mock 绘制序列 ----------

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

const BARS: Bar[] = [
  { time: T0, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: T0 + IV, open: 104, high: 108, low: 103, close: 101, volume: 900 },
  { time: T0 + 2 * IV, open: 101, high: 105, low: 100, close: 103, volume: 1500 },
  { time: T0 + 3 * IV, open: 103, high: 104, low: 99, close: 100, volume: 700 },
  { time: T0 + 4 * IV, open: 100, high: 107, low: 97, close: 105, volume: 2000 },
  { time: T0 + 5 * IV, open: 105, high: 106, low: 102, close: 102, volume: 800 },
];

const W = 460;
const H = 300;

function makeDctx(): { ctx: MockCtx; dctx: DrawContext; priceScale: PriceScale } {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(97, 108);
  return { ctx: createMockCtx(), dctx: { viewport, priceScale, series, geo: { chartW: W, chartH: H } }, priceScale };
}

function drawing(d: Partial<Drawing> & { type: Drawing['type']; points: DrawingPoint[] }): Drawing {
  return { id: 'd1', locked: false, visible: true, style: { color: '#787b86', lineWidth: 1 }, ...d } as Drawing;
}

/** 锚点世界坐标 → 像素（与 drawOne 内部同规则） */
function toPix(p: DrawingPoint, dctx: DrawContext): { x: number; y: number } {
  return {
    x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)),
    y: dctx.priceScale.priceToY(p.price),
  };
}

describe('fibLevelEndX（回撤/扩展水平线右端：摆幅外再延一个摆幅，最短 24px，不超画布）', () => {
  it('正常摆幅：endX = xLabel + (xLabel - x0)', () => {
    expect(fibLevelEndX(100, 140, 1000)).toBe(180);
    expect(fibLevelEndX(372, 412, 460)).toBe(452); // 摆幅 40 → 末端 452（不到右缘 460）
  });
  it('摆幅下限 24px（锚点几乎重合时）', () => {
    expect(fibLevelEndX(100, 110, 1000)).toBe(134); // 摆幅 10 → 取下限 24
    expect(fibLevelEndX(100, 100, 1000)).toBe(124); // 零摆幅 → 124
  });
  it('chartW 钳制：末端绝不超出画布', () => {
    expect(fibLevelEndX(100, 140, 200)).toBe(180); // 180 < 200 不钳
    expect(fibLevelEndX(100, 300, 200)).toBe(200); // 300 + 200 = 500 → 钳到 200
    expect(fibLevelEndX(400, 500, 460)).toBe(460);
  });
});

describe('drawFibRetracement（回撤水平组）', () => {
  it('7 条水平线 + 7 个「比率% 价格」标签', () => {
    const { ctx, dctx, priceScale } = makeDctx();
    const d = drawing({
      type: 'fib',
      points: [
        { time: T0, price: 100 },
        { time: T0 + 5 * IV, price: 102 },
      ],
    });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawFibRetracement(asCtx(ctx), d, pts, dctx, 2);

    // 每条水平线：beginPath + moveTo + lineTo + stroke
    expect(callsOf(ctx, 'stroke')).toHaveLength(7);
    // 末端 = xLabel(412) + 摆幅(40) = 452（不再到画布右缘 460）
    const endX = fibLevelEndX(pts[0].x, pts[1].x, W);
    expect(endX).toBe(452);
    expect(
      hasPair(ctx, 'moveTo', [pts[0].x, Math.round(priceScale.priceToY(100)) + 0.5], 'lineTo', [
        endX,
        Math.round(priceScale.priceToY(100)) + 0.5,
      ]),
    ).toBe(true);
    expect(fillTexts(ctx)).toEqual([
      '0.0% 100.00',
      '23.6% 100.47',
      '38.2% 100.76',
      '50.0% 101.00',
      '61.8% 101.24',
      '78.6% 101.57',
      '100.0% 102.00',
    ]);
    // 标签溢出画布（452 + 4 + 字宽 > 458）→ 钳到 chartW - 字宽 - 2 并右对齐：
    // mock 字宽 = 字数 × 6；'0.0% 100.00' 11 字 → x = 460 - 66 - 2 = 392
    expect(hasCall(ctx, 'fillText', ['0.0% 100.00', 392, Math.round(priceScale.priceToY(100)) + 0.5])).toBe(true);
    expect(propSets(ctx, 'textAlign').at(-1)).toBe('right');
  });

  it('末端靠近左缘时标签放得下：贴 endX + 4 左对齐', () => {
    const { ctx, dctx, priceScale } = makeDctx();
    const d = drawing({
      type: 'fib',
      points: [
        { time: T0, price: 100 },
        { time: T0 + IV, price: 102 },
      ],
    });
    // 手工指定锚点像素（x 位置才是本用例变量）：x0=100 / xLabel=124 → 摆幅下限 24 → endX=148
    drawFibRetracement(
      asCtx(ctx),
      d,
      [
        { x: 100, y: 0 },
        { x: 124, y: 0 },
      ],
      dctx,
      2,
    );
    const y0 = Math.round(priceScale.priceToY(100)) + 0.5;
    // '0.0% 100.00' 宽 72：148 + 4 + 72 = 224 ≤ 458 → 贴末端左对齐
    expect(hasCall(ctx, 'fillText', ['0.0% 100.00', 152, y0])).toBe(true);
    expect(propSets(ctx, 'textAlign').at(-1)).toBe('left');
  });
});

describe('drawFibExtension（扩展）', () => {
  it('锚点连线 1→2→3 + 9 条以第 3 点为枢轴的扩展线', () => {
    const { ctx, dctx, priceScale } = makeDctx();
    const d = drawing({
      type: 'fib-extension',
      points: [
        { time: T0, price: 100 },
        { time: T0 + 2 * IV, price: 108 },
        { time: T0 + 4 * IV, price: 104 },
      ],
    });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawFibExtension(asCtx(ctx), d, pts, dctx, 2);

    // 2 条锚线 + 9 条水平扩展线 = 11 次 stroke
    expect(callsOf(ctx, 'stroke')).toHaveLength(11);
    // 锚线 1→2
    expect(hasPair(ctx, 'moveTo', [pts[0].x, pts[0].y], 'lineTo', [pts[1].x, pts[1].y])).toBe(true);
    // 锚线 2→3
    expect(hasPair(ctx, 'moveTo', [pts[1].x, pts[1].y], 'lineTo', [pts[2].x, pts[2].y])).toBe(true);
    // 扩展价 = 枢轴 104 + (108-100) × 比率；100% 档 = 112
    // 末端 = xLabel(404) + 摆幅(32) = 436（与回撤同规则）
    const endX = fibLevelEndX(pts[0].x, pts[2].x, W);
    expect(endX).toBe(436);
    expect(
      hasPair(ctx, 'moveTo', [pts[0].x, Math.round(priceScale.priceToY(112)) + 0.5], 'lineTo', [
        endX,
        Math.round(priceScale.priceToY(112)) + 0.5,
      ]),
    ).toBe(true);
    // 标签溢出 → 钳到 460 - 78 - 2 = 380 右对齐（'100.0% 112.00' 13 字 × 6px）
    expect(hasCall(ctx, 'fillText', ['100.0% 112.00', 380, Math.round(priceScale.priceToY(112)) + 0.5])).toBe(true);
    expect(propSets(ctx, 'textAlign').at(-1)).toBe('right');
    expect(fillTexts(ctx)).toEqual([
      '23.6% 105.89',
      '38.2% 107.06',
      '50.0% 108.00',
      '61.8% 108.94',
      '78.6% 110.29',
      '100.0% 112.00',
      '127.2% 114.18',
      '161.8% 116.94',
      '261.8% 124.94',
    ]);
  });

  it('放置中仅 2 点（预览态）：只画锚线，不画扩展线', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'fib-extension',
      points: [
        { time: T0, price: 100 },
        { time: T0 + 2 * IV, price: 108 },
      ],
    });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawFibExtension(asCtx(ctx), d, pts, dctx, 2);
    expect(callsOf(ctx, 'stroke')).toHaveLength(1);
  });
});

describe('drawFibFan（扇形）', () => {
  it('3 条射线从起点射向画布右缘 + 末端比率标签', () => {
    const { ctx, dctx, priceScale } = makeDctx();
    const p0 = { time: T0 + 2 * IV, price: 100 };
    const p1 = { time: T0 + 4 * IV, price: 108 }; // 差 8（二进制精确），跨度 2IV
    const d = drawing({ type: 'fib-fan', points: [p0, p1] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawFibFan(asCtx(ctx), d, pts, dctx);

    expect(callsOf(ctx, 'stroke')).toHaveLength(3);
    // 边缘时间：x=460 → idx 11 → T0+11IV；边缘跨度/锚跨度 = 4.5
    // 0.5 档边缘价 = 100 + 8 × 0.5 × 4.5 = 118（二进制精确）
    const end = fanRayEndPix(p0, p1, 0.5, dctx);
    expect(end.x).toBe(W);
    expect(end.y).toBe(priceScale.priceToY(118));
    expect(hasPair(ctx, 'moveTo', [pts[0].x, pts[0].y], 'lineTo', [W, priceScale.priceToY(118)])).toBe(true);
    expect(fillTexts(ctx)).toEqual(['38.2%', '50.0%', '61.8%']);
  });
});

describe('drawFibArc（弧线）', () => {
  it('基线 + 3 条以第 1 锚点为圆心、比率 × (时间跨度, 价格跨度) 为双轴半径的椭圆象限弧', () => {
    const { ctx, dctx } = makeDctx();
    const p0 = { time: T0 + IV, price: 100 };
    const p1 = { time: T0 + 3 * IV, price: 104 };
    const a = toPix(p0, dctx);
    const b = toPix(p1, dctx);
    drawFibArc(asCtx(ctx), [a, b]);

    // 基线 1 次 + 弧 3 次
    expect(callsOf(ctx, 'stroke')).toHaveLength(4);
    expect(hasPair(ctx, 'moveTo', [a.x, a.y], 'lineTo', [b.x, b.y])).toBe(true);
    const rx = Math.abs(b.x - a.x);
    const ry = Math.abs(b.y - a.y);
    const [a0, a1] = fibArcAngles(a, b);
    // 圆心 = 第 1 锚点；半径 = 比率 × (时间跨度, 价格跨度)；右上象限 [-π/2, 0]
    expect(hasCall(ctx, 'ellipse', [a.x, a.y, rx * 0.5, ry * 0.5, 0, a0, a1])).toBe(true);
    expect(callsOf(ctx, 'ellipse')).toHaveLength(3);
    expect(fillTexts(ctx)).toEqual(['38.2%', '50.0%', '61.8%']);
  });
});

describe('drawFibTimezone（时区）', () => {
  it('沿 fib 数列间隔的垂直线，视口外不渲染', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({ type: 'fib-timezone', points: [{ time: T0, price: 100 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    drawFibTimezone(asCtx(ctx), d, pts, dctx);

    // first ≈ -46.5，spacing 8：偏移 1/2/3/5/8 → x = 380.5/388.5/396.5/412.5/436.5；偏移 ≥13 超出 460
    expect(callsOf(ctx, 'stroke')).toHaveLength(5);
    expect(hasPair(ctx, 'moveTo', [380.5, 0], 'lineTo', [380.5, H])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [436.5, 0], 'lineTo', [436.5, H])).toBe(true);
    expect(hasCall(ctx, 'moveTo', [476.5, 0])).toBe(false); // 偏移 13 在视口外
  });
});

// ---------- fibRender：命中测试 ----------

describe('hitTestFib', () => {
  it('fib：锚线、水平比率线命中，远处不中', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({
      type: 'fib',
      points: [
        { time: T0, price: 100 },
        { time: T0 + 5 * IV, price: 102 },
      ],
    });
    const pts = d.points.map((p) => toPix(p, dctx));
    // 锚线中点
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    expect(hitTestFib(d, pts, mid.x, mid.y, dctx)).toBe(true);
    // 0% 水平线（price 100）上、锚点右侧
    expect(hitTestFib(d, pts, pts[0].x + 20, priceScale.priceToY(100), dctx)).toBe(true);
    // 末端 452 之外不再命中（与渲染线组一一对应）
    expect(hitTestFib(d, pts, W, priceScale.priceToY(100), dctx)).toBe(false);
    // 空白处
    expect(hitTestFib(d, pts, 50, 50, dctx)).toBe(false);
  });

  it('fib-extension：锚线段与扩展线命中', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing({
      type: 'fib-extension',
      points: [
        { time: T0, price: 100 },
        { time: T0 + 2 * IV, price: 108 },
        { time: T0 + 4 * IV, price: 104 },
      ],
    });
    const pts = d.points.map((p) => toPix(p, dctx));
    const mid = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
    expect(hitTestFib(d, pts, mid.x, mid.y, dctx)).toBe(true);
    expect(hitTestFib(d, pts, pts[0].x + 30, priceScale.priceToY(112), dctx)).toBe(true); // 100% 扩展线
    expect(hitTestFib(d, pts, W, priceScale.priceToY(112), dctx)).toBe(false); // 末端 436 之外
    expect(hitTestFib(d, pts, 50, 50, dctx)).toBe(false);
  });

  it('fib-fan：射线路径上命中', () => {
    const { dctx } = makeDctx();
    const p0 = { time: T0 + 2 * IV, price: 100 };
    const p1 = { time: T0 + 4 * IV, price: 108 };
    const d = drawing({ type: 'fib-fan', points: [p0, p1] });
    const pts = d.points.map((p) => toPix(p, dctx));
    const end = fanRayEndPix(p0, p1, 0.5, dctx);
    const mid = { x: (pts[0].x + end.x) / 2, y: (pts[0].y + end.y) / 2 };
    expect(hitTestFib(d, pts, mid.x, mid.y, dctx)).toBe(true);
    expect(hitTestFib(d, pts, 50, 10, dctx)).toBe(false);
  });

  it('fib-arc：0.5 弧上命中，弧外不中', () => {
    const { dctx } = makeDctx();
    const p0 = { time: T0 + IV, price: 100 };
    const p1 = { time: T0 + 3 * IV, price: 104 };
    const d = drawing({ type: 'fib-arc', points: [p0, p1] });
    const a = toPix(p0, dctx);
    const b = toPix(p1, dctx);
    const rx = Math.abs(b.x - a.x);
    const ry = Math.abs(b.y - a.y);
    const [a0, a1] = fibArcAngles(a, b);
    const mid = (a0 + a1) / 2;
    // 0.5 弧中点（圆心 = 第 1 锚点 + 双轴半径 × 方向）
    expect(hitTestFib(d, [a, b], a.x + rx * 0.5 * Math.cos(mid), a.y + ry * 0.5 * Math.sin(mid), dctx)).toBe(true);
    // 基线中点可命中
    expect(hitTestFib(d, [a, b], (a.x + b.x) / 2, (a.y + b.y) / 2, dctx)).toBe(true);
    expect(hitTestFib(d, [a, b], 50, 10, dctx)).toBe(false);
  });

  it('fib-timezone：垂线 ±5px 命中，间隔中央不中', () => {
    const { dctx } = makeDctx();
    const d = drawing({ type: 'fib-timezone', points: [{ time: T0, price: 100 }] });
    const pts = d.points.map((p) => toPix(p, dctx));
    expect(hitTestFib(d, pts, 380.5, 150, dctx)).toBe(true); // 偏移 1 的线
    expect(hitTestFib(d, pts, 370, 150, dctx)).toBe(false); // 锚点与首线之间
  });

  it('非 fib 类型返回 false', () => {
    const { dctx } = makeDctx();
    const d = drawing({
      type: 'rect',
      points: [
        { time: T0, price: 100 },
        { time: T0 + 2 * IV, price: 108 },
      ],
    });
    const pts = d.points.map((p) => toPix(p, dctx));
    expect(hitTestFib(d, pts, 200, 150, dctx)).toBe(false);
  });
});
