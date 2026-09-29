import { describe, expect, it } from 'vitest';
import { compilePine, pinePaint } from '@/indicators/pine/compile';
import { BARS, CLOSES, compileOk, outputValues, plotValues } from './helpers/pine-fixture';

/**
 * Pine 语句扩展 golden 用例：if/else/else if、for、var、用户函数、
 * 元组解构赋值、绘图指令（hline/bgcolor/barcolor）、运行期错误前置（AC-B2）。
 */

describe('Pine if / else / else if（分支掩码语义：未命中保留前值）', () => {
  it('if 单分支：条件命中赋值，未命中保留初值', () => {
    const v = plotValues('x = 0\nif close > open\n    x = 1\nplot(x)');
    expect(v).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : 0))); // 奇 bar 阳线
  });

  it('if / else：两分支互斥赋值', () => {
    const v = plotValues('x = 0\nif close > open\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : -1)));
  });

  it('else if 链：首个命中分支生效', () => {
    const v = plotValues(
      'x = 0\nif close > 13\n    x = 2\nelse if close > open\n    x = 1\nelse\n    x = -1\nplot(x)',
    );
    expect(v).toEqual([-1, 1, -1, 1, -1, 1, -1, 1, 2, 1, 2, 2]);
  });

  it('块内声明：掩码未命中处为 undefined（向量子集语义）', () => {
    const v = plotValues('if close > open\n    y = 1\nplot(y)');
    expect(v).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : undefined)));
  });
});

describe('Pine for 循环', () => {
  it('累加：body 内变量跨迭代累积（向量化逐 bar）', () => {
    const v = plotValues('s = 0\nfor i = 1 to 3\n    s = s + close\nplot(s)');
    expect(v).toEqual(CLOSES.map((c) => 3 * c));
  });

  it('by 步长：for i = 1 to 5 by 2 → 3 次迭代', () => {
    const v = plotValues('s = 0\nfor i = 1 to 5 by 2\n    s = s + 1\nplot(s)');
    expect(v).toEqual(CLOSES.map(() => 3));
  });

  it('循环变量参与运算：1+2+3+4 = 10', () => {
    const v = plotValues('s = 0\nfor i = 1 to 4\n    s = s + i\nplot(s)');
    expect(v).toEqual(CLOSES.map(() => 10));
  });

  it('倒序：for i = 3 to 1 自动递减', () => {
    const v = plotValues('s = 0\nfor i = 3 to 1\n    s = s + 1\nplot(s)');
    expect(v).toEqual(CLOSES.map(() => 3));
  });
});

describe('Pine var 声明', () => {
  it('var x = ta.sma(close, 3) 与普通赋值同语义（向量子集）', () => {
    const v = plotValues('var x = ta.sma(close, 3)\nplot(x)');
    expect(v[0]).toBeUndefined();
    expect(v[2]).toBeCloseTo(11, 10);
    expect(v[11]).toBeCloseTo(44 / 3, 10);
  });
});

describe('Pine 用户函数', () => {
  it('单表达式函数体（内联形式）', () => {
    const v = plotValues('f(x) =>\n    x * 2 + 1\nplot(f(close))');
    expect(v[0]).toBe(21);
    expect(v[11]).toBe(33);
  });

  it('多语句函数体：末行裸表达式为返回值', () => {
    const v = plotValues('add(a, b) =>\n    s = a + b\n    s * 2\nplot(add(close, 1))');
    expect(v[0]).toBe(22); // (10+1)*2
    expect(v[5]).toBe(20); // (9+1)*2
  });

  it('函数体内可用 if：掩码语义保持', () => {
    const v = plotValues('f(x) =>\n    r = 0\n    if x > 11\n        r = 1\n    r\nplot(f(close))');
    expect(v).toEqual([0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it('函数参数作为 ta 周期：f(close, 2) ≡ ta.sma(close, 2)', () => {
    const v = plotValues('ma(x, len) =>\n    ta.sma(x, len)\nplot(ma(close, 2))');
    expect(v[1]).toBeCloseTo(10.5, 10);
    expect(v[2]).toBeCloseTo(11.5, 10);
  });

  it('参数数量不匹配 → 编译期报错', () => {
    const r = compilePine('f(x) =>\n    x * 2\nplot(f(close, 2))', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('需要 1 个参数');
  });

  it('函数体末行不是表达式 → 报错', () => {
    const r = compilePine('f(x) =>\n    y = x * 2\nplot(f(close))', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('返回表达式');
  });
});

describe('Pine 元组解构赋值（多序列 ta 函数）', () => {
  it('[d, s, h] = ta.macd(close, 2, 4, 3) → dif/dea/hist 三 plot', () => {
    const src = '[d, s, h] = ta.macd(close, 2, 4, 3)\nplot(d, "dif")\nplot(s, "dea")\nplot(h, "hist")';
    const def = compileOk(src);
    expect(def.plots.map((p) => p.label)).toEqual(['dif', 'dea', 'hist']);
    const out = def.compute(BARS, {});
    // dif[3] = ema(close,2)[3] - ema(close,4)[3] = 33.5/3 - 11
    expect(out.p0[3]).toBeCloseTo(1 / 6, 6);
    // dea[5] = mean(dif[3..5])（EMA 播种）
    expect(out.p1[5]).toBeCloseTo(-0.180494, 5);
    expect(out.p2[7]).toBeCloseTo(0.327908, 5);
  });

  it('单序列函数接元组解构 → 报错', () => {
    const r = compilePine('[a, b] = ta.sma(close, 3)\nplot(a)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('运行期校验失败');
  });
});

describe('Pine 绘图指令：hline / bgcolor / barcolor', () => {
  it('hline：生成 level plot + 常量序列输出（渲染层可直接画水平线）', () => {
    const def = compileOk('indicator("H", overlay=true)\nplot(close)\nhline(100, "枢轴", color=color.red)');
    expect(def.plots.map((p) => p.key)).toEqual(['p0', 'h0']);
    expect(def.plots[1].style).toMatchObject({ kind: 'level', color: '#f44336', lineWidth: 1 });
    expect(def.plots[1].label).toBe('枢轴');
    const out = def.compute(BARS, {});
    expect(out.h0).toEqual(CLOSES.map(() => 100));
  });

  it('bgcolor：条件序列 + 颜色经 pinePaint 旁路暴露（渲染接线属后续批次）', () => {
    const def = compileOk('plot(close)\nbgcolor(close > open, color=color.red)');
    def.compute(BARS, {});
    const paint = pinePaint(def);
    expect(paint).toHaveLength(1);
    expect(paint![0]).toMatchObject({ kind: 'bgcolor', color: '#f44336' });
    expect(paint![0].cond).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : 0)));
  });

  it('barcolor：纯 color 常量 → 恒生效（cond=null）', () => {
    const def = compileOk('plot(close)\nbarcolor(color.blue)');
    def.compute(BARS, {});
    const paint = pinePaint(def);
    expect(paint![0]).toMatchObject({ kind: 'barcolor', color: '#2196f3', cond: null });
  });

  it('bgcolor 条件引用未定义变量 → 编译期报错', () => {
    const r = compilePine('plot(close)\nbgcolor(flag)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toBe('未定义的标识符: flag');
  });
});

describe('Pine 运行期错误前置（AC-B2：不穿透渲染循环）', () => {
  it('运行期抛错脚本 → 编译期 dry-run 拦截，def=null', () => {
    // ta.sma(close,3)/0 → undefined 序列；作为周期再传入 ta.sma → 运行期抛错
    const r = compilePine('n = ta.sma(close, 3) / 0\nplot(ta.sma(close, n))', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('运行期校验失败');
    expect(r.errors[0].message).toContain('常量');
  });

  it('循环次数超限 → dry-run 拦截', () => {
    const r = compilePine('s = 0\nfor i = 1 to 5000\n    s = s + 1\nplot(s)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('循环次数');
  });

  it('参数覆盖触发运行期错误 → compute 兜底不抛错，输出全 undefined', () => {
    const def = compileOk('len = input.int(3)\nplot(ta.sma(close, len))');
    let out: Record<string, Array<number | undefined>> | undefined;
    expect(() => {
      out = def.compute(BARS, { len: 0 });
    }).not.toThrow();
    expect(out!.p0.every((v) => v === undefined)).toBe(true);
  });

  it('正常脚本 dry-run 后 pineRuntimeError 为空', async () => {
    const { pineRuntimeError } = await import('@/indicators/pine/compile');
    const def = compileOk('plot(ta.sma(close, 3))');
    def.compute(BARS, {});
    expect(pineRuntimeError(def)).toBeUndefined();
  });
});

describe('Pine 与内置管线互操作', () => {
  it('outputValues：hline 与 plot 共存时各自键独立', () => {
    const src = 'plot(ta.sma(close, 2), "ma")\nhline(10)';
    expect(outputValues(src, 'p0')![1]).toBeCloseTo(10.5, 10);
    expect(outputValues(src, 'h0')).toEqual(CLOSES.map(() => 10));
  });

  it('input 参数在 for 边界中使用', () => {
    const src = 'l = input.int(3)\ns = 0\nfor i = 1 to l\n    s = s + 1\nplot(s)';
    expect(plotValues(src, BARS, { l: 5 })).toEqual(CLOSES.map(() => 5));
    expect(plotValues(src)).toEqual(CLOSES.map(() => 3));
  });
});
