import { describe, expect, it } from 'vitest';
import {
  harmonicCheck,
  harmonicLegRatios,
  headShouldersValid,
  lineIntersection,
  triangleGeom,
  HARMONIC_RANGES,
  type HarmonicKind,
} from '@/engine/drawing/patternMath';
import { getToolDef } from '@/engine/drawing/types';

/** 书本级 Gartley 合成样本（价格轴）：
 *  XA=20 → AB=0.618·XA → BC=0.5·AB → CD=1.508·BC → AD/XA=0.775，四腿全部落带 */
const GARTLEY_PTS = [
  { time: 0, price: 100 },
  { time: 5, price: 120 },
  { time: 10, price: 107.64 },
  { time: 15, price: 113.82 },
  { time: 20, price: 104.5 },
];

describe('harmonicLegRatios：四腿价格幅度比', () => {
  it('标准 Gartley 样本的四腿比率逐项钉住', () => {
    const r = harmonicLegRatios(GARTLEY_PTS);
    expect(r.ab).toBeCloseTo(0.618, 2);
    expect(r.bc).toBeCloseTo(0.5, 2);
    expect(r.cd).toBeCloseTo(1.508, 2);
    expect(r.ad).toBeCloseTo(0.775, 2);
  });

  it('分母为 0（同价锚点）→ Infinity，不产生 NaN', () => {
    const r = harmonicLegRatios([
      { time: 0, price: 100 },
      { time: 1, price: 100 },
      { time: 2, price: 110 },
      { time: 3, price: 105 },
      { time: 4, price: 108 },
    ]);
    expect(r.ab).toBe(Infinity);
  });
});

describe('harmonicCheck：逐腿带内校验', () => {
  it('标准 Gartley 四腿全 ok', () => {
    const checks = harmonicCheck('gartley', GARTLEY_PTS);
    expect(checks.map((c) => c.ok)).toEqual([true, true, true, true]);
  });

  it('同一形态套 crab：CD 腿越带（5 超出 [2.0, 3.618]）判 false', () => {
    const pts = [
      { time: 0, price: 100 },
      { time: 5, price: 120 },
      { time: 10, price: 110 },
      { time: 15, price: 115 },
      { time: 20, price: 90 },
    ];
    const checks = harmonicCheck('crab', pts);
    expect(checks[0].ok).toBe(true); // ab=0.5 ∈ [0.382,0.618]
    expect(checks[2].value).toBe(5);
    expect(checks[2].ok).toBe(false);
    // crab 的 ad=1.5 落带（[1.5,1.75] 下缘），gartley 的 ad 带不同 → 不 ok
    expect(harmonicCheck('crab', pts)[3].ok).toBe(true);
    expect(harmonicCheck('gartley', pts)[3].ok).toBe(false);
  });

  it('四种形态的 ad 带互不相同（形态区分度的数据保证）', () => {
    const bands = (Object.keys(HARMONIC_RANGES) as HarmonicKind[]).map((k) => HARMONIC_RANGES[k].ad.join('-'));
    expect(new Set(bands).size).toBe(4);
  });
});

describe('headShouldersValid：头肩有效性', () => {
  const top = [
    { time: 0, price: 110 },
    { time: 3, price: 104 },
    { time: 6, price: 120 },
    { time: 9, price: 103 },
    { time: 12, price: 112 },
  ];
  const bottom = top.map((p) => ({ ...p, price: 216 - p.price })); // 镜像

  it('头肩顶：头为最高且两颈谷低于双肩 → true', () => {
    expect(headShouldersValid(top, false)).toBe(true);
  });
  it('头肩底：镜像样本 inverse → true', () => {
    expect(headShouldersValid(bottom, true)).toBe(true);
  });
  it('口径互斥：顶样本判底 / 底样本判顶 → false', () => {
    expect(headShouldersValid(top, true)).toBe(false);
    expect(headShouldersValid(bottom, false)).toBe(false);
  });
  it('头不是极值 → false（头低于右肩）', () => {
    const bad = top.map((p, i) => ({ ...p, price: i === 4 ? 125 : p.price }));
    expect(headShouldersValid(bad, false)).toBe(false);
  });
  it('放置中不足 5 点 → false', () => {
    expect(headShouldersValid(top.slice(0, 4), false)).toBe(false);
  });
});

describe('triangleGeom：三角边界与交点', () => {
  it('收敛三角：上边界下行、下边界上行，交点在末枢轴之后', () => {
    const geom = triangleGeom([
      { time: 0, price: 110 },
      { time: 5, price: 90 },
      { time: 10, price: 100 },
      { time: 15, price: 100 },
      { time: 18, price: 96 },
    ]);
    expect(geom).not.toBeNull();
    expect(geom!.apex).not.toBeNull();
    expect(geom!.apex!.time).toBeCloseTo(12.5, 6);
    expect(geom!.apex!.price).toBeCloseTo(97.5, 6);
  });

  it('扩散三角：下边界斜率小于上边界，交点在首枢轴之前', () => {
    const geom = triangleGeom([
      { time: 0, price: 100 },
      { time: 5, price: 90 },
      { time: 10, price: 110 },
      { time: 15, price: 95 },
      { time: 18, price: 100 },
    ]);
    expect(geom!.apex!.time).toBeLessThan(0);
  });

  it('平行边界 → apex null（渲染降级为平行通道）', () => {
    const geom = triangleGeom([
      { time: 0, price: 100 },
      { time: 5, price: 90 },
      { time: 10, price: 110 },
      { time: 15, price: 100 },
    ]);
    expect(geom!.apex).toBeNull();
  });
});

describe('lineIntersection：守卫分支', () => {
  it('竖直线（dt=0）→ null', () => {
    expect(
      lineIntersection(
        { from: { time: 5, price: 1 }, to: { time: 5, price: 9 } },
        { from: { time: 0, price: 0 }, to: { time: 10, price: 10 } },
      ),
    ).toBeNull();
  });
  it('平行线 → null', () => {
    expect(
      lineIntersection(
        { from: { time: 0, price: 0 }, to: { time: 10, price: 10 } },
        { from: { time: 0, price: 5 }, to: { time: 10, price: 15 } },
      ),
    ).toBeNull();
  });
});

describe('工具注册：二期-C1 新增 11 种', () => {
  it('锚点数与标签钉住', () => {
    expect(getToolDef('abc-pattern').points).toBe(4);
    for (const id of [
      'gartley',
      'bat',
      'butterfly',
      'crab',
      'head-shoulders',
      'head-shoulders-inverse',
      'triangle-pattern',
      'triangle-expanding',
    ] as const) {
      expect(getToolDef(id).points).toBe(5);
    }
    expect(getToolDef('fib-channel').points).toBe(3);
    expect(getToolDef('fib-channel').label).toBe('斐波那契通道');
    expect(getToolDef('fib-spiral').points).toBe(2);
  });
});
