import { describe, expect, it } from 'vitest';
import { ops, type S } from '@/indicators/pine/series';
import { CLOSES, plotValues } from './helpers/pine-fixture';

/**
 * Pine 布尔运算族（not / and / or）的 NaN/na 语义（第四轮审查只修了 if，布尔族漏网）：
 * TV Pine 口径——not na = true；and: false and na = false、true and na = na（条件语境假）；
 * or: true or na = true、false or na = na。undefined（na）与 NaN 同口径，均不在
 * 布尔语境为真。回归口径：与 interpreter 的 if 条件（undefined/NaN/0 为假）一致。
 */

const INPUTS: Array<number | undefined> = [NaN, undefined, 0, 1];

/** and 期望矩阵：行 = 左操作数，列 = 右操作数（顺序同 INPUTS） */
const AND_EXPECTED: Array<Array<number | undefined>> = [
  /* NaN    */ [undefined, undefined, 0, undefined],
  /* na     */ [undefined, undefined, 0, undefined],
  /* 0      */ [0, 0, 0, 0],
  /* 1      */ [undefined, undefined, 0, 1],
];

/** or 期望矩阵：行 = 左操作数，列 = 右操作数（顺序同 INPUTS） */
const OR_EXPECTED: Array<Array<number | undefined>> = [
  /* NaN    */ [undefined, undefined, undefined, 1],
  /* na     */ [undefined, undefined, undefined, 1],
  /* 0      */ [undefined, undefined, 0, 1],
  /* 1      */ [1, 1, 1, 1],
];

/**
 * eq 期望矩阵：TV Pine v5——na == na = true，na == x = false（比较不产出 na）。
 * NaN 与 na 同口径。
 */
const EQ_EXPECTED: Array<Array<number | undefined>> = [
  /* NaN    */ [1, 1, 0, 0],
  /* na     */ [1, 1, 0, 0],
  /* 0      */ [0, 0, 1, 0],
  /* 1      */ [0, 0, 0, 1],
];

describe('ops 布尔族：NaN / undefined（na）全组合', () => {
  it('not：na / NaN / 0 为 1，非零为 0', () => {
    expect(INPUTS.map((x) => ops.not([x])[0])).toEqual([1, 1, 1, 0]);
    expect(ops.not([2])[0]).toBe(0); // 非零（非 1）同为真
  });

  it('and：4×4 组合矩阵（false and na = false；true and na = na）', () => {
    const actual = INPUTS.map((x) => INPUTS.map((y) => ops.and([x], [y])[0]));
    expect(actual).toEqual(AND_EXPECTED);
  });

  it('or：4×4 组合矩阵（true or na = true；false or na = na）', () => {
    const actual = INPUTS.map((x) => INPUTS.map((y) => ops.or([x], [y])[0]));
    expect(actual).toEqual(OR_EXPECTED);
  });

  it('eq：4×4 组合矩阵（na == na = true；na == x = false，比较不产出 na）', () => {
    const actual = INPUTS.map((x) => INPUTS.map((y) => ops.eq([x], [y])[0]));
    expect(actual).toEqual(EQ_EXPECTED);
  });
});

describe('布尔运算的序列对齐：洞不被静默变成数值', () => {
  it('and/or/not 逐 bar 按 TV 规则产出', () => {
    const a: S = [1, 0, undefined, NaN, 1];
    const b: S = [undefined, undefined, 0, 1, NaN];
    expect(ops.and(a, b)).toEqual([undefined, 0, 0, undefined, undefined]);
    expect(ops.or(a, b)).toEqual([1, undefined, undefined, 1, 1]);
    expect(ops.not(a)).toEqual([0, 1, 1, 1, 0]);
  });

  it('eq 逐 bar：洞与 NaN 均参与比较（na == na = 1，x == na = 0），无洞产出', () => {
    const a: S = [1, 0, undefined, NaN, 1];
    const b: S = [1, undefined, 0, NaN, 2];
    expect(ops.eq(a, b)).toEqual([1, 0, 0, 1, 0]);
    expect(ops.eq(a, a)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('脚本级：布尔族与 if 的一致性（undefined/NaN 为假）', () => {
  it('not na = true：if not ta.sma(close, 3) 窗口未满处走真分支', () => {
    const v = plotValues('x = 0\nif not ta.sma(close, 3)\n    x = 1\nelse\n    x = -1\nplot(x)');
    // bar0/1 sma 窗口未满为 na → not na = 1；bar2+ sma 非零 → not = 0
    expect(v).toEqual([1, 1, ...CLOSES.slice(2).map(() => -1)]);
  });

  it('not NaN = true：if not math.sqrt(-1) 走真分支', () => {
    const v = plotValues('x = 0\nif not math.sqrt(-1)\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => 1));
  });

  it('NaN and true = na（假）：sqrt(close-12) and 1 在 NaN 段走 else', () => {
    const v = plotValues('x = 0\nif math.sqrt(close - 12) and 1\n    x = 1\nelse\n    x = -1\nplot(x)');
    // bar0-7 为 NaN 或 0 → 假；bar8-11 为正 → 真
    expect(v).toEqual([...CLOSES.slice(0, 8).map(() => -1), ...CLOSES.slice(8).map(() => 1)]);
  });

  it('na and true = na（假）：窗口未满处走 else', () => {
    const v = plotValues('x = 0\nif ta.sma(close, 3) and 1\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual([-1, -1, ...CLOSES.slice(2).map(() => 1)]);
  });

  it('false and na = false：不因右操作数为 na 变真', () => {
    const v = plotValues('x = 0\nif close > 100 and ta.sma(close, 3)\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => -1));
  });

  it('true or na = true：close > 0 or ta.sma(close, 3) 恒真', () => {
    const v = plotValues('x = 0\nif close > 0 or ta.sma(close, 3)\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => 1));
  });

  it('false or na = na（假）：close > 100 or close / 0 恒假', () => {
    const v = plotValues('x = 0\nif close > 100 or close / 0\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map(() => -1));
  });

  it('同一布尔表达式：plot 值与 if 分支真假一致', () => {
    const plotted = plotValues('plot(not ta.sma(close, 3))');
    const branched = plotValues('x = 0\nif not ta.sma(close, 3)\n    x = 1\nelse\n    x = -1\nplot(x)');
    expect(branched).toEqual(plotted.map((v) => (v === 1 ? 1 : -1)));
  });
});

describe('脚本级：plot 序列值（NaN 不再被 JS truthy 吞成 1）', () => {
  it('plot(math.sqrt(close - 12) and 1)：NaN 段为 na，0/非零段为 0/1', () => {
    // bar0-7：NaN 或 0（bar2/7 的 close=12 → sqrt=0 → 0 and 1 = 0，定义的假非洞）；
    // bar8-11 为正 → 1
    expect(plotValues('plot(math.sqrt(close - 12) and 1)')).toEqual([
      undefined,
      undefined,
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      1,
      1,
      1,
      1,
    ]);
  });

  it('plot(not ta.sma(close, 3))：na 处为 1，窗口满后为 0', () => {
    expect(plotValues('plot(not ta.sma(close, 3))')).toEqual([1, 1, ...CLOSES.slice(2).map(() => 0)]);
  });

  it('plot(not math.sqrt(-1))：恒 1', () => {
    expect(plotValues('plot(not math.sqrt(-1))')).toEqual(CLOSES.map(() => 1));
  });

  it('plot(close > 0 or ta.sma(close, 3))：true or na = true，无洞', () => {
    expect(plotValues('plot(close > 0 or ta.sma(close, 3))')).toEqual(CLOSES.map(() => 1));
  });

  it('plot(close > 100 or close / 0)：false or na = na，全洞', () => {
    expect(plotValues('plot(close > 100 or close / 0)')).toEqual(CLOSES.map(() => undefined));
  });
});

describe('脚本级：!= 复用 not（TV v5：x != na 为真）', () => {
  it('plot(ta.sma(close, 3) != 11)：窗口未满处 na != 11 为真', () => {
    // bar2/4 的 sma=11 → 0；其余定义 bar → 1；bar0/1 sma 为 na → not(eq) = 1
    expect(plotValues('plot(ta.sma(close, 3) != 11)')).toEqual([1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('脚本级：== 的 na 语义（TV v5：na == na = true，na == x = false）', () => {
  it('plot(ta.sma(close, 3) == 11)：窗口未满处 na == 11 为假（不再是 na）', () => {
    // bar0/1 sma 为 na → 0（旧实现为 undefined）；bar2/4 sma=11 → 1；其余定义 bar → 0
    expect(plotValues('plot(ta.sma(close, 3) == 11)')).toEqual([0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('plot(ta.sma(close, 3) == close / 0)：na == na 为真，定义处为假', () => {
    // close/0 恒为 na；bar0/1 sma 为 na → na == na = 1；bar2+ sma 已定义 → x == na = 0
    expect(plotValues('plot(ta.sma(close, 3) == close / 0)')).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
