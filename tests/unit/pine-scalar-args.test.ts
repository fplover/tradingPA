import { describe, expect, it } from 'vitest';
import type { Bar } from '@/types/market';
import { compilePine } from '@/indicators/pine/compile';
import { FNS } from '@/indicators/pine/taFunctions';
import type { S } from '@/indicators/pine/series';

/**
 * 三期-D3b：ta.* 标量位（周期/长度/倍数）的结构性的拒绝序列实参。
 * 旧行为 scalar() 只取实参序列的末值，编译期 dry-run 用探针 K 线 → 周期由「合成末值」
 * 决定：`ta.atr(close)` 会以 close 的末值当周期出图，用户看不出任何异常。
 * 两道牙：静态校验（validator 按 FnDef.scalars 声明，带行号，直接进编译错误）与
 * 运行期兜底（scalar() 逐元素比对非常量即抛错，覆盖函数体与用户函数形参这类静态看不到的路径）。
 */

const N = 6;
const BARS: Bar[] = Array.from({ length: N }, (_, i) => ({
  time: 1700000000000 + i * 60_000,
  open: 10 + i,
  high: 11 + i,
  low: 9 + i,
  close: 10 + i,
  volume: 100 + i,
}));
const konst = (v: number): S => new Array<number>(N).fill(v);
/** 逐 bar 变化的序列：末值 6 是合法正整数，旧口径会当成周期 6 用掉 */
const varying: S = Array.from({ length: N }, (_, i) => i + 1);

describe('D3b 静态拒绝：周期位传序列 → 编译期报错（带行号）', () => {
  it('直接传内置源：报错发生在该行，不再走 dry-run', () => {
    const r = compilePine('plot(close)\nx = ta.ema(close, 5)\nplot(ta.sma(close, x))', 'd3b-a');
    expect(r.def).toBeNull();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(3);
    expect(r.errors[0].message).toBe('「ta.sma」第 2 个参数需为常量，不能传序列表达式');
  });

  // 三条断言都锁「静态层独有的口径」：错误发生在实参所在行（dry-run 兜底只会记第 1 行）、
  // 文案为「不能传序列表达式」（运行期 scalar() 的文案是「不能是逐 bar 变化的序列」）、
  // 且只有这一条错误（静态拦下后不再进入 dry-run）。变异探针见交付记录。
  const staticErr = (src: string, id: string, line: number, fn: string, pos: number) => {
    const r = compilePine(src, id);
    expect(r.def, src).toBeNull();
    expect(r.errors, src).toHaveLength(1);
    expect(r.errors[0].line, src).toBe(line);
    expect(r.errors[0].message, src).toBe(`「${fn}」第 ${pos} 个参数需为常量，不能传序列表达式`);
  };

  it('0 号位周期同样受检（ta.atr 旧启发式整个漏计的位置）', () => {
    staticErr('plot(ta.atr(close))', 'd3b-b', 1, 'ta.atr', 1);
  });

  it('嵌套调用（周期位传函数返回值）报错', () => {
    staticErr('plot(ta.ema(close, ta.sma(close, 5)))', 'd3b-c', 1, 'ta.ema', 2);
  });

  it('变量绑定到序列即判序列（hline / bgcolor / alertcondition 条件内同样校验）', () => {
    staticErr('p = close + 1\nplot(close)\nhline(ta.sma(close, p))', 'd3b-d', 3, 'ta.sma', 2);
    staticErr('p = close + 1\nplot(close)\nbgcolor(ta.sma(close, p) > 0)', 'd3b-e', 3, 'ta.sma', 2);
    staticErr('p = close + 1\nplot(close)\nalertcondition(ta.sma(close, p) > 0, "t", "m")', 'd3b-f', 3, 'ta.sma', 2);
  });
});

describe('D3b 静态拒绝：常量源不得误杀（正对照）', () => {
  const ok = (src: string, id: string) => expect(compilePine(src, id).errors, src).toEqual([]);

  it('字面量 / 字面量运算 / 数字变量 / input.int 参数都算常量源', () => {
    ok('plot(ta.sma(close, 20))', 'd3b-g1');
    ok('plot(ta.sma(close, 2 + 1))', 'd3b-g2');
    ok('p = 20\nplot(ta.sma(close, p))', 'd3b-g3');
    ok('len = input.int(20, "L", maxval=100)\nplot(ta.sma(close, len))', 'd3b-g4');
  });

  it('各标量位声明的实际写法全部照常编译', () => {
    ok('plot(ta.psar(0.02, 0.2, 4))', 'd3b-h1');
    ok('[t, s] = ta.supertrend(3, 10)\nplot(t)', 'd3b-h2');
    ok('[u, m, l] = ta.bb(close, 20, 2)\nplot(u)', 'd3b-h3');
    ok('[f, s, h] = ta.macd(close, 12, 26, 9)\nplot(f)', 'd3b-h4');
    ok('plot(ta.linreg(close, 50, 5))', 'd3b-h5');
    ok('plot(ta.tsi(close, 13, 25))', 'd3b-h6');
    ok('plot(ta.nz(close, 0))', 'd3b-h7');
    ok('plot(ta.change(close, 1))', 'd3b-h8');
    ok('plot(ta.pivothigh(5, 3))', 'd3b-h9');
    ok('plot(ta.pivothigh(close, 5, 3))', 'd3b-h10');
    ok('[m, u, l] = ta.donchian(20)\nplot(m)', 'd3b-h11');
    ok('plot(ta.adx(14, 14))', 'd3b-h12');
    ok('plot(ta.vwap(close))', 'd3b-h13');
    ok('plot(math.max(close, 2))', 'd3b-h14');
  });

  it('未声明标量位的函数不受该规则约束（ta.crossover 两个序列实参合法）', () => {
    ok('plot(ta.crossover(close, ta.ema(close, 5)))', 'd3b-h15');
  });
});

describe('D3b 运行期兜底：静态看不到的路径仍变明错', () => {
  it('周期经用户函数形参传入逐 bar 变化的序列 → dry-run 拦截（旧行为：探针末值 1450 当周期，静默出图）', () => {
    // 探针 volume = 1000 + (i % 10) * 50 逐 bar 变化、末值 1450 恰为正整数：旧口径按周期 1450 编译通过
    const r = compilePine('s(x) =>\n    ta.sma(close, x)\nplot(s(volume))', 'd3b-i');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('运行期校验失败');
    expect(r.errors[0].message).toContain('逐 bar 变化');
  });

  it('ta.pivothigh 两参形态的 left 位：静态声明只取两形态交集，由运行期兜底', () => {
    const r = compilePine('plot(ta.pivothigh(close, 3))', 'd3b-j');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('运行期校验失败');
    expect(r.errors[0].message).toContain('第 1 个参数');
  });
});

describe('D3b 声明与实现一致：FnDef.scalars 每一位都真被 fn 读到并抛错', () => {
  const entries = Object.entries(FNS).filter(([, d]) => (d.scalars ?? []).length > 0);

  it('至少覆盖到全部声明标量位的函数（注册表未被悄悄清空）', () => {
    expect(entries.length).toBeGreaterThanOrEqual(25);
  });

  it.each(entries)('%s 的每个声明位', (_name, def) => {
    for (const idx of def.scalars ?? []) {
      // 声明位必须落在参数数量区间内，否则静态校验会去查一个不存在的位置
      expect(idx, `${_name} scalars 越界`).toBeLessThan(def.max);
      const len = Math.max(idx + 1, def.min);
      const args: S[] = Array.from({ length: len }, () => konst(2));
      args[idx] = varying;
      expect(() => def.fn(args, { bars: BARS }), `${_name} 第 ${idx + 1} 个参数未强制常量`).toThrow(
        new RegExp(`第 ${idx + 1} 个参数`),
      );
    }
  });

  it('全常量实参不会因为「逐 bar 变化」判定被误抛（反向）', () => {
    for (const [name, def] of entries) {
      const args: S[] = Array.from({ length: def.max }, () => konst(2));
      let msg = '';
      try {
        def.fn(args, { bars: BARS });
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
      expect(msg, `${name} 全常量实参被判为变化序列`).not.toContain('逐 bar 变化');
    }
  });
});
