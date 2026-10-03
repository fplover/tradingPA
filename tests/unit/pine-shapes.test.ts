import { describe, it, expect } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { PriceScale } from '@/engine/scale/PriceScale';
import { IndicatorInstance } from '@/indicators/core/instance';
import type { IndicatorDef } from '@/indicators/core/types';
import { drawPineShapes } from '@/engine/renderer/drawPineShapes';
import { indicatorRange } from '@/engine/renderer/drawIndicator';
import { compilePine } from '@/indicators/pine/compile';
import type { ShapeDirective } from '@/indicators/pine/ast';
import { BARS, CLOSES, compileOk } from './helpers/pine-fixture';
import { createMockCtx, callsOf, propSets, asCtx, hasCall, fillTexts } from './helpers/mock-ctx';

/**
 * P2-A② plotshape/plotchar：指令解析 golden + drawPineShapes 渲染 mock-ctx 断言。
 * 条件序列经 IndicatorInstance.computeWindow 的 extra 旁路（与 compute 同窗缓存）；
 * plotshape/plotchar 不产数值 plot，不参与 indicatorRange 与图例数值。
 */

const W = 460;
const H = 300;
const FROM = 0;
const TO = BARS.length - 1;
const SPACING = 8;

/** 奇 bar 阳线（close>open）→ close > open 命中的 bar 下标 */
const ODD = BARS.map((b, i) => (b.close > b.open ? i : -1)).filter((i) => i >= 0);
/** 偶 bar 阴线（close<open）→ close < open 命中的 bar 下标 */
const EVEN = BARS.map((b, i) => (b.close < b.open ? i : -1)).filter((i) => i >= 0);

function fixture() {
  const series = new BarSeries();
  series.replace(BARS);
  const viewport = new Viewport(W);
  viewport.setBarCount(series.length);
  viewport.setBarSpacing(SPACING);
  viewport.scrollToRealtime();
  const priceScale = new PriceScale();
  priceScale.setSize(H);
  priceScale.autoScale(Math.min(...BARS.map((b) => b.low)), Math.max(...BARS.map((b) => b.high)));
  const geo = { chartW: W, chartH: H };
  const ctx = createMockCtx();
  return { ctx, series, viewport, priceScale, geo };
}

function shapeInstance(src: string): IndicatorInstance {
  return new IndicatorInstance(compileOk(src));
}

/** extra 中的 shape 指令（过滤 paint/alert 条目后的渲染载荷） */
function shapesOf(inst: IndicatorInstance): ShapeDirective[] {
  const { extra } = inst.computeWindow(BARS, FROM, TO);
  return (extra as ShapeDirective[]).filter((e) => e.kind === 'shape' || e.kind === 'char');
}

describe('P2-A② plotshape/plotchar 指令解析', () => {
  it('plotshape 关键字全形式：style/location/color/size/text + 条件序列', () => {
    const inst = shapeInstance(
      'indicator("S", overlay=true)\nplot(close)\nplotshape(close > open, title="B", style=shape.triangleup, location=location.belowbar, color=color.red, size=size.large, text="买")',
    );
    const sh = shapesOf(inst);
    expect(sh).toHaveLength(1);
    expect(sh[0]).toMatchObject({
      kind: 'shape',
      style: 'triangleup',
      location: 'belowbar',
      color: '#f44336',
      size: 12,
      text: '买',
      line: 3,
    });
    expect(sh[0].cond).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : 0)));
  });

  it('plotshape 位置参数序：(series, title, style)', () => {
    const inst = shapeInstance('plot(close)\nplotshape(close > open, "买点", shape.diamond)');
    expect(shapesOf(inst)[0]).toMatchObject({ style: 'diamond', color: '#2196f3', size: 8 });
  });

  it('plotchar：char= 字符 + 默认 abovebar', () => {
    const inst = shapeInstance(
      'plot(close)\nplotchar(close < open, char="X", location=location.abovebar, color=color.green)',
    );
    const sh = shapesOf(inst);
    expect(sh[0]).toMatchObject({ kind: 'char', style: 'X', color: '#4caf50', location: 'abovebar' });
    expect(sh[0].cond).toEqual(CLOSES.map((_, i) => (i % 2 === 0 ? 1 : 0)));
  });

  it('plotchar 位置参数序：(series, title, char)', () => {
    const inst = shapeInstance('plot(close)\nplotchar(close < open, "卖", "▼")');
    expect(shapesOf(inst)[0]).toMatchObject({ kind: 'char', style: '▼' });
  });

  it('location.absolute + price= 价格表达式：price 序列与 cond 同窗', () => {
    const inst = shapeInstance(
      'plot(close)\nplotshape(close > open, style=shape.circle, location=location.absolute, price=low)',
    );
    const sh = shapesOf(inst);
    expect(sh[0]).toMatchObject({ location: 'absolute' });
    expect(sh[0].price).toEqual(BARS.map((b) => b.low));
  });

  it('size= 数值直取（钳 [2,40]）', () => {
    expect(shapesOf(shapeInstance('plot(close)\nplotshape(close > open, size=20)'))[0].size).toBe(20);
    expect(shapesOf(shapeInstance('plot(close)\nplotshape(close > open, size=1)'))[0].size).toBe(2);
    expect(shapesOf(shapeInstance('plot(close)\nplotshape(close > open, size=99)'))[0].size).toBe(40);
  });

  it('未知 shape / location / size → 编译期指名报错', () => {
    const r1 = compilePine('plot(close)\nplotshape(close > open, style=shape.flag)', 't');
    expect(r1.def).toBeNull();
    expect(r1.errors[0].message).toContain('不支持的 shape');
    const r2 = compilePine('plot(close)\nplotshape(close > open, location=location.top)', 't');
    expect(r2.def).toBeNull();
    expect(r2.errors[0].message).toContain('不支持的 location');
    const r3 = compilePine('plot(close)\nplotshape(close > open, size=size.gigantic)', 't');
    expect(r3.def).toBeNull();
    expect(r3.errors[0].message).toContain('未知的 size');
  });

  it('absolute 无 price → 编译期报错', () => {
    const r = compilePine('plot(close)\nplotshape(close > open, style=shape.circle, location=location.absolute)', 't');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('price');
  });

  it('cond 引用未定义变量 / 嵌套调用 → 编译期报错', () => {
    const r1 = compilePine('plot(close)\nplotshape(flag)', 't');
    expect(r1.def).toBeNull();
    expect(r1.errors[0].message).toBe('未定义的标识符: flag');
    const r2 = compilePine('f(x) =>\n    plotshape(x)\nplot(close)', 't');
    expect(r2.def).toBeNull();
    expect(r2.errors[0].message).toContain('plotshape 必须在顶层');
  });

  it('plotshape 不产数值 plot；与 plot 共存时 plots 只有 plot 项', () => {
    const only = compileOk('plotshape(close > open, style=shape.circle)');
    expect(only.plots).toEqual([]);
    const mixed = compileOk('plot(close, "收")\nplotshape(close > open)\nplotchar(close < open)');
    expect(mixed.plots.map((p) => p.key)).toEqual(['p0']);
  });

  it('plotshape 不参与 indicatorRange（autoscale 只认数值 plot）', () => {
    const inst = new IndicatorInstance(
      compileOk(
        'plot(close)\nplotshape(close > open, style=shape.circle, location=location.absolute, price=high * 100)',
      ),
    );
    const r = indicatorRange(inst, BARS, FROM, TO);
    expect(r.low).toBe(Math.min(...CLOSES));
    expect(r.high).toBe(Math.max(...CLOSES));
  });
});

describe('P2-A② drawPineShapes 渲染', () => {
  it('triangleup belowbar：奇 bar 三角路径，几何与颜色正确', () => {
    const f = fixture();
    const inst = shapeInstance(
      'plot(close)\nplotshape(close > open, style=shape.triangleup, location=location.belowbar, color=color.red, size=size.large)',
    );
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    expect(propSets(f.ctx, 'fillStyle')).toEqual(['#f44336']);
    expect(callsOf(f.ctx, 'fill')).toHaveLength(6); // 6 根阳线
    expect(callsOf(f.ctx, 'closePath')).toHaveLength(6);
    // 首个标记：bar1，尖点在 (cx, priceToY(low)+size+2-size)，底边两角 ±size
    const i = ODD[0];
    const x = f.viewport.indexToX(i);
    const cy = f.priceScale.priceToY(BARS[i].low) + 12 + 2;
    expect(hasCall(f.ctx, 'moveTo', [x, cy - 12])).toBe(true);
    expect(hasCall(f.ctx, 'lineTo', [x - 12, cy + 12])).toBe(true);
    expect(hasCall(f.ctx, 'lineTo', [x + 12, cy + 12])).toBe(true);
  });

  it('plotchar：偶 bar fillText，字号=size、位置在 high 上方', () => {
    const f = fixture();
    const inst = shapeInstance(
      'plot(close)\nplotchar(close < open, char="X", location=location.abovebar, color=color.green)',
    );
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    const texts = callsOf(f.ctx, 'fillText');
    expect(texts).toHaveLength(6);
    expect(propSets(f.ctx, 'font')).toEqual([
      `8px 'Trebuchet MS', -apple-system, BlinkMacSystemFont, Roboto, Ubuntu, Arial, sans-serif`,
    ]);
    texts.forEach((a, k) => {
      const i = EVEN[k];
      expect(a[0]).toBe('X');
      expect(a[1]).toBeCloseTo(f.viewport.indexToX(i), 6);
      expect(a[2]).toBeCloseTo(f.priceScale.priceToY(BARS[i].high) - 8 - 2, 6);
    });
    expect(callsOf(f.ctx, 'fill')).toHaveLength(0); // 字符不走路径填充
  });

  it('circle + location.absolute price=low：arc 中心落在 low 价', () => {
    const f = fixture();
    const inst = shapeInstance(
      'plot(close)\nplotshape(close > open, style=shape.circle, location=location.absolute, price=low, color=color.blue, size=10)',
    );
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    const arcs = callsOf(f.ctx, 'arc');
    expect(arcs).toHaveLength(6);
    arcs.forEach((a, k) => {
      const i = ODD[k];
      expect(a[0]).toBeCloseTo(f.viewport.indexToX(i), 6);
      expect(a[1]).toBeCloseTo(f.priceScale.priceToY(BARS[i].low), 6);
      expect(a[2]).toBeCloseTo(10 * 0.85, 6); // 半径 = size * 0.85
      expect(a[3]).toBe(0);
      expect(a[4]).toBeCloseTo(Math.PI * 2, 6);
    });
  });

  it('text= 附加文本：标记右侧小字', () => {
    const f = fixture();
    const inst = shapeInstance(
      'plot(close)\nplotshape(close > open, style=shape.circle, location=location.belowbar, color=color.red, size=size.small, text="B")',
    );
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    expect(fillTexts(f.ctx)).toEqual(ODD.map(() => 'B'));
    const i = ODD[0];
    const y = f.priceScale.priceToY(BARS[i].low) + 6 + 2;
    expect(hasCall(f.ctx, 'fillText', ['B', f.viewport.indexToX(i) + 6 + 2, y])).toBe(true);
  });

  it('plotchar + text=：字符与文本交替且互不污染基准', () => {
    const f = fixture();
    const inst = shapeInstance(
      'plot(close)\nplotchar(close < open, char="X", location=location.abovebar, color=color.green, size=size.small, text="S")',
    );
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    const texts = callsOf(f.ctx, 'fillText');
    expect(texts).toHaveLength(12); // 6 字符 + 6 文本，按 bar 交替
    // bar0：先字符（居中 x）后文本（左偏移 x + size + 2）
    expect(texts[0][0]).toBe('X');
    expect(texts[0][1]).toBeCloseTo(f.viewport.indexToX(EVEN[0]), 6);
    expect(texts[1][0]).toBe('S');
    expect(texts[1][1]).toBeCloseTo(f.viewport.indexToX(EVEN[0]) + 6 + 2, 6);
    // bar2 的字符恢复居中基准（不被上一 bar 的文本左对齐污染）
    expect(texts[2][0]).toBe('X');
    expect(texts[2][1]).toBeCloseTo(f.viewport.indexToX(EVEN[1]), 6);
    // 字号同样恢复：6px 在首个 10px 之后再次出现
    const fonts = propSets(f.ctx, 'font') as string[];
    expect(fonts[0]).toContain('6px');
    expect(fonts.slice(2).some((v) => v.includes('6px'))).toBe(true);
  });

  it('xcross/circle-cross：圆环 + 内部交叉描边', () => {
    const f = fixture();
    const inst = shapeInstance('plot(close)\nplotshape(close > open, style=shape.xcross, location=location.abovebar)');
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    expect(callsOf(f.ctx, 'arc')).toHaveLength(6);
    expect(callsOf(f.ctx, 'stroke')).toHaveLength(12); // 每标记：圆环 + X 两笔
    expect(callsOf(f.ctx, 'fill')).toHaveLength(0);
  });

  it('extra 混有 paint/alert 指令时只画 shape（kind 相位隔离）', () => {
    const f = fixture();
    const inst = shapeInstance(
      [
        'indicator("mix", overlay=true)',
        'plot(close)',
        'bgcolor(close > open, color=color.red)',
        'plotshape(close > open, style=shape.circle, location=location.abovebar, color=color.blue)',
        'alertcondition(close > open, title="阳线", message="m")',
      ].join('\n'),
    );
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    expect(callsOf(f.ctx, 'arc')).toHaveLength(6);
    expect(callsOf(f.ctx, 'rect')).toHaveLength(1); // 仅 clip 裁剪矩形，无 bgcolor 色带
    expect(fillTexts(f.ctx)).toEqual([]);
  });

  it('多窗口不串窗：图例窗 compute 后，绘制窗仍画本窗标记', () => {
    const inst = shapeInstance('plot(close)\nplotshape(close > open, style=shape.circle, location=location.abovebar)');
    const f = fixture();
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    expect(callsOf(f.ctx, 'arc')).toHaveLength(6);
    // 图例窗（5..6）compute：覆盖 lastRun 槽位
    inst.computeWindow(BARS, 5, 6);
    const ctx2 = createMockCtx();
    drawPineShapes(asCtx(ctx2), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    expect(callsOf(ctx2, 'arc')).toHaveLength(6);
  });

  it('无 shape 旁路的指标（内置/无 computeExtra）：零绘制调用', () => {
    const f = fixture();
    const plainDef: IndicatorDef = {
      id: 'plain',
      name: 'plain',
      category: 'test',
      overlay: true,
      lookback: 0,
      params: [],
      plots: [],
      compute: () => ({}),
    };
    const inst = new IndicatorInstance(plainDef);
    drawPineShapes(asCtx(f.ctx), inst, BARS, FROM, TO, f.viewport, f.priceScale, f.geo);
    expect(f.ctx.calls.filter((c) => !c.m.startsWith('set:'))).toHaveLength(0);
  });

  it('编译失败脚本不走渲染（def=null 时调用方不会建实例）', () => {
    const r = compilePine('plot(close)\nplotshape(close > open, style=shape.flag)', 'test');
    expect(r.def).toBeNull();
  });
});
