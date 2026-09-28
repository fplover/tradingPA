import { describe, expect, it } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import type { Bar } from '@/types/market';
import {
  drawDrawings,
  hitTestDrawing,
  pointToPixel,
  FIB_RETRACEMENT_LEVELS,
  FIB_EXTENSION_LEVELS,
  FIB_FAN_LEVELS,
  FIB_ARC_LEVELS,
  fibZoneOffsets,
  fibZoneTimes,
  fibExtensionPrice,
  fibFanEdgePrice,
  detectVisibleSwing,
  type DrawContext,
} from '@/engine/drawing/drawDrawings';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import type { Drawing, DrawingPoint, DrawingTypeId } from '@/engine/drawing/types';
import { serializeDrawings, deserializeDrawings, getToolDef, DRAWING_TOOLS } from '@/engine/drawing/types';
import { createMockCtx, asCtx, callsOf, hasPair } from './helpers/mock-ctx';

// ---------- 固定夹具（坐标可手算，无随机） ----------

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

function fixture(bars: Bar[] = BARS, spacing = 8) {
  const series = new BarSeries();
  series.replace(bars);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(spacing);
  viewport.scrollToRealtime(); // first = 6 - 57.5 + 5 = -46.5（精确值）
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  const low = Math.min(...bars.map((b) => b.low));
  const high = Math.max(...bars.map((b) => b.high));
  priceScale.autoScale(low, high);
  const geo = { chartW: W, chartH: H };
  const ctx = createMockCtx();
  return { ctx, series, viewport, priceScale, geo };
}

function dc(series: BarSeries, viewport: Viewport, priceScale: PriceScale, geo: { chartW: number; chartH: number }): DrawContext {
  return { viewport, priceScale, series, geo };
}

function mk(type: DrawingTypeId, points: DrawingPoint[], style?: Partial<Drawing['style']>): Drawing {
  return {
    id: 'd1',
    type,
    points,
    style: { color: '#787b86', lineWidth: 1, ...style },
    locked: false,
    visible: true,
  };
}

// ---------- 比率常量 ----------

describe('斐波那契比率常量', () => {
  it('回撤 7 档不变（回归保护）', () => {
    expect([...FIB_RETRACEMENT_LEVELS]).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
  });

  it('扩展 9 档升序（TV 默认）', () => {
    expect([...FIB_EXTENSION_LEVELS]).toEqual([0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618]);
    for (let i = 1; i < FIB_EXTENSION_LEVELS.length; i++) {
      expect(FIB_EXTENSION_LEVELS[i]).toBeGreaterThan(FIB_EXTENSION_LEVELS[i - 1]);
    }
  });

  it('扇形/弧线各 3 档（0.382/0.5/0.618）', () => {
    expect([...FIB_FAN_LEVELS]).toEqual([0.382, 0.5, 0.618]);
    expect([...FIB_ARC_LEVELS]).toEqual([0.382, 0.5, 0.618]);
  });
});

// ---------- 纯函数：时区数列 ----------

describe('fibZoneOffsets / fibZoneTimes', () => {
  it('数列为 1,2,3,5,8,13,21,34,55…', () => {
    expect(fibZoneOffsets(9)).toEqual([1, 2, 3, 5, 8, 13, 21, 34, 55]);
    expect(fibZoneOffsets(0)).toEqual([]);
  });

  it('时间点 = anchor + 数列 × bar 间隔', () => {
    const times = fibZoneTimes(1000, IV, 4);
    expect(times).toEqual([1000 + IV, 1000 + 2 * IV, 1000 + 3 * IV, 1000 + 5 * IV]);
  });
});

// ---------- 纯函数：扩展价格（符号规则） ----------

describe('fibExtensionPrice', () => {
  it('向上趋势：比率线在枢轴上方', () => {
    // 起点 100 → 终点 110，枢轴 105
    expect(fibExtensionPrice(100, 110, 105, 0)).toBe(105);
    expect(fibExtensionPrice(100, 110, 105, 0.236)).toBeCloseTo(107.36, 10);
    expect(fibExtensionPrice(100, 110, 105, 0.382)).toBeCloseTo(108.82, 10);
    expect(fibExtensionPrice(100, 110, 105, 0.5)).toBe(110);
    expect(fibExtensionPrice(100, 110, 105, 0.786)).toBeCloseTo(112.86, 10);
    expect(fibExtensionPrice(100, 110, 105, 1.272)).toBeCloseTo(117.72, 10);
    expect(fibExtensionPrice(100, 110, 105, 1.618)).toBeCloseTo(121.18, 10);
    expect(fibExtensionPrice(100, 110, 105, 2.618)).toBeCloseTo(131.18, 10);
  });

  it('向下趋势：符号反转，比率线在枢轴下方', () => {
    // 起点 110 → 终点 100（跌 10），枢轴 105
    expect(fibExtensionPrice(110, 100, 105, 0.236)).toBeCloseTo(102.64, 10);
    expect(fibExtensionPrice(110, 100, 105, 0.5)).toBe(100);
    expect(fibExtensionPrice(110, 100, 105, 1.618)).toBeCloseTo(88.82, 10);
    expect(fibExtensionPrice(110, 100, 105, 2.618)).toBeCloseTo(78.82, 10);
  });

  it('比率线关于枢轴对称：向上 1.618 与向下 1.618 距枢轴等距', () => {
    const up = fibExtensionPrice(100, 110, 105, 1.618) - 105;
    const down = 105 - fibExtensionPrice(110, 100, 105, 1.618);
    expect(up).toBeCloseTo(down, 12);
  });
});

// ---------- 纯函数：扇形射线边缘价格 ----------

describe('fibFanEdgePrice', () => {
  it('斜率 = 价格差 × 比率 / 时间差，边缘时刻线性求值', () => {
    // 起点 (t=0, p=100) → 终点 (t=10, p=110)，边缘 t=20：0.5 比率 → 100 + 10×0.5×2 = 110
    expect(fibFanEdgePrice(100, 110, 0, 10, 20, 0.5)).toBeCloseTo(110, 12);
    // 0.382 → 100 + 10×0.382×2 = 107.64
    expect(fibFanEdgePrice(100, 110, 0, 10, 20, 0.382)).toBeCloseTo(107.64, 12);
    // 比率 0 → 起点价
    expect(fibFanEdgePrice(100, 110, 0, 10, 20, 0)).toBeCloseTo(100, 12);
    // 边缘即起点 → 起点价
    expect(fibFanEdgePrice(100, 110, 0, 10, 0, 0.618)).toBeCloseTo(100, 12);
  });

  it('时间跨度退化为起点价（防除零）', () => {
    expect(fibFanEdgePrice(100, 110, 5, 5, 20, 0.618)).toBe(100);
  });

  it('向下趋势斜率为负', () => {
    // 110 → 100，边缘放大 2 倍时间：0.5 比率 → 110 - 5×2 = 100
    expect(fibFanEdgePrice(110, 100, 0, 10, 20, 0.5)).toBeCloseTo(100, 12);
  });
});

// ---------- 纯函数：Auto Fib swing 检测 ----------

describe('detectVisibleSwing', () => {
  const uptrend: Bar[] = [
    { time: T0, open: 100, high: 102, low: 98, close: 101, volume: 1 },
    { time: T0 + IV, open: 101, high: 104, low: 100, close: 103, volume: 1 },
    { time: T0 + 2 * IV, open: 103, high: 110, low: 102, close: 109, volume: 1 },
  ];
  const downtrend: Bar[] = [
    { time: T0, open: 109, high: 110, low: 107, close: 108, volume: 1 },
    { time: T0 + IV, open: 108, high: 109, low: 104, close: 105, volume: 1 },
    { time: T0 + 2 * IV, open: 105, high: 106, low: 98, close: 99, volume: 1 },
  ];

  it('上升趋势：start = 较低的低点，end = 较高的高点（与手放置方向一致）', () => {
    const swing = detectVisibleSwing(uptrend, 0, 2)!;
    expect(swing).not.toBeNull();
    expect(swing.start).toEqual({ time: T0, price: 98 });
    expect(swing.end).toEqual({ time: T0 + 2 * IV, price: 110 });
  });

  it('下降趋势：start = 较高的高点，end = 较低的低点', () => {
    const swing = detectVisibleSwing(downtrend, 0, 2)!;
    expect(swing.start).toEqual({ time: T0, price: 110 });
    expect(swing.end).toEqual({ time: T0 + 2 * IV, price: 98 });
  });

  it('区间越界自动钳制', () => {
    const swing = detectVisibleSwing(uptrend, -10, 999)!;
    expect(swing.start).toEqual({ time: T0, price: 98 });
    expect(swing.end).toEqual({ time: T0 + 2 * IV, price: 110 });
  });

  it('可见 bar 不足两根 → null（不放置）', () => {
    expect(detectVisibleSwing(uptrend, 1, 1)).toBeNull();
    expect(detectVisibleSwing(uptrend, 2, 1)).toBeNull();
    expect(detectVisibleSwing([], 0, 5)).toBeNull();
  });

  it('全程无波动（最高最低同根）→ null', () => {
    const flat: Bar[] = [
      { time: T0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { time: T0 + IV, open: 100, high: 100, low: 100, close: 100, volume: 1 },
    ];
    expect(detectVisibleSwing(flat, 0, 1)).toBeNull();
  });

  it('并列极值取最早一根（严格大于才更新）', () => {
    const tied: Bar[] = [
      { time: T0, open: 100, high: 110, low: 90, close: 100, volume: 1 },
      { time: T0 + IV, open: 100, high: 110, low: 90, close: 100, volume: 1 },
    ];
    const swing = detectVisibleSwing(tied, 0, 1)!;
    expect(swing).not.toBeNull();
    // 两根 bar 极值完全相同：最高最低都落在最早一根上，仍构成有效 swing 对
    expect(swing.start).toEqual({ time: T0, price: 110 });
    expect(swing.end).toEqual({ time: T0, price: 90 });
  });
});

// ---------- 工具注册表 ----------

describe('DRAWING_TOOLS 注册表（B6 新增 5 工具）', () => {
  it('总数 17，既有 12 工具不动', () => {
    expect(DRAWING_TOOLS).toHaveLength(17);
    expect(DRAWING_TOOLS.slice(0, 12).map((t) => t.id)).toEqual([
      'trendline', 'ray', 'hline', 'vline', 'arrow', 'info-line', 'channel',
      'rect', 'ellipse', 'path', 'text', 'fib',
    ]);
  });

  it('锚点数符合 TV 规则', () => {
    expect(getToolDef('fib-extension').points).toBe(3); // 起点/终点/枢轴
    expect(getToolDef('fib-fan').points).toBe(2);
    expect(getToolDef('fib-arc').points).toBe(2);
    expect(getToolDef('fib-timezone').points).toBe(1);
    expect(getToolDef('fib-auto').points).toBe(0); // 无锚点，放置即生成
  });

  it('中文 label 与 fib 同源默认样式', () => {
    const fibStyle = getToolDef('fib').defaultStyle;
    for (const id of ['fib-extension', 'fib-fan', 'fib-arc', 'fib-timezone', 'fib-auto'] as const) {
      const def = getToolDef(id);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.defaultStyle).toEqual(fibStyle);
    }
    expect(getToolDef('fib-extension').label).toBe('斐波那契扩展');
    expect(getToolDef('fib-fan').label).toBe('斐波那契扇形');
    expect(getToolDef('fib-arc').label).toBe('斐波那契弧线');
    expect(getToolDef('fib-timezone').label).toBe('斐波那契时区');
  });
});

// ---------- 序列化兼容 ----------

describe('新类型序列化兼容', () => {
  it('5 种新类型 JSON 往返不丢', () => {
    const layer = new DrawingLayer();
    layer.add('fib-extension', [
      { time: T0, price: 100 },
      { time: T0 + IV, price: 110 },
      { time: T0 + 2 * IV, price: 105 },
    ]);
    layer.add('fib-fan', [
      { time: T0, price: 100 },
      { time: T0 + IV, price: 110 },
    ]);
    layer.add('fib-arc', [
      { time: T0, price: 100 },
      { time: T0 + IV, price: 110 },
    ]);
    layer.add('fib-timezone', [{ time: T0, price: 100 }]);
    layer.add('fib-auto', [
      { time: T0, price: 98 },
      { time: T0 + 2 * IV, price: 110 },
    ]);
    const raw = serializeDrawings(layer.list());
    const restored = deserializeDrawings(raw);
    expect(restored.map((d) => d.type)).toEqual(['fib-extension', 'fib-fan', 'fib-arc', 'fib-timezone', 'fib-auto']);
    expect(restored[0].points).toHaveLength(3);
    expect(restored[4].points).toHaveLength(2);
  });

  it('坏数据丢弃路径不受影响', () => {
    const raw = JSON.stringify([
      { id: 'a', type: 'fib-extension', points: [{ time: 1, price: 2 }, { time: 2, price: 3 }, { time: 3, price: 4 }] },
      { foo: 1 },
      { id: 'b', type: 'fib-auto', points: 'not-array' },
    ]);
    const restored = deserializeDrawings(raw);
    expect(restored).toHaveLength(1);
    expect(restored[0].type).toBe('fib-extension');
  });
});

// ---------- 渲染几何自验（mock ctx 推演） ----------

describe('渲染：斐波那契扩展', () => {
  it('锚点连线 + 9 档水平线，价格 = 枢轴 + (终点-起点)×比率', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-extension', [
      { time: BARS[0].time, price: 100 },
      { time: BARS[3].time, price: 110 },
      { time: BARS[5].time, price: 105 }, // 枢轴
    ]);
    drawDrawings(asCtx(ctx), [d], null, dc(series, viewport, priceScale, geo), 2);

    // 锚点像素：indexToX(0)=372, indexToX(3)=396, indexToX(5)=412
    const x0 = viewport.indexToX(0);
    const x3 = viewport.indexToX(3);
    const x5 = viewport.indexToX(5);
    expect(hasPair(ctx, 'moveTo', [x0, priceScale.priceToY(100)], 'lineTo', [x3, priceScale.priceToY(110)])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [x3, priceScale.priceToY(110)], 'lineTo', [x5, priceScale.priceToY(105)])).toBe(true);

    // 9 档水平线：从最左锚轴到右缘；抽验 0.236 / 1.0 / 1.618 / 2.618
    const y0236 = Math.round(priceScale.priceToY(fibExtensionPrice(100, 110, 105, 0.236))) + 0.5;
    const y100 = Math.round(priceScale.priceToY(fibExtensionPrice(100, 110, 105, 1))) + 0.5;
    const y1618 = Math.round(priceScale.priceToY(fibExtensionPrice(100, 110, 105, 1.618))) + 0.5;
    const y2618 = Math.round(priceScale.priceToY(fibExtensionPrice(100, 110, 105, 2.618))) + 0.5;
    expect(hasPair(ctx, 'moveTo', [x0, y0236], 'lineTo', [W, y0236])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [x0, y100], 'lineTo', [W, y100])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [x0, y1618], 'lineTo', [W, y1618])).toBe(true);
    expect(hasPair(ctx, 'moveTo', [x0, y2618], 'lineTo', [W, y2618])).toBe(true);

    // 标签：'23.6% 107.36' / '100.0% 115.00' / '161.8% 121.18' / '261.8% 131.18'
    const texts = callsOf(ctx, 'fillText').map((a) => String(a[0]));
    expect(texts).toContain('23.6% 107.36');
    expect(texts).toContain('100.0% 115.00');
    expect(texts).toContain('161.8% 121.18');
    expect(texts).toContain('261.8% 131.18');
  });
});

describe('渲染：斐波那契扇形', () => {
  it('从起点发出 3 条射线到画布边缘，斜率 = 价格差×比率/时间差', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-fan', [
      { time: BARS[0].time, price: 100 },
      { time: BARS[3].time, price: 110 },
    ]);
    drawDrawings(asCtx(ctx), [d], null, dc(series, viewport, priceScale, geo), 2);

    // 起点 index0 → x=372；边缘 x=460 对应 idx=11 → 时间 T0+11IV
    const ax = viewport.indexToX(0);
    const ay = priceScale.priceToY(100);
    const edgeTime = T0 + 11 * IV;
    for (const lv of FIB_FAN_LEVELS) {
      const ey = priceScale.priceToY(fibFanEdgePrice(100, 110, T0, T0 + 3 * IV, edgeTime, lv));
      expect(hasPair(ctx, 'moveTo', [ax, ay], 'lineTo', [W, ey])).toBe(true);
    }
    // 3 条射线 = 3 次 moveTo，且 0.5 档边缘价高于 0.382 档（向上扇形张开）
    expect(callsOf(ctx, 'moveTo')).toHaveLength(3);
    const texts = callsOf(ctx, 'fillText').map((a) => String(a[0]));
    expect(texts).toEqual(expect.arrayContaining(['38.2%', '50.0%', '61.8%']));
  });
});

describe('渲染：斐波那契弧线', () => {
  it('以第 1 锚点为圆心，x 半径 = 时间跨度×比率，y 半径 = 价格跨度×比率', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-arc', [
      { time: BARS[0].time, price: 100 },
      { time: BARS[3].time, price: 110 }, // 价格上升 → 弧向右上扫掠
    ]);
    drawDrawings(asCtx(ctx), [d], null, dc(series, viewport, priceScale, geo), 2);

    const c = dc(series, viewport, priceScale, geo);
    const a = pointToPixel(d.points[0], c);
    const b = pointToPixel(d.points[1], c);
    const rx = Math.abs(b.x - a.x);
    const ry = Math.abs(b.y - a.y);
    // 基线 + 3 段椭圆弧
    expect(hasPair(ctx, 'moveTo', [a.x, a.y], 'lineTo', [b.x, b.y])).toBe(true);
    const ellipses = callsOf(ctx, 'ellipse');
    expect(ellipses).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const lv = FIB_ARC_LEVELS[i];
      // 圆心 = 第 1 锚点；半径 = 比率 × (时间跨度, 价格跨度)；右上象限 [-π/2, 0]
      expect(ellipses[i]).toEqual([a.x, a.y, rx * lv, ry * lv, 0, -Math.PI / 2, 0]);
    }
  });

  it('下降趋势弧向右下扫掠（起始角 0 → PI/2）', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-arc', [
      { time: BARS[0].time, price: 110 },
      { time: BARS[3].time, price: 100 },
    ]);
    drawDrawings(asCtx(ctx), [d], null, dc(series, viewport, priceScale, geo), 2);
    const ellipses = callsOf(ctx, 'ellipse');
    expect(ellipses).toHaveLength(3);
    expect(ellipses[1]?.[5]).toBe(0);
    expect(ellipses[1]?.[6]).toBe(Math.PI / 2);
  });
});

describe('渲染：斐波那契时区', () => {
  it('anchor 起按数列竖线，视口外跳过', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-timezone', [{ time: BARS[0].time, price: 100 }]);
    drawDrawings(asCtx(ctx), [d], null, dc(series, viewport, priceScale, geo), 2);

    // anchor = index0（x=372）；数列 1,2,3,5,8 → x = 8n+372.5；13 → 476.5 已出界
    for (const n of [1, 2, 3, 5, 8]) {
      const x = Math.round(viewport.indexToX(n)) + 0.5;
      expect(hasPair(ctx, 'moveTo', [x, 0], 'lineTo', [x, H])).toBe(true);
    }
    expect(callsOf(ctx, 'moveTo')).toHaveLength(5); // 仅 5 根在视口内
    const x13 = Math.round(viewport.indexToX(13)) + 0.5;
    expect(hasPair(ctx, 'moveTo', [x13, 0], 'lineTo', [x13, H])).toBe(false);
  });
});

describe('渲染：Auto Fib 与手放置回撤一致', () => {
  it('swing 对生成的对象渲染 7 档回撤标签', () => {
    const { ctx, series, viewport, priceScale, geo } = fixture();
    // BARS 夹具：最高 high = 108@idx1，最低 low = 97@idx4 → 下降 swing
    const swing = detectVisibleSwing(BARS, 0, 5)!;
    expect(swing).toEqual({ start: { time: T0 + IV, price: 108 }, end: { time: T0 + 4 * IV, price: 97 } });
    const d = mk('fib-auto', [swing.start, swing.end]);
    drawDrawings(asCtx(ctx), [d], null, dc(series, viewport, priceScale, geo), 2);
    const texts = callsOf(ctx, 'fillText').map((a) => String(a[0]));
    // 0% = 108.00，100% = 97.00（start→end），61.8% = 108 - 11×0.618 = 101.202
    expect(texts).toContain('0.0% 108.00');
    expect(texts).toContain('100.0% 97.00');
    expect(texts).toContain('61.8% 101.20');
  });
});

// ---------- 命中测试 ----------

describe('命中测试：斐波那契家族', () => {
  it('扩展：比率线命中 body，空白处 null', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-extension', [
      { time: BARS[0].time, price: 100 },
      { time: BARS[3].time, price: 110 },
      { time: BARS[5].time, price: 105 },
    ]);
    const c = dc(series, viewport, priceScale, geo);
    const ly = priceScale.priceToY(fibExtensionPrice(100, 110, 105, 1.0)); // 115
    expect(hitTestDrawing(d, viewport.indexToX(2), ly, c)).toEqual({ part: 'body' });
    expect(hitTestDrawing(d, viewport.indexToX(2), ly + 10, c)).toBeNull();
    // 手柄优先
    const h = pointToPixel(d.points[2], c);
    expect(hitTestDrawing(d, h.x + 3, h.y + 3, c)).toEqual({ part: 'handle', index: 2 });
  });

  it('扇形：射线命中 body', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-fan', [
      { time: BARS[0].time, price: 100 },
      { time: BARS[3].time, price: 110 },
    ]);
    const c = dc(series, viewport, priceScale, geo);
    // 0.618 射线中点：x = (372+460)/2，y 为两端点 y 的线性插值
    const ax = viewport.indexToX(0);
    const ay = priceScale.priceToY(100);
    const ey = priceScale.priceToY(fibFanEdgePrice(100, 110, T0, T0 + 3 * IV, T0 + 11 * IV, 0.618));
    expect(hitTestDrawing(d, (ax + W) / 2, (ay + ey) / 2, c)).toEqual({ part: 'body' });
    expect(hitTestDrawing(d, 10, 10, c)).toBeNull();
  });

  it('弧线：弧上命中 body，象限背面 null', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-arc', [
      { time: BARS[0].time, price: 100 },
      { time: BARS[3].time, price: 110 },
    ]);
    const c = dc(series, viewport, priceScale, geo);
    const a = pointToPixel(d.points[0], c);
    const b = pointToPixel(d.points[1], c);
    const rx = Math.abs(b.x - a.x);
    const ry = Math.abs(b.y - a.y);
    // 0.5 弧中点（圆心 = 第 1 锚点 + 双轴半径 × 方向，右上象限）
    const mid = -Math.PI / 4;
    expect(hitTestDrawing(d, a.x + rx * 0.5 * Math.cos(mid), a.y + ry * 0.5 * Math.sin(mid), c)).toEqual({ part: 'body' });
    // 象限背面（左上）距任一弧 > 6px → null
    expect(hitTestDrawing(d, a.x - 20, a.y - 20, c)).toBeNull();
  });

  it('时区：竖线 ±5px 命中', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const d = mk('fib-timezone', [{ time: BARS[0].time, price: 100 }]);
    const c = dc(series, viewport, priceScale, geo);
    const x1 = viewport.indexToX(1); // 数列第 1 根
    expect(hitTestDrawing(d, x1, 150, c)).toEqual({ part: 'body' });
    // 数列第 3 根（x=396.5）与第 5 根（x=412.5）之间空档 16px，中点距各 8px → 不命中
    const xGap = (viewport.indexToX(3) + viewport.indexToX(5)) / 2;
    expect(hitTestDrawing(d, xGap, 150, c)).toBeNull();
  });

  it('Auto Fib：比率线与手柄均可命中', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const swing = detectVisibleSwing(BARS, 0, 5)!;
    const d = mk('fib-auto', [swing.start, swing.end]);
    const c = dc(series, viewport, priceScale, geo);
    const ly = priceScale.priceToY(swing.start.price + (swing.end.price - swing.start.price) * 0.5); // 102.5
    expect(hitTestDrawing(d, viewport.indexToX(3), ly, c)).toEqual({ part: 'body' });
    const h = pointToPixel(d.points[0], c);
    expect(hitTestDrawing(d, h.x + 2, h.y + 2, c)).toEqual({ part: 'handle', index: 0 });
  });

  it('回归：手放置 fib 的锚点连线仍可命中', () => {
    const { series, viewport, priceScale, geo } = fixture();
    const d = mk('fib', [
      { time: BARS[0].time, price: 100 },
      { time: BARS[3].time, price: 110 },
    ]);
    const c = dc(series, viewport, priceScale, geo);
    const a = pointToPixel(d.points[0], c);
    const b = pointToPixel(d.points[1], c);
    expect(hitTestDrawing(d, (a.x + b.x) / 2, (a.y + b.y) / 2, c)).toEqual({ part: 'body' });
  });
});
