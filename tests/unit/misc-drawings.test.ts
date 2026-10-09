import { describe, expect, it } from 'vitest';
import { drawingBBox, marqueeSelectIds, type MarqueeRect } from '@/engine/drawing/marqueeSelect';
import { getToolDef, type Drawing } from '@/engine/drawing/types';
import { ICON_MARK_DEFAULT, ICON_MARK_PATHS, iconMarkKeyOf } from '@/engine/drawing/iconMarks';

/** 测试用 DrawContext 桩：time 值即 index（fractionalIndexAt 恒等）、线性 viewport/priceScale */
function stubCtx(): Parameters<typeof marqueeSelectIds>[2] {
  return {
    viewport: { indexToX: (i: number) => i * 10, xToIndex: (x: number) => x / 10 },
    priceScale: { priceToY: (p: number) => 600 - p, yToPrice: (y: number) => 600 - y },
    series: { fractionalIndexAt: (t: number) => t } as never,
    geo: { chartW: 400, chartH: 300 },
  } as never;
}

function dw(id: string, type: Drawing['type'], points: Array<[number, number]>): Drawing {
  return {
    id,
    type,
    points: points.map(([t, p]) => ({ time: t, price: p })),
    style: { color: '#000', lineWidth: 1 },
    locked: false,
    visible: true,
  };
}

const CTX = stubCtx();

describe('drawingBBox：像素包围盒口径', () => {
  it('普通工具 = 锚点包围盒 ±8 外扩', () => {
    const b = drawingBBox(
      dw('a', 'trendline', [
        [10, 500],
        [20, 480],
      ]),
      CTX,
      400,
      300,
    );
    // 锚点像素 (100,100) / (200,120)
    expect(b).toEqual({ minX: 92, minY: 92, maxX: 208, maxY: 128 });
  });

  it('hline 特例 = 全宽条带（y ±6）', () => {
    const b = drawingBBox(dw('h', 'hline', [[5, 500]]), CTX, 400, 300);
    expect(b).toEqual({ minX: 0, minY: 94, maxX: 400, maxY: 106 });
  });

  it('vline 特例 = 全高条带（x ±6）', () => {
    const b = drawingBBox(dw('v', 'vline', [[12, 500]]), CTX, 400, 300);
    expect(b).toEqual({ minX: 114, minY: 0, maxX: 126, maxY: 300 });
  });
});

describe('marqueeSelectIds：框选命中', () => {
  const drawings = [
    dw('tl', 'trendline', [
      [10, 500],
      [20, 480],
    ]), // 像素 (100,100)-(200,120)
    dw('hl', 'hline', [[5, 400]]), // 像素 y=200 全宽条带
    dw('vl', 'vline', [[30, 450]]), // 像素 x=300 全高条带
    dw('hidden', 'trendline', [
      [10, 500],
      [20, 480],
    ]), // 不可见：永不命中
  ];
  drawings[3].visible = false;

  it('覆盖多对象的选框返回全部相交 id（图层序）', () => {
    const rect: MarqueeRect = { x0: 0, y0: 0, x1: 150, y1: 210 };
    expect(marqueeSelectIds(drawings, rect, CTX, 400, 300)).toEqual(['tl', 'hl']);
  });

  it('单对象选框只命中该对象', () => {
    const rect: MarqueeRect = { x0: 250, y0: 50, x1: 350, y1: 100 };
    expect(marqueeSelectIds(drawings, rect, CTX, 400, 300)).toEqual(['vl']);
  });

  it('不可见画线跳过', () => {
    const rect: MarqueeRect = { x0: 0, y0: 0, x1: 400, y1: 300 };
    expect(marqueeSelectIds(drawings, rect, CTX, 400, 300)).toEqual(['tl', 'hl', 'vl']);
  });

  it('零尺寸选框（单击）→ 空集合', () => {
    const rect: MarqueeRect = { x0: 100, y0: 100, x1: 100, y1: 100 };
    expect(marqueeSelectIds(drawings, rect, CTX, 400, 300)).toEqual([]);
  });

  it('倒向拖拽（x1<x0）自动归一化', () => {
    const rect: MarqueeRect = { x0: 150, y0: 210, x1: 0, y1: 0 };
    expect(marqueeSelectIds(drawings, rect, CTX, 400, 300)).toEqual(['tl', 'hl']);
  });
});

describe('iconMarks：图标标记注册表', () => {
  it('8 个图标各有 label 与 24×24 path', () => {
    const keys = Object.keys(ICON_MARK_PATHS);
    expect(keys.length).toBe(8);
    for (const k of keys) {
      expect(ICON_MARK_PATHS[k].label.length).toBeGreaterThan(0);
      expect(ICON_MARK_PATHS[k].d).toMatch(/^M/);
    }
  });

  it('未知键回落默认 flag（序列化恢复防呆）', () => {
    expect(iconMarkKeyOf(undefined)).toBe(ICON_MARK_DEFAULT);
    expect(iconMarkKeyOf('emoji-💩')).toBe(ICON_MARK_DEFAULT);
    expect(iconMarkKeyOf('star')).toBe('star');
  });
});

describe('工具注册：二期-C2 新增 4 种', () => {
  it('锚点数与标签钉住', () => {
    expect(getToolDef('forecast').points).toBe(3);
    expect(getToolDef('forecast').label).toBe('预测形态');
    expect(getToolDef('circle').points).toBe(2);
    expect(getToolDef('price-note').points).toBe(1);
    expect(getToolDef('icon-mark').points).toBe(1);
    expect(getToolDef('icon-mark').defaultStyle.text).toBe('flag');
  });
});
