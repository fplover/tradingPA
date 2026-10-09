import { describe, expect, it } from 'vitest';
import { compilePine } from '@/indicators/pine/compile';
import { pivotSeries, vwapSeries } from '@/indicators/pine/taCore';
import type { S } from '@/indicators/pine/series';
import { BARS, CLOSES, compileOk, outputValues, plotValues, trendBars } from './helpers/pine-fixture';
import type { Bar } from '@/types/market';

/**
 * 二期-D Pine 扩展 golden 用例：switch（subject/条件两形态 + 掩码语义）、
 * varip（≡ var）、strategy 骨架（entry/close/exit → position_size/netprofit/
 * equity）、ta.pivothigh/pivotlow（严格枢轴 + 右移确认）、ta.vwap（UTC 会话重置）。
 */

describe('Pine switch：subject 形态（数值相等匹配）', () => {
  it('命中臂取值，默认臂兜底', () => {
    const v = plotValues('x = 3\ny = 0\nswitch x\n    2 => y = 20\n    3 => y = 30\n    => y = -1\nplot(y)');
    expect(v).toEqual(CLOSES.map(() => 30));
  });

  it('无命中走默认臂', () => {
    const v = plotValues('x = 5\ny = 0\nswitch x\n    2 => y = 20\n    3 => y = 30\n    => y = -1\nplot(y)');
    expect(v).toEqual(CLOSES.map(() => -1));
  });

  it('掩码语义：subject 为序列时逐 bar 选择', () => {
    // close>11 为 1/0 序列；subject=1 匹配奇数命中 bar
    const v = plotValues('x = 0\nswitch close > 11\n    1 => x = 1\n    => x = -1\nplot(x)');
    expect(v).toEqual(CLOSES.map((c) => (c > 11 ? 1 : -1)));
  });
});

describe('Pine switch：条件形态（首个命中臂生效）', () => {
  it('臂序优先：close > 12 先于 close > open', () => {
    const v = plotValues('y = 0\nswitch\n    close > 12 => y = 2\n    close > open => y = 1\n    => y = -1\nplot(y)');
    // CLOSES=[10,11,12,11,10,9,10,12,14,13,15,16]；奇 bar 阳线（close>open→1），i≥8 命中首臂
    expect(v).toEqual([-1, 1, -1, 1, -1, 1, -1, 1, 2, 2, 2, 2]);
  });

  it('块体臂：多语句缩进块', () => {
    const v = plotValues('y = 0\nswitch\n    close > 12 =>\n        y = 2\n    =>\n        y = -1\nplot(y)');
    expect(v).toEqual(CLOSES.map((c) => (c > 12 ? 2 : -1)));
  });

  it('掩码语义：未命中 bar 保留变量前值', () => {
    const v = plotValues('x = 0\nswitch\n    close > 11 => x = 1\nplot(x)');
    expect(v).toEqual(CLOSES.map((c) => (c > 11 ? 1 : 0)));
  });
});

describe('Pine varip（向量化离线模型 ≡ var）', () => {
  it('varip 声明与初值', () => {
    const v = plotValues('varip c = 1\nplot(c)');
    expect(v).toEqual(CLOSES.map(() => 1));
  });

  it('varip + if 掩码赋值语义保持', () => {
    const v = plotValues('varip x = 0\nif close > 11\n    x = 1\nplot(x)');
    expect(v).toEqual(CLOSES.map((c) => (c > 11 ? 1 : 0)));
  });
});

describe('Pine strategy 骨架：entry / close / 内置序列', () => {
  const TB = trendBars(1, 6); // closes 100..105，open=close，high=c+1，low=c-1，volume=100
  it('开仓 → 平仓：position_size / netprofit / equity golden 序列', () => {
    const src = [
      'strategy("S", overlay=true)',
      'if close > 102',
      '    strategy.entry("L", strategy.long)',
      'if close > 104',
      '    strategy.close("L")',
      'plot(strategy.position_size)',
      'plot(strategy.netprofit)',
      'plot(strategy.equity)',
    ].join('\n');
    // i=3 (c=103) 开多@103；i=5 (c=105) 平仓 → 已实现 +2
    expect(outputValues(src, 'p0', TB)).toEqual([0, 0, 0, 1, 1, 0]);
    expect(outputValues(src, 'p1', TB)).toEqual([0, 0, 0, 0, 0, 2]);
    expect(outputValues(src, 'p2', TB)).toEqual([0, 0, 0, 0, 1, 2]);
  });

  it('反向开仓先平后反手（收盘价撮合近似）', () => {
    const src = [
      'strategy("R")',
      'if ta.crossover(close, 101)',
      '    strategy.entry("L", strategy.long)',
      'if ta.crossover(close, 103)',
      '    strategy.entry("S", strategy.short)',
      'plot(strategy.position_size)',
      'plot(strategy.netprofit)',
      'plot(strategy.equity)',
    ].join('\n');
    // i=2 (c=102 上穿 101) 多@102；i=4 (c=104 上穿 103) 反手：平多 +2 → 空@104
    expect(outputValues(src, 'p0', TB)).toEqual([0, 0, 1, 1, -1, -1]);
    expect(outputValues(src, 'p1', TB)).toEqual([0, 0, 0, 0, 2, 2]);
    // i=5 equity = 2 + (104-105)×(-1) = 1（空仓浮亏）
    expect(outputValues(src, 'p2', TB)).toEqual([0, 0, 0, 1, 2, 1]);
  });

  it('同 bar 多单按登记序逐笔撮合（对齐 TV 经纪商模拟）', () => {
    // 两条件 i=4 起同时为真：entry L 反手平空(105-104)×(-1)=-1 → 再被 entry S 反手平掉
    const src = [
      'strategy("F")',
      'if close > 101',
      '    strategy.entry("L", strategy.long)',
      'if close > 103',
      '    strategy.entry("S", strategy.short)',
      'plot(strategy.position_size)',
      'plot(strategy.netprofit)',
    ].join('\n');
    expect(outputValues(src, 'p0', TB)).toEqual([0, 0, 1, 1, -1, -1]);
    expect(outputValues(src, 'p1', TB)).toEqual([0, 0, 0, 0, 2, 1]);
  });

  it('strategy.close(id)：id 不匹配不平仓', () => {
    const ok = [
      'strategy("C")',
      'if close > 10',
      '    strategy.entry("L", strategy.long)',
      'if close < 10',
      '    strategy.close("L")',
      'plot(strategy.position_size)',
      'plot(strategy.netprofit)',
    ].join('\n');
    // BARS closes=[10,11,12,11,10,9,10,12,14,13,15,16]：i=1 多@11，i=5 (c=9) 平仓 → -2
    expect(outputValues(ok, 'p0')).toEqual([0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]);
    expect(outputValues(ok, 'p1')).toEqual([0, 0, 0, 0, 0, -2, -2, -2, -2, -2, -2, -2]);
    const mismatch = [
      'strategy("C")',
      'if close > 10',
      '    strategy.entry("L", strategy.long)',
      'strategy.close("X")',
      'plot(strategy.position_size)',
    ].join('\n');
    // close("X") 与持仓 id 不匹配 → 持仓保持
    expect(outputValues(mismatch, 'p0')).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('strategy.exit：stop 对收盘价近似触发', () => {
    const src = [
      'strategy("E")',
      'if close > 10',
      '    strategy.entry("L", strategy.long)',
      'strategy.exit("x", stop=10)',
      'plot(strategy.position_size)',
      'plot(strategy.netprofit)',
    ].join('\n');
    // i=1 多@11；i=4 (c=10 ≤ stop=10) 平仓@10 → -1；i=7 (c=12) 再开多
    expect(outputValues(src, 'p0')).toEqual([0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1]);
    expect(outputValues(src, 'p1')).toEqual([0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1]);
  });

  it('strategy 头解析：名称与 overlay', () => {
    const def = compileOk('strategy("MyStrat", overlay=true)\nplot(close)');
    expect(def.name).toBe('MyStrat');
    expect(def.overlay).toBe(true);
  });

  it('同向重复开仓忽略（pyramiding=0 语义）', () => {
    const src = [
      'strategy("P")',
      'if close > 100',
      '    strategy.entry("L", strategy.long)',
      'plot(strategy.position_size)',
      'plot(strategy.netprofit)',
    ].join('\n');
    // 单边上涨：i=1 起持续持多 1 单位，不加仓
    expect(outputValues(src, 'p0', TB)).toEqual([0, 1, 1, 1, 1, 1]);
    expect(outputValues(src, 'p1', TB)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('脚本体中途引用 strategy.* 内置序列 → dry-run 前置拦截为编译错误', () => {
    const r = compilePine('strategy("B")\nx = strategy.equity\nplot(x)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('strategy.equity');
  });

  it('strategy.exit 无 stop/limit → 编译错误；未知 strategy.* 函数 → 编译错误', () => {
    const noArg = compilePine(
      'strategy("E")\nif close > 10\n    strategy.entry("L", strategy.long)\nstrategy.exit("x")\nplot(close)',
      'test',
    );
    expect(noArg.def).toBeNull();
    const unknown = compilePine('strategy("E")\nstrategy.order("L", strategy.long)\nplot(close)', 'test');
    expect(unknown.def).toBeNull();
    expect(unknown.errors[0].message).toContain('strategy.order');
  });
});

describe('ta.pivothigh / ta.pivotlow（严格枢轴 + 右移 right 根确认）', () => {
  it('pivothigh(close, 1, 1)：i=2/i=8 枢轴在 i=3/i=9 输出', () => {
    const v = plotValues('plot(ta.pivothigh(close, 1, 1))');
    const expectV: Array<number | undefined> = CLOSES.map(() => undefined);
    expectV[3] = 12;
    expectV[9] = 14;
    expect(v).toEqual(expectV);
  });

  it('两参形态缺省 high 源：ta.pivothigh(1, 1)', () => {
    const v = plotValues('plot(ta.pivothigh(1, 1))');
    // high = close+2：[12,13,14,13,12,11,12,14,16,15,17,18] → i=3:14, i=9:16
    const expectV: Array<number | undefined> = CLOSES.map(() => undefined);
    expectV[3] = 14;
    expectV[9] = 16;
    expect(v).toEqual(expectV);
  });

  it('pivotlow(close, 1, 1)：i=5 谷底在 i=6、i=9 谷底在 i=10 输出', () => {
    const v = plotValues('plot(ta.pivotlow(close, 1, 1))');
    // CLOSES：i=5 (9<10,9<10) 谷底；i=9 (13<14,13<15) 谷底
    const expectV: Array<number | undefined> = CLOSES.map(() => undefined);
    expectV[6] = 9;
    expectV[10] = 13;
    expect(v).toEqual(expectV);
  });

  it('相等邻点非严格枢轴（tie 失败）', () => {
    const src: S = [5, 7, 7, 5, 6];
    expect(pivotSeries(src, 1, 1, true)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    const ok: S = [5, 7, 6, 5, 4];
    const out = pivotSeries(ok, 1, 1, true);
    expect(out[2]).toBe(7);
  });

  it('lookback 估算计入 left+right', () => {
    const def = compileOk('plot(ta.pivothigh(close, 20, 20))');
    expect(def.lookback).toBeGreaterThanOrEqual(90);
  });
});

describe('ta.vwap（UTC 日界会话重置）', () => {
  it('单会话累计：vwap = Σ(hlc3·v)/Σv（hlc3=close 的夹具）', () => {
    const v = plotValues('plot(ta.vwap())');
    let pv = 0;
    let vv = 0;
    const expectV = CLOSES.map((c, i) => {
      pv += c * (100 * (i + 1));
      vv += 100 * (i + 1);
      return pv / vv;
    });
    expect(v).toEqual(expectV);
  });

  it('跨 UTC 日界重置：新会话首 bar vwap = 自身 hlc3', () => {
    const bars: Bar[] = [
      { time: Date.UTC(2024, 0, 1, 23, 50), open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { time: Date.UTC(2024, 0, 1, 23, 55), open: 100, high: 103, low: 99, close: 102, volume: 100 },
      { time: Date.UTC(2024, 0, 2, 0, 5), open: 102, high: 106, low: 102, close: 105, volume: 100 },
    ];
    const out = vwapSeries(bars, null);
    // 日 1：((100+101+99)/3=100 与 (103+99+102)/3=101.33.. 的量加权)
    expect(out[0]).toBeCloseTo(100, 10);
    expect(out[1]).toBeCloseTo((100 + 304 / 3) / 2, 10);
    // 日 2 重置：仅第三根自身
    expect(out[2]).toBeCloseTo((106 + 102 + 105) / 3, 10);
  });

  it('脚本级 ta.vwap(close) 与直接实现同口径', () => {
    const v = plotValues('plot(ta.vwap(close))');
    const out = vwapSeries(
      BARS,
      CLOSES.map((c) => c),
    );
    expect(v).toEqual(out);
  });

  it('量为 0 的 bar 不计入累计且输出 undefined（外汇量能边界）', () => {
    const bars: Bar[] = [
      { time: Date.UTC(2024, 0, 1, 10), open: 1, high: 2, low: 1, close: 2, volume: 0 },
      { time: Date.UTC(2024, 0, 1, 11), open: 2, high: 3, low: 2, close: 3, volume: 100 },
    ];
    const out = vwapSeries(bars, null);
    expect(out[0]).toBeUndefined();
    // hlc3 = (3+2+3)/3 = 8/3（src 缺省 hlc3 而非 close）
    expect(out[1]).toBeCloseTo(8 / 3, 10);
  });
});
