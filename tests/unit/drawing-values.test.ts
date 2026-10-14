import { describe, expect, it } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { drawingReadingsAt } from '@/engine/drawing/drawingValues';
import type { DrawContext } from '@/engine/drawing/coords';
import {
  FIB_EXTENSION_LEVELS,
  FIB_FAN_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  fibExtensionPrice,
  fibLevelEndX,
  fibRetracementPrice,
} from '@/engine/drawing/fibMath';
import { PERCENT_LEVELS, percentPrice } from '@/engine/drawing/percentMath';
import { FIB_CHANNEL_LEVELS } from '@/engine/drawing/fibTailMath';
import { DRAWING_TOOLS } from '@/engine/drawing/types';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { Bar } from '@/types/market';

/**
 * 画线读数（三期-C2 数据窗口）单测：锁定 2026-10-14 用户裁决「甲档出数，其余一律 —」，
 * 以及两条承重口径——① 线段族走「像素插值 → yToPrice」（对数轴下也等于屏幕上那条线的高度）；
 * ② 有效 x 区间与渲染层逐字同源（ray 延到右缘、水平档组延到 fibLevelEndX、price-note 只在锚右）。
 * 几何构造复用 drawing-percent.test.ts 的 makeDctx（线性 PriceScale，段中点可手算 golden）。
 */

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

function makeDctx(logMode = false): { dctx: DrawContext; priceScale: PriceScale } {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  if (logMode) priceScale.setLogMode(true);
  priceScale.autoScale(97, 108);
  return { dctx: { viewport, priceScale, series, geo: { chartW: W, chartH: H } }, priceScale };
}

const P = (time: number, price: number): DrawingPoint => ({ time, price });

function drawing(type: Drawing['type'], points: DrawingPoint[], levels?: number[]): Drawing {
  return {
    id: 'd1',
    type,
    points,
    locked: false,
    visible: true,
    style: { color: '#2962ff', lineWidth: 1 },
    ...(levels ? { levels } : {}),
  } as Drawing;
}

/** 世界锚点 → 像素（与 pointToPixel 同式，供区间/中点手算） */
function pix(p: DrawingPoint, dctx: DrawContext): { x: number; y: number } {
  return { x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)), y: dctx.priceScale.priceToY(p.price) };
}

describe('hline：恒为锚价，与光标 x 无关', () => {
  it('任意 x 都返回 [{label:"",value:锚价}]（含两端之外）', () => {
    const { dctx } = makeDctx();
    const d = drawing('hline', [P(T0, 100)]);
    expect(drawingReadingsAt(d, 0, dctx)).toEqual([{ label: '', value: 100 }]);
    expect(drawingReadingsAt(d, W, dctx)).toEqual([{ label: '', value: 100 }]);
  });
});

describe('price-note：锚右出数、锚左空（虚线只向右延伸到右缘）', () => {
  it('x≥锚点像素 → 锚价；x<锚点 → 空', () => {
    const { dctx } = makeDctx();
    const d = drawing('price-note', [P(T0 + 2 * IV, 104)]);
    const ax = pix(d.points[0], dctx).x;
    expect(drawingReadingsAt(d, ax, dctx)).toEqual([{ label: '', value: 104 }]);
    expect(drawingReadingsAt(d, ax + 50, dctx)).toEqual([{ label: '', value: 104 }]);
    expect(drawingReadingsAt(d, ax - 1, dctx)).toEqual([]);
  });
});

describe('trendline / arrow / info-line / measure：两点线段插值 + 端点外空', () => {
  for (const type of ['trendline', 'arrow', 'info-line', 'measure'] as const) {
    it(`${type}：中点 = 两端均值（线性域手算）、左外/右外空、单点空`, () => {
      const { dctx } = makeDctx();
      const d = drawing(type, [P(T0, 98), P(T0 + 2 * IV, 106)]);
      const a = pix(d.points[0], dctx);
      const b = pix(d.points[1], dctx);
      expect(drawingReadingsAt(d, (a.x + b.x) / 2, dctx)).toEqual([{ label: '', value: 102 }]);
      expect(drawingReadingsAt(d, a.x - 1, dctx)).toEqual([]);
      expect(drawingReadingsAt(d, b.x + 1, dctx)).toEqual([]);
      expect(drawingReadingsAt(drawing(type, [P(T0, 98)]), (a.x + b.x) / 2, dctx)).toEqual([]);
    });
  }

  it('垂直线（两端同 x）无价格读数', () => {
    const { dctx } = makeDctx();
    const d = drawing('trendline', [P(T0, 98), P(T0, 106)]);
    const a = pix(d.points[0], dctx);
    expect(drawingReadingsAt(d, a.x, dctx)).toEqual([]);
  });

  it('像素插值即 yToPrice：段上任意 f 处读数 = 端点像素线性内插后反算', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing('trendline', [P(T0, 98), P(T0 + 2 * IV, 106)]);
    const a = pix(d.points[0], dctx);
    const b = pix(d.points[1], dctx);
    const f = 0.25;
    const x = a.x + (b.x - a.x) * f;
    const expected = priceScale.yToPrice(a.y + (b.y - a.y) * f);
    expect(drawingReadingsAt(d, x, dctx)).toEqual([{ label: '', value: expected }]);
  });

  /**
   * 对数轴专用：上面两条 golden 在线性轴上「像素插值」与「价格插值」重合（线性变换下等价），
   * 探针把 `segReading` 改成价格域线性插值**全绿逃逸**——所以只有 log 轴能区分两条口径。
   * 98→106 段的像素中点在 log 轴上反算 ≈ 101.9215（几何均值 √10388），价格域线性会给 102（算术均值）：
   * 表里必须是屏幕上那条线的高度（101.93），否则「画线读数」与画布脱钩。
   */
  it('对数轴：段中点读数 = 像素中点反算（≈101.9215），不等于价格域线性的 102', () => {
    const { dctx, priceScale } = makeDctx(true);
    expect(priceScale.isLog).toBe(true); // 前提：fixture 真在 log 模式，否则本例退化成上面那条的重复
    const d = drawing('trendline', [P(T0, 98), P(T0 + 2 * IV, 106)]);
    const a = pix(d.points[0], dctx);
    const b = pix(d.points[1], dctx);
    const read = drawingReadingsAt(d, (a.x + b.x) / 2, dctx);
    expect(read).toEqual([{ label: '', value: priceScale.yToPrice((a.y + b.y) / 2) }]);
    expect(read[0].value).toBeCloseTo(Math.sqrt(98 * 106), 9); // 几何均值：log 域中点
    expect(read[0].value).not.toBeCloseTo(102, 6); // 与价格域线性（算术均值）分道
  });
});

describe('ray：从锚点经第二点延伸到右缘，端点之外仍出数（与 trendline 的关键区别）', () => {
  it('x∈[锚,右缘] 出数；锚左空；b 之右（trendline 空）仍给出外推值', () => {
    const { dctx, priceScale } = makeDctx();
    const d = drawing('ray', [P(T0, 98), P(T0 + 2 * IV, 106)]);
    const a = pix(d.points[0], dctx);
    const b = pix(d.points[1], dctx);
    // 共线：射线上任一点 = 同一像素直线插值（f 可 > 1，b 之右外推）
    const readAt = (x: number) => {
      const f = (x - a.x) / (b.x - a.x);
      return { label: '', value: priceScale.yToPrice(a.y + (b.y - a.y) * f) };
    };
    const mid = { x: (a.x + b.x) / 2 };
    expect(drawingReadingsAt(d, mid.x, dctx)).toEqual([readAt(mid.x)]);
    const beyond = { x: Math.min(W, b.x + 30) };
    expect(drawingReadingsAt(d, beyond.x, dctx)).toEqual([readAt(beyond.x)]);
    // trendline 在 b 之右为空，ray 未到右缘仍非空——同一 x 两者必须分道
    expect(drawingReadingsAt(drawing('trendline', d.points), beyond.x, dctx)).toEqual([]);
    expect(drawingReadingsAt(d, a.x - 1, dctx)).toEqual([]);
  });
});

describe('channel：基线 + 副线（像素平移）两条读数', () => {
  it('中点：基线 = 102、副线 ≠ 基线；不足 3 点空', () => {
    const { dctx } = makeDctx();
    const d = drawing('channel', [P(T0, 98), P(T0 + 2 * IV, 106), P(T0, 100)]);
    const a = pix(d.points[0], dctx);
    const b = pix(d.points[1], dctx);
    const out = drawingReadingsAt(d, (a.x + b.x) / 2, dctx);
    expect(out.map((r) => r.label)).toEqual(['基线', '副线']);
    expect(out[0].value).toBe(102);
    expect(out[1].value).not.toBe(out[0].value);
    expect(drawingReadingsAt(drawing('channel', [P(T0, 98), P(T0 + 2 * IV, 106)]), (a.x + b.x) / 2, dctx)).toEqual([]);
  });
});

describe('fib / fib-auto：默认 7 档水平组，值走价格域公式（对数轴无关），末端外空', () => {
  for (const type of ['fib', 'fib-auto'] as const) {
    it(`${type}：区间内 7 档 golden 价 + 「比率%」标签；x0 左/末端右皆空`, () => {
      const { dctx } = makeDctx();
      const d = drawing(type, [P(T0, 100), P(T0 + 4 * IV, 200)]);
      const p0 = pix(d.points[0], dctx).x;
      const p1 = pix(d.points[1], dctx).x;
      const x0 = Math.min(p0, p1);
      const endX = fibLevelEndX(x0, Math.max(p0, p1), W);
      const out = drawingReadingsAt(d, (x0 + Math.max(p0, p1)) / 2, dctx);
      expect(out.map((r) => r.label)).toEqual(FIB_RETRACEMENT_LEVELS.map((lv) => `${(lv * 100).toFixed(1)}%`));
      expect(out.map((r) => r.value)).toEqual(FIB_RETRACEMENT_LEVELS.map((lv) => fibRetracementPrice(100, 200, lv)));
      expect(out[0].value).toBe(100);
      expect(out[out.length - 1].value).toBe(200);
      expect(drawingReadingsAt(d, x0 - 1, dctx)).toEqual([]);
      expect(drawingReadingsAt(d, endX + 1, dctx)).toEqual([]);
    });
  }

  it('自定义 levels 覆盖默认档位', () => {
    const { dctx } = makeDctx();
    const d = drawing('fib', [P(T0, 100), P(T0 + 4 * IV, 200)], [0.5]);
    const x0 = Math.min(pix(d.points[0], dctx).x, pix(d.points[1], dctx).x);
    expect(drawingReadingsAt(d, x0, dctx)).toEqual([{ label: '50.0%', value: 150 }]);
  });
});

describe('fib-extension：默认 9 档，枢轴 + (终点-起点)×比率；不足 3 点空', () => {
  it('区间内 9 档 golden + 标签；单/两点空', () => {
    const { dctx } = makeDctx();
    const d = drawing('fib-extension', [P(T0, 100), P(T0 + 4 * IV, 110), P(T0 + 2 * IV, 105)]);
    const xs = d.points.map((p) => pix(p, dctx).x);
    const x0 = Math.min(...xs);
    const endX = fibLevelEndX(x0, Math.max(...xs), W);
    const out = drawingReadingsAt(d, (x0 + Math.max(xs[0], xs[1])) / 2, dctx);
    expect(out.map((r) => r.label)).toEqual(FIB_EXTENSION_LEVELS.map((lv) => `${(lv * 100).toFixed(1)}%`));
    expect(out.map((r) => r.value)).toEqual(FIB_EXTENSION_LEVELS.map((lv) => fibExtensionPrice(100, 110, 105, lv)));
    expect(drawingReadingsAt(d, endX + 1, dctx)).toEqual([]);
    expect(drawingReadingsAt(drawing('fib-extension', [P(T0, 100), P(T0 + 4 * IV, 110)]), x0, dctx)).toEqual([]);
  });
});

describe('percent-line：默认 0%/50%/100% 三档，档位价走价格域公式', () => {
  it('区间内三档 golden；末端外空', () => {
    const { dctx } = makeDctx();
    const d = drawing('percent-line', [P(T0, 100), P(T0 + 4 * IV, 110)]);
    const p0 = pix(d.points[0], dctx).x;
    const p1 = pix(d.points[1], dctx).x;
    const x0 = Math.min(p0, p1);
    const endX = fibLevelEndX(x0, Math.max(p0, p1), W);
    const out = drawingReadingsAt(d, (x0 + Math.max(p0, p1)) / 2, dctx);
    expect(out.map((r) => r.label)).toEqual(PERCENT_LEVELS.map((lv) => `${(lv * 100).toFixed(1)}%`));
    expect(out.map((r) => r.value)).toEqual(PERCENT_LEVELS.map((lv) => percentPrice(100, 110, lv)));
    expect(out.map((r) => r.value)).toEqual([100, 105, 110]);
    expect(drawingReadingsAt(d, endX + 1, dctx)).toEqual([]);
  });
});

describe('fib-fan：三条比率射线，结构出数（标签 = 比率%）、起点之左空', () => {
  it('起点右侧命中若干射线，标签取自 FIB_FAN_LEVELS；不足 2 点空', () => {
    const { dctx } = makeDctx();
    const d = drawing('fib-fan', [P(T0, 100), P(T0 + 4 * IV, 106)]);
    const ax = pix(d.points[0], dctx).x;
    const out = drawingReadingsAt(d, ax + 10, dctx);
    const fanLabels = FIB_FAN_LEVELS.map((lv) => `${(lv * 100).toFixed(1)}%`);
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      expect(fanLabels).toContain(r.label);
      expect(Number.isFinite(r.value)).toBe(true);
    }
    expect(drawingReadingsAt(d, ax - 10, dctx)).toEqual([]);
    expect(drawingReadingsAt(drawing('fib-fan', [P(T0, 100)]), ax + 10, dctx)).toEqual([]);
  });
});

describe('fib-channel：档位线（level 号标签）像素插值出数；不足 3 点空', () => {
  it('三点在中位 x 上给平行线族读数，标签为档位号；两点空', () => {
    const { dctx } = makeDctx();
    const d = drawing('fib-channel', [P(T0, 100), P(T0 + 4 * IV, 106), P(T0, 103)]);
    const a = pix(d.points[0], dctx);
    const b = pix(d.points[1], dctx);
    const out = drawingReadingsAt(d, (a.x + b.x) / 2, dctx);
    const labels = FIB_CHANNEL_LEVELS.map((lv) => String(lv));
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      expect(labels).toContain(r.label);
      expect(Number.isFinite(r.value)).toBe(true);
    }
    expect(drawingReadingsAt(drawing('fib-channel', [P(T0, 100), P(T0 + 4 * IV, 106)]), (a.x + b.x) / 2, dctx)).toEqual(
      [],
    );
  });
});

/** 出数族（甲档 12 + 按「屏幕上画着线 ⇒ 表里有数」同式另收的 price-note / fib-channel） */
const READABLE = [
  'trendline',
  'ray',
  'hline',
  'arrow',
  'info-line',
  'measure',
  'percent-line',
  'fib',
  'fib-auto',
  'fib-extension',
  'fib-fan',
  'channel',
  'price-note',
  'fib-channel',
] as const;

/** 非出数族：该 x 上无确定价格，读数一律空——裁决「甲档出数，其余 —」里「其余」的全集 */
const UNREADABLE = [
  'vline',
  'rect',
  'ellipse',
  'polygon',
  'path',
  'text',
  'note',
  'price-label',
  'anchored-text',
  'arrow-mark',
  'fib-arc',
  'fib-timezone',
  'fib-spiral',
  'gann-fan',
  'gann-line',
  'gann-box',
  'elliott-wave',
  'arc',
  'curve',
  'abc-pattern',
  'gartley',
  'bat',
  'butterfly',
  'crab',
  'head-shoulders',
  'head-shoulders-inverse',
  'triangle-pattern',
  'triangle-expanding',
  'circle',
  'forecast',
  'icon-mark',
] as const;

/**
 * 穷尽性门禁：`default: return []` 是一条**兜底分支**，新加画线族若不写 case 会静默变空，
 * 谁也不会报警。本例把「族清单」与 `DRAWING_TOOLS` 强绑：任一族漏登记 → missing 非空 → 红。
 * （首版就是这么漏的：7 个谐波/头肩/三角族既不在出数清单也不在非出数清单，仅靠本例暴露。）
 */
describe('族清单穷尽性：DRAWING_TOOLS 全族都被点过一次名', () => {
  it('出数族 ∪ 非出数族 = 全族，且两份清单不重叠', () => {
    const read = new Set<string>(READABLE);
    const unread = new Set<string>(UNREADABLE);
    expect([...read].filter((id) => unread.has(id))).toEqual([]);
    const missing = DRAWING_TOOLS.map((t) => t.id).filter((id) => !read.has(id) && !unread.has(id));
    expect(missing).toEqual([]);
    expect(read.size + unread.size).toBe(DRAWING_TOOLS.length);
  });
});

describe('乙/丙/丁/戊 档：该 x 上一律无确定价格 → 空数组', () => {
  for (const type of UNREADABLE) {
    it(`${type} → []`, () => {
      const { dctx } = makeDctx();
      const d = drawing(type, [P(T0, 100), P(T0 + 2 * IV, 104), P(T0 + 4 * IV, 102)]);
      expect(drawingReadingsAt(d, (pix(d.points[0], dctx).x + pix(d.points[2], dctx).x) / 2, dctx)).toEqual([]);
    });
  }
});

describe('空点集：直接返回空数组（不落 switch）', () => {
  it('points=[] → []', () => {
    const { dctx } = makeDctx();
    expect(drawingReadingsAt(drawing('trendline', []), 100, dctx)).toEqual([]);
  });
});
