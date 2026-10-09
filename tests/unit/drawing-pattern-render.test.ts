import { describe, expect, it } from 'vitest';
import { drawPatterns } from '@/engine/drawing/patternRender';
import { pointToPixel, type DrawContext } from '@/engine/drawing/coords';
import type { Drawing } from '@/engine/drawing/types';
import { asCtx, createMockCtx, fillTexts } from './helpers/mock-ctx';

/** 放置中的形态对象会经 RenderPipeline 的 __preview 走同一渲染路径，
 *  锚点数从 1 递增到工具满额——少一个锚点就抛错会打断 rAF 循环致整张画布冻结（二期-C1 回归）。 */

function stubCtx(): DrawContext {
  return {
    viewport: { indexToX: (i: number) => i * 10, xToIndex: (x: number) => x / 10 },
    priceScale: { priceToY: (p: number) => 600 - p, yToPrice: (y: number) => 600 - y },
    series: { fractionalIndexAt: (t: number) => t } as never,
    geo: { chartW: 800, chartH: 400 },
  } as never;
}

const CTX = stubCtx();

function dw(type: Drawing['type'], n: number): Drawing {
  return {
    id: 'p',
    type,
    points: Array.from({ length: n }, (_, i) => ({ time: i * 10, price: 500 - (i % 2 === 0 ? i * 9 : -i * 7) })),
    style: { color: '#787b86', lineWidth: 1 },
    locked: false,
    visible: true,
  };
}

const FAMILY: Drawing['type'][] = [
  'abc-pattern',
  'gartley',
  'bat',
  'butterfly',
  'crab',
  'head-shoulders',
  'head-shoulders-inverse',
  'triangle-pattern',
  'triangle-expanding',
];

const HARMONIC: Drawing['type'][] = ['gartley', 'bat', 'butterfly', 'crab'];

function render(type: Drawing['type'], n: number) {
  const d = dw(type, n);
  const ctx = createMockCtx();
  drawPatterns(
    asCtx(ctx),
    d,
    d.points.map((p) => pointToPixel(p, CTX)),
    CTX,
  );
  return { ctx, texts: fillTexts(ctx) };
}

describe('形态家族渲染：锚点不足（放置预览）不得抛错', () => {
  for (const type of FAMILY) {
    it(`${type}：1..5 锚点逐档渲染均不抛错`, () => {
      for (let n = 1; n <= 5; n++) expect(() => render(type, n)).not.toThrow();
    });
  }

  it('谐波：满 5 锚点才出四腿比率标签，不足时只画折线', () => {
    for (const type of HARMONIC) {
      expect(render(type, 5).texts.filter((t) => t.includes('/'))).toHaveLength(4);
      for (let n = 1; n <= 4; n++) expect(render(type, n).texts.filter((t) => t.includes('/'))).toEqual([]);
    }
  });

  it('谐波：不足 5 锚点时折线仍按已有锚点画出（预览可见）', () => {
    const { ctx } = render('gartley', 3);
    const lines = ctx.calls.filter((c) => c.m === 'lineTo');
    expect(lines.map((c) => c.a)).toEqual([
      [100, 93],
      [200, 118],
    ]);
  });
});
