import { describe, expect, it } from 'vitest';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, getToolDef, DRAWING_TOOLS } from '@/engine/drawing/types';

describe('DrawingLayer', () => {
  it('添加后自动选中', () => {
    const layer = new DrawingLayer();
    const d = layer.add('trendline', [
      { time: 1, price: 100 },
      { time: 2, price: 110 },
    ]);
    expect(layer.list().length).toBe(1);
    expect(layer.selected?.id).toBe(d.id);
    expect(d.style.color).toBe(getToolDef('trendline').defaultStyle.color);
  });

  it('撤销/重做', () => {
    const layer = new DrawingLayer();
    layer.add('hline', [{ time: 1, price: 100 }]);
    expect(layer.list().length).toBe(1);
    layer.undo();
    expect(layer.list().length).toBe(0);
    layer.redo();
    expect(layer.list().length).toBe(1);
  });

  it('拖拽为单步历史', () => {
    const layer = new DrawingLayer();
    const d = layer.add('trendline', [
      { time: 1, price: 100 },
      { time: 2, price: 110 },
    ]);
    layer.beginHistory();
    layer.updatePoints(d.id, [
      { time: 1, price: 105 },
      { time: 2, price: 115 },
    ]);
    layer.updatePoints(d.id, [
      { time: 1, price: 108 },
      { time: 2, price: 118 },
    ]);
    layer.undo();
    expect(layer.list()[0].points[0].price).toBe(100); // 一次撤销回到拖拽前
  });

  it('锁定后不可移动', () => {
    const layer = new DrawingLayer();
    const d = layer.add('hline', [{ time: 1, price: 100 }]);
    layer.setLocked(d.id, true);
    layer.updatePoints(d.id, [{ time: 1, price: 200 }]);
    expect(layer.list()[0].points[0].price).toBe(100);
  });

  it('序列化往返', () => {
    const layer = new DrawingLayer();
    layer.add('rect', [
      { time: 1, price: 100 },
      { time: 2, price: 120 },
    ]);
    layer.add('fib', [
      { time: 1, price: 100 },
      { time: 2, price: 90 },
    ]);
    const raw = serializeDrawings(layer.list());
    const restored = deserializeDrawings(raw);
    expect(restored.length).toBe(2);
    expect(restored.map((d) => d.type)).toEqual(['rect', 'fib']);

    const target = new DrawingLayer();
    target.replaceAll(restored);
    expect(target.list().length).toBe(2);
  });

  it('反序列化容错', () => {
    expect(deserializeDrawings('not json')).toEqual([]);
    expect(deserializeDrawings('[{"foo":1}]')).toEqual([]);
  });

  it('全部工具定义合法', () => {
    for (const t of DRAWING_TOOLS) {
      expect(t.points === 0 || t.points >= 1).toBe(true);
      expect(t.defaultStyle.color).toMatch(/^#/);
    }
  });
});
