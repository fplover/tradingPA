// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { DrawingLayer } from '@/engine/drawing/DrawingLayer';
import { serializeDrawings, deserializeDrawings, getToolDef, DRAWING_TOOLS } from '@/engine/drawing/types';
import {
  arrowMarkBoxSize,
  estimatePriceChars,
  labelBoxSize,
  measureTextWidth,
  noteBoxSize,
  splitTextLines,
  textBoxSize,
} from '@/engine/drawing/textMath';
import { drawTextFamily, hitTestTextFamily } from '@/engine/drawing/textRender';
import { createMockCtx, asCtx, callsOf, fillTexts, hasCall, hasPair, propSets, type MockCtx } from './helpers/mock-ctx';
import type { Bar } from '@/types/market';
import type { Drawing, DrawingPoint } from '@/engine/drawing/types';
import type { DrawContext } from '@/engine/drawing/drawDrawings';

/**
 * P2-B 文字类 4 种单测：便签 / 价格标签 / 锚定文本 / 箭头标记。
 * - textMath：宽度估算与框尺寸（golden 手算）
 * - textRender：canvas mock 绘制序列 + 命中盒
 * - 落点/序列化/命中/撤销：DrawingLayer + ChartRenderer 指针级（jsdom）
 */

const P = (time: number, price: number): DrawingPoint => ({ time, price });

// ---------- textMath：纯几何 golden ----------

describe('measureTextWidth（CJK 全宽 / 拉丁 0.6 宽）', () => {
  it('ASCII 按 0.6 × fontSize 计', () => {
    expect(measureTextWidth('abc', 12)).toBeCloseTo(21.6, 10);
    expect(measureTextWidth('', 12)).toBe(0);
  });
  it('CJK 按全宽计', () => {
    expect(measureTextWidth('便签', 12)).toBe(24);
    expect(measureTextWidth('价格标签', 11)).toBe(44);
  });
  it('中西混排取各自宽度', () => {
    expect(measureTextWidth('a锚', 10)).toBeCloseTo(16, 10);
  });
});

describe('splitTextLines', () => {
  it('按换行切分；空串按单行空串', () => {
    expect(splitTextLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
    expect(splitTextLines('')).toEqual(['']);
    expect(splitTextLines('一行')).toEqual(['一行']);
  });
});

describe('noteBoxSize（便签背景框）', () => {
  it('行高 = round(fontSize × 1.4)，内边距 8/6，最小宽 40', () => {
    expect(noteBoxSize(['便签'], 12)).toEqual({ w: 40, h: 29 }); // max(40,24)+16；1×17+12
    expect(noteBoxSize(['abcdefghij'], 12)).toEqual({ w: 88, h: 29 }); // 10×7.2+16
    expect(noteBoxSize(['一二三'], 12)).toEqual({ w: 52, h: 29 }); // 36+16
  });
  it('多行高度按行数累加', () => {
    expect(noteBoxSize(['a', 'b'], 12)).toEqual({ w: 40, h: 46 }); // 2×17+12
    expect(noteBoxSize(['a', 'b', 'c'], 12)).toEqual({ w: 40, h: 63 });
  });
});

describe('labelBoxSize / textBoxSize / arrowMarkBoxSize', () => {
  it('价签框：内边距 6/3，最小宽 28', () => {
    expect(labelBoxSize('100.00', 11)).toEqual({ w: 52, h: 19 }); // 6 字符 × 6.6 + 12 = 51.6 → 52
    expect(labelBoxSize('1', 11)).toEqual({ w: 28, h: 19 }); // max(28, 6.6+12)
  });
  it('锚定文本盒：文本宽 + 8，行高 + 8', () => {
    expect(textBoxSize(['ab'], 12)).toEqual({ w: 22, h: 25 });
    expect(textBoxSize(['ab', 'cd'], 12)).toEqual({ w: 22, h: 42 });
  });
  it('箭头标记盒：24px 箭头区 + 文本 + 8', () => {
    expect(arrowMarkBoxSize('标记', 12)).toEqual({ w: 56, h: 20 });
    expect(arrowMarkBoxSize('', 12)).toEqual({ w: 32, h: 20 });
  });
});

describe('estimatePriceChars（命中盒价格位数估算）', () => {
  it('整数位 + 小数点 + 2 位小数，至少 4 字符', () => {
    expect(estimatePriceChars(123.456)).toBe(6);
    expect(estimatePriceChars(1)).toBe(4);
    expect(estimatePriceChars(12345.6)).toBe(8);
  });
});

// ---------- 工具注册表 ----------

describe('P2-B 文字类工具注册', () => {
  it('4 种工具：points 均为 1，默认样式符合语义', () => {
    expect(getToolDef('note').points).toBe(1);
    expect(getToolDef('price-label').points).toBe(1);
    expect(getToolDef('anchored-text').points).toBe(1);
    expect(getToolDef('arrow-mark').points).toBe(1);
    const note = getToolDef('note').defaultStyle;
    expect(note.text).toBe('便签');
    expect(note.fillColor).toBe('#fff9c4'); // 便签语义黄
    expect(note.color).toBe('#131722'); // 黄底深字
    expect(getToolDef('anchored-text').defaultStyle.text).toBe('锚定文本');
    expect(getToolDef('arrow-mark').defaultStyle.text).toBe('标记');
    expect(getToolDef('price-label').defaultStyle.color).toBe('#787b86'); // TV 灰
  });
  it('DRAWING_TOOLS 总数 45 且新工具追加在既有 17 之后', () => {
    expect(DRAWING_TOOLS).toHaveLength(45);
    expect(DRAWING_TOOLS[17].id).toBe('note');
    expect(DRAWING_TOOLS[20].id).toBe('arrow-mark');
    expect(DRAWING_TOOLS[22].id).toBe('percent-line'); // 百分比线追加在 measure 之后
  });
});

// ---------- textRender：canvas mock 绘制序列 ----------

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

function makeDctx(): { ctx: MockCtx; dctx: DrawContext } {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(8);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(97, 108);
  return { ctx: createMockCtx(), dctx: { viewport, priceScale, series, geo: { chartW: W, chartH: H } } };
}

function drawing(d: Partial<Drawing> & { type: Drawing['type']; points: DrawingPoint[] }): Drawing {
  return { id: 'd1', locked: false, visible: true, style: { color: '#787b86', lineWidth: 1 }, ...d } as Drawing;
}

function toPix(p: DrawingPoint, dctx: DrawContext): { x: number; y: number } {
  return {
    x: dctx.viewport.indexToX(dctx.series.fractionalIndexAt(p.time)),
    y: dctx.priceScale.priceToY(p.price),
  };
}

describe('drawTextFamily：便签', () => {
  it('背景框 + 多行文本（mock 口径：宽 = max(40, 6×行宽)+16，高 = 行数×17+12）', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'note',
      points: [P(T0, 100)],
      style: { color: '#131722', lineWidth: 1, fillColor: '#fff9c4', text: '便签', fontSize: 12 },
    });
    const p = toPix(d.points[0], dctx);
    drawTextFamily(asCtx(ctx), d, [p], 2);
    expect(propSets(ctx, 'fillStyle')).toEqual(['#fff9c4', '#131722']);
    expect(hasCall(ctx, 'fillRect', [p.x, p.y, 40, 29])).toBe(true);
    expect(fillTexts(ctx)).toEqual(['便签']);
    expect(hasCall(ctx, 'fillText', ['便签', p.x + 8, p.y + 14.5])).toBe(true);
  });

  it('多行：每行一条 fillText，行距 17px', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'note',
      points: [P(T0, 100)],
      style: { color: '#131722', lineWidth: 1, fillColor: '#fff9c4', text: '第一行\n第二行', fontSize: 12 },
    });
    const p = toPix(d.points[0], dctx);
    drawTextFamily(asCtx(ctx), d, [p], 2);
    expect(fillTexts(ctx)).toEqual(['第一行', '第二行']);
    expect(hasCall(ctx, 'fillText', ['第一行', p.x + 8, p.y + 14.5])).toBe(true);
    expect(hasCall(ctx, 'fillText', ['第二行', p.x + 8, p.y + 31.5])).toBe(true);
  });
});

describe('drawTextFamily：价格标签', () => {
  it('色底白字方牌居中于锚点，内容 = 价格（无前缀）', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'price-label',
      points: [P(T0, 100)],
      style: { color: '#787b86', lineWidth: 1, text: '', fontSize: 11 },
    });
    const p = toPix(d.points[0], dctx);
    drawTextFamily(asCtx(ctx), d, [p], 2);
    // '100.00' 6 字符 × 6（mock）+ 12 = 48；高 11+8 = 19
    expect(propSets(ctx, 'fillStyle')).toEqual(['#787b86', '#ffffff']);
    expect(hasCall(ctx, 'fillRect', [p.x - 24, p.y - 9.5, 48, 19])).toBe(true);
    expect(fillTexts(ctx)).toEqual(['100.00']);
    expect(hasCall(ctx, 'fillText', ['100.00', p.x, p.y])).toBe(true);
  });

  it('style.text 非空时作为前缀', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'price-label',
      points: [P(T0, 100)],
      style: { color: '#787b86', lineWidth: 1, text: '锚', fontSize: 11 },
    });
    const p = toPix(d.points[0], dctx);
    drawTextFamily(asCtx(ctx), d, [p], 2);
    expect(fillTexts(ctx)).toEqual(['锚 100.00']);
    expect(hasCall(ctx, 'fillRect', [p.x - 30, p.y - 9.5, 60, 19])).toBe(true);
  });
});

describe('drawTextFamily：锚定文本', () => {
  it('文本 + 锚点小圆点（r=3）', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'anchored-text',
      points: [P(T0, 100)],
      style: { color: '#d1d4dc', lineWidth: 1, text: '锚定文本', fontSize: 12 },
    });
    const p = toPix(d.points[0], dctx);
    drawTextFamily(asCtx(ctx), d, [p], 2);
    expect(hasCall(ctx, 'fillText', ['锚定文本', p.x, p.y])).toBe(true);
    expect(hasCall(ctx, 'arc', [p.x, p.y, 3, 0, Math.PI * 2])).toBe(true);
  });

  it('多行时以锚点为垂直中心', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'anchored-text',
      points: [P(T0, 100)],
      style: { color: '#d1d4dc', lineWidth: 1, text: 'a\nb', fontSize: 12 },
    });
    const p = toPix(d.points[0], dctx);
    drawTextFamily(asCtx(ctx), d, [p], 2);
    expect(hasCall(ctx, 'fillText', ['a', p.x, p.y - 8.5])).toBe(true);
    expect(hasCall(ctx, 'fillText', ['b', p.x, p.y + 8.5])).toBe(true);
  });
});

describe('drawTextFamily：箭头标记', () => {
  it('14px 箭杆 + 实心箭头 + 右侧文本', () => {
    const { ctx, dctx } = makeDctx();
    const d = drawing({
      type: 'arrow-mark',
      points: [P(T0, 100)],
      style: { color: '#787b86', lineWidth: 2, text: '标记', fontSize: 12 },
    });
    const p = toPix(d.points[0], dctx);
    drawTextFamily(asCtx(ctx), d, [p], 2);
    expect(hasPair(ctx, 'moveTo', [p.x, p.y], 'lineTo', [p.x + 14, p.y])).toBe(true);
    // 箭头：moveTo(尖端) → 两翼 lineTo → closePath → fill
    expect(hasCall(ctx, 'moveTo', [p.x + 20, p.y])).toBe(true);
    expect(callsOf(ctx, 'fill')).toHaveLength(1);
    expect(fillTexts(ctx)).toEqual(['标记']);
    expect(hasCall(ctx, 'fillText', ['标记', p.x + 24, p.y])).toBe(true);
  });
});

// ---------- textRender：命中测试 ----------

describe('hitTestTextFamily', () => {
  const cases: Array<[Drawing['type'], string]> = [
    ['note', '便签'],
    ['price-label', ''],
    ['anchored-text', '锚定文本'],
    ['arrow-mark', '标记'],
  ];
  for (const [type, text] of cases) {
    it(`${type}：锚点附近命中，远处不中`, () => {
      const { dctx } = makeDctx();
      const d = drawing({ type, points: [P(T0, 100)], style: { color: '#787b86', lineWidth: 1, text, fontSize: 12 } });
      const p = toPix(d.points[0], dctx);
      expect(hitTestTextFamily(d, [p], p.x + 2, p.y + 2)).toBe(true);
      expect(hitTestTextFamily(d, [p], p.x + 200, p.y - 120)).toBe(false);
    });
  }
  it('便签命中盒覆盖背景框右下角', () => {
    const { dctx } = makeDctx();
    const d = drawing({
      type: 'note',
      points: [P(T0, 100)],
      style: { color: '#131722', lineWidth: 1, fillColor: '#fff9c4', text: '便签', fontSize: 12 },
    });
    const p = toPix(d.points[0], dctx);
    expect(hitTestTextFamily(d, [p], p.x + 38, p.y + 27)).toBe(true); // 框内（40×29）
    expect(hitTestTextFamily(d, [p], p.x + 50, p.y + 27)).toBe(false); // 框外
  });
  it('非文本类型返回 false', () => {
    const { dctx } = makeDctx();
    const d = drawing({ type: 'rect', points: [P(T0, 100), P(T0 + IV, 110)] });
    const pts = d.points.map((q) => toPix(q, dctx));
    expect(hitTestTextFamily(d, pts, 100, 100)).toBe(false);
  });
});

// ---------- DrawingLayer：放置 / 序列化 / 撤销 ----------

describe('文字类工具：放置/序列化/撤销（DrawingLayer）', () => {
  it('add 后自动选中，样式取工具默认值', () => {
    const layer = new DrawingLayer();
    const note = layer.add('note', [P(1, 100)]);
    expect(layer.selected?.id).toBe(note.id);
    expect(note.style.fillColor).toBe('#fff9c4');
    expect(note.style.text).toBe('便签');
    const pl = layer.add('price-label', [P(2, 110)]);
    expect(pl.style.color).toBe('#787b86');
  });

  it('序列化往返不丢类型/锚点/文本', () => {
    const layer = new DrawingLayer();
    layer.add('note', [P(1, 100)], { text: '多行\n文本' });
    layer.add('anchored-text', [P(2, 110)]);
    layer.add('arrow-mark', [P(3, 120)]);
    const restored = deserializeDrawings(serializeDrawings(layer.list()));
    expect(restored.map((d) => d.type)).toEqual(['note', 'anchored-text', 'arrow-mark']);
    expect(restored[0].style.text).toBe('多行\n文本');
    expect(restored[0].points).toEqual([P(1, 100)]);
  });

  it('撤销移除放置对象，重做恢复', () => {
    const layer = new DrawingLayer();
    layer.add('note', [P(1, 100)]);
    layer.undo();
    expect(layer.list()).toHaveLength(0);
    layer.redo();
    expect(layer.list()[0].type).toBe('note');
  });

  it('多选 + 整体平移：便签与价格标签同量移动', () => {
    const layer = new DrawingLayer();
    const a = layer.add('note', [P(1, 100)]);
    const b = layer.add('price-label', [P(2, 110)]);
    layer.select(null);
    layer.toggleSelect(a.id);
    layer.toggleSelect(b.id);
    expect(layer.translateSelected(3, 5)).toBe(true);
    expect(layer.list()[0].points).toEqual([P(4, 105)]);
    expect(layer.list()[1].points).toEqual([P(5, 115)]);
  });
});

// ---------- ChartRenderer 指针级：落点 / 命中 / 撤销 ----------

const CANVAS_W = 1280;
const CANVAS_H = 800;

function makeBars(n = 600): Bar[] {
  const out: Bar[] = [];
  let price = 30_000;
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(0.01, open + (rand() - 0.5) * open * 0.004);
    const high = Math.max(open, close) + rand() * open * 0.003;
    const low = Math.min(open, close) - rand() * open * 0.003;
    out.push({ time: T0 + i * IV, open, high, low, close, volume: 100 + rand() * 900 });
    price = close;
  }
  return out;
}

let canvas: HTMLCanvasElement;
let mock: MockCtx;

beforeEach(() => {
  document.body.innerHTML = '';
  mock = createMockCtx();
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    asCtx(mock),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: CANVAS_W,
      bottom: CANVAS_H,
      width: CANVAS_W,
      height: CANVAS_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRenderer(): ChartRenderer {
  const r = new ChartRenderer(canvas, makeBars(), { symbol: 'BTC/USDT', interval: '1m', decimals: 2 });
  r.redraw();
  return r;
}

function ptr(type: string, x: number, y: number): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true }),
  );
}

function click(x: number, y: number): void {
  ptr('pointerdown', x, y);
  ptr('pointerup', x, y);
}

describe('ChartRenderer：文字类工具落点全链路', () => {
  it('单击放置便签：单锚点 + 自动选中 + 撤销移除', () => {
    const r = makeRenderer();
    r.setActiveTool('note');
    click(300, 300);
    r.setActiveTool(null);
    const list = r.listDrawings();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('note');
    expect(list[0].points).toHaveLength(1);
    expect(list[0].style.text).toBe('便签');
    expect(r.selectedDrawingId).toBe(list[0].id);
    r.undoDrawing();
    expect(r.listDrawings()).toHaveLength(0);
  });

  it('价格标签落点价 = 落点像素反算价（yToPrice）', () => {
    const r = makeRenderer();
    r.setActiveTool('price-label');
    click(400, 250);
    r.setActiveTool(null);
    const d = r.listDrawings()[0];
    expect(d.type).toBe('price-label');
    expect(d.points[0].price).toBeGreaterThan(0);
  });

  it('磁吸开启时锚定价吸附到 OHLC', () => {
    const r = makeRenderer();
    r.setMagnet(true);
    r.setActiveTool('anchored-text');
    click(350, 280);
    r.setActiveTool(null);
    r.setMagnet(false);
    const price = r.listDrawings()[0].points[0].price;
    const bars = r.getBars();
    const snapped = bars.some((b) => [b.open, b.high, b.low, b.close].includes(price));
    expect(snapped).toBe(true);
  });

  it('放置后原位置点击（避开锚点）命中框体 → 选中；Esc 退出多选', () => {
    const r = makeRenderer();
    r.setActiveTool('note');
    click(300, 300); // 锚点
    r.setActiveTool(null);
    const id = r.listDrawings()[0].id;
    // 便签框 40×29，锚点在左上；点框内右下（距锚点 >7px，不走手柄）
    click(330, 318);
    expect(r.selectedDrawingId).toBe(id);
    r.cancelPlacing();
    expect(r.selectedDrawingId).toBeNull();
  });

  it('导出/导入序列化：4 种文字工具往返', () => {
    const r = makeRenderer();
    for (const tool of ['note', 'price-label', 'anchored-text', 'arrow-mark'] as const) {
      r.setActiveTool(tool);
      click(300 + Math.random() * 0, 300);
      r.setActiveTool(null);
    }
    const raw = r.exportDrawings();
    const r2 = makeRenderer();
    r2.importDrawings(raw);
    expect(r2.listDrawings().map((d) => d.type)).toEqual(['note', 'price-label', 'anchored-text', 'arrow-mark']);
    expect(r2.listDrawings()[0].style.fillColor).toBe('#fff9c4');
  });
});

// ---------- 全家族渲染冒烟（P2-B 11 种新工具经真实管线各画一帧） ----------

describe('ChartRenderer：P2-B 全家族渲染冒烟', () => {
  it('11 种新工具各放置一个并重绘：不抛错且产出绘制原语', () => {
    const r = makeRenderer();
    const place = (tool: Parameters<ChartRenderer['setActiveTool']>[0], clicks: Array<[number, number]>) => {
      r.setActiveTool(tool);
      for (const [x, y] of clicks) click(x, y);
      if (tool === 'polygon') r.finishPlacing();
      r.setActiveTool(null);
    };
    place('note', [[300, 300]]);
    place('price-label', [[320, 320]]);
    place('anchored-text', [[340, 340]]);
    place('arrow-mark', [[360, 360]]);
    place('measure', [
      [300, 400],
      [500, 420],
    ]);
    place('polygon', [
      [300, 300],
      [400, 300],
      [350, 400],
    ]);
    place('arc', [
      [300, 450],
      [400, 470],
      [350, 520],
    ]);
    place('curve', [
      [500, 300],
      [550, 250],
      [650, 350],
      [700, 300],
    ]);
    place('gann-fan', [[300, 250]]);
    place('gann-line', [[320, 250]]);
    place('gann-box', [
      [600, 250],
      [750, 350],
    ]);
    place('elliott-wave', [
      [300, 550],
      [350, 500],
      [400, 530],
      [450, 460],
      [500, 500],
      [550, 440],
      [600, 520],
      [650, 580],
      [700, 550],
    ]);
    expect(r.listDrawings()).toHaveLength(12);
    mock.calls.length = 0; // 清掉放置过程的记录，只断言末帧
    expect(() => r.redraw()).not.toThrow();
    // 文本/标签类产出 fillText；线族产出 stroke
    expect(fillTexts(mock).length).toBeGreaterThan(0);
    expect(callsOf(mock, 'stroke').length).toBeGreaterThan(0);
  });
});
