import { describe, expect, it } from 'vitest';
import { compilePine } from '@/indicators/pine/compile';

/**
 * Pine lookback 静态估算：字面量周期 / input 参数化周期 / 用户函数体内的周期。
 * 旧行为只数字面量，input.int(500) 与函数体内的 ta.sma(x,500) 完全不计入 →
 * lookback 停在基线 100，脚本左侧整段 undefined 且用户看不出原因。
 */

function lookbackOf(src: string): number {
  const r = compilePine(src, 'test');
  expect(r.errors).toEqual([]);
  expect(r.def).not.toBeNull();
  return r.def!.lookback;
}

describe('Pine lookback：字面量周期（既有口径不回归）', () => {
  it('基线 100 起步，取最大字面量周期 + 50，封顶 2000', () => {
    expect(lookbackOf('plot(ta.sma(close, 20))')).toBe(150);
    expect(lookbackOf('plot(ta.sma(close, 200))')).toBe(250);
    expect(lookbackOf('plot(ta.sma(close, 5000))')).toBe(2000);
  });

  it('嵌套调用取各实参周期的最大值', () => {
    expect(lookbackOf('x = ta.sma(close, 50)\nplot(ta.ema(x, 30))')).toBe(150);
    expect(lookbackOf('plot(ta.ema(ta.sma(close, 300), 30))')).toBe(350);
  });
});

describe('Pine lookback：input 参数化周期', () => {
  it('input.int 默认值计入 lookback', () => {
    expect(lookbackOf('len = input.int(300)\nplot(ta.sma(close, len))')).toBe(350);
  });

  it('已声明 maxval 时取上界（用户可设的最大周期）', () => {
    expect(lookbackOf('len = input.int(3, "周期", minval=1, maxval=400)\nplot(ta.sma(close, len))')).toBe(450);
  });

  it('非周期实参（序列参数）不计入', () => {
    // src 为 input.source（select 类型）：不作为周期估值
    expect(lookbackOf('src = input.source(close, "源")\nplot(ta.sma(src, 20))')).toBe(150);
  });

  it('plot / hline / bgcolor 条件里的参数化周期一并计入', () => {
    expect(lookbackOf('len = input.int(300)\nplot(close)\nhline(ta.sma(close, len))')).toBe(350);
    expect(lookbackOf('len = input.int(300)\nplot(close)\nbgcolor(ta.sma(close, len) > 0)')).toBe(350);
  });

  it('alertcondition 条件里的参数化周期一并计入', () => {
    expect(lookbackOf('len = input.int(300)\nalertcondition(ta.sma(close, len) > 0, "t", "m")')).toBe(350);
  });
});

describe('Pine lookback：用户函数体', () => {
  it('函数体内的大周期计入（旧行为扫不到）', () => {
    const src = 'ma(x) =>\n    ta.sma(x, 500)\nplot(ma(close))';
    expect(lookbackOf(src)).toBe(550);
  });

  it('函数体内参数化周期同样计入', () => {
    const src = 'len = input.int(400, "周期", maxval=400)\nma(x, n) =>\n    ta.sma(x, n)\nplot(ma(close, len))';
    expect(lookbackOf(src)).toBe(450);
  });

  it('函数体未用时也计入（保守口径：上界预估，宁大不小）', () => {
    const src = 'big(x) =>\n    ta.sma(x, 800)\nplot(ta.sma(close, 10))';
    expect(lookbackOf(src)).toBe(850);
  });
});
