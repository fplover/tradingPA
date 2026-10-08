import { describe, expect, it } from 'vitest';
import { BARS, CLOSES, compileOk, plotValues } from './helpers/pine-fixture';

/**
 * Pine 标识符解析与 if 条件语义：
 * - 解析顺序为用户定义变量/函数参数优先，内置源序列仅兜底（旧行为先查内置源，
 *   脚本内 close = ... 被静默忽略）
 * - if 条件按 Pine 语义取真假：na（undefined）与 NaN 均为假（旧行为 NaN 走真分支）
 */

describe('Pine 标识符解析：用户定义优先于内置源序列', () => {
  it('同名赋值不再被内置源序列遮蔽', () => {
    const v = plotValues('close = ta.sma(high, 2)\nplot(close)');
    expect(v[0]).toBeUndefined(); // 窗口未满
    expect(v[1]).toBeCloseTo((12 + 13) / 2, 10); // high 序列，非内置 close
    expect(v[11]).toBeCloseTo((17 + 18) / 2, 10);
  });

  it('常量赋值覆盖内置源', () => {
    expect(plotValues('open = 5\nplot(open)')).toEqual(CLOSES.map(() => 5));
    expect(plotValues('volume = hl2\nplot(volume)')[0]).toBeCloseTo(10, 10);
  });

  it('用户函数形参同名于内置源：形参优先', () => {
    const v = plotValues('f(close) =>\n    close * 2\nplot(f(high))');
    expect(v).toEqual(BARS.map((b) => b.high * 2));
  });

  it('未被遮蔽时内置源仍可解析', () => {
    expect(plotValues('plot(close)')).toEqual(CLOSES);
    expect(plotValues('x = 1\nplot(hlc3)')[0]).toBeCloseTo((12 + 8 + 10) / 3, 10);
  });

  it('input.source 参数仍可切换内置源', () => {
    const def = compileOk('src = input.source(close, "源")\nplot(src)');
    expect(def.compute(BARS, { src: 'high' }).p0[0]).toBe(12);
  });
});

describe('Pine if 条件：na / NaN 为假', () => {
  it('undefined 条件走 else（既有语义不回归）', () => {
    const v = plotValues('x = 0\nif ta.sma(close, 3) / 0\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => -1)); // 除零 → undefined → 假
  });

  it('NaN 条件走 else（旧行为误走真分支）', () => {
    const v = plotValues('x = 0\nif math.sqrt(-1)\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => -1));
  });

  it('NaN 条件单分支：不赋值，保留前值', () => {
    const v = plotValues('x = 7\nif math.sqrt(-1)\n    x = 1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => 7));
  });

  it('逐 bar 混合：NaN 段为假、有限非零段为真', () => {
    // sqrt(close-12)：bar0-7 为 NaN 或 0，bar8-11 为正
    const v = plotValues('x = 0\nif math.sqrt(close - 12)\n    x = 1\nplot(x)');
    expect(v).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('有限非零条件仍为真', () => {
    const v = plotValues('x = 0\nif math.sqrt(4) > 0\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => 1));
  });

  it('函数体内的 if 同样按 na 为假执行', () => {
    const v = plotValues('f(x) =>\n    r = 0\n    if math.sqrt(x)\n        r = 1\n    r\nplot(f(close - 12))');
    expect(v).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
  });
});
