import { describe, expect, it } from 'vitest';
import { compilePine, DEFAULT_PINE_SCRIPT } from '@/indicators/pine/compile';
import type { Bar } from '@/types/market';
import type { ParamValue } from '@/indicators/core/types';

/**
 * Pine v5 子集编译器黄金用例（A3-4）。
 * 覆盖：表达式四则/比较/逻辑、10 个 ta 函数、赋值+plot+input、错误用例。
 * 全部基于固定 K 线夹具与手算期望值（golden），不依赖运行时随机。
 */

const T0 = new Date(2024, 0, 8, 9, 30, 0).getTime();
const IV = 60_000;

/** 固定收盘序列：10,11,12,11,10,9,10,12,14,13,15,16；奇 bar 阳线、偶 bar 阴线 */
const CLOSES = [10, 11, 12, 11, 10, 9, 10, 12, 14, 13, 15, 16];
const BARS: Bar[] = CLOSES.map((c, i) => ({
  time: T0 + i * IV,
  open: i % 2 === 0 ? c + 1 : c - 1, // 偶 bar 阴线（open>close），奇 bar 阳线
  high: c + 2,
  low: c - 2,
  close: c,
  volume: 100 * (i + 1),
}));

/** 严格递增/递减收盘序列（RSI 黄金值用） */
function trendBars(dir: 1 | -1): Bar[] {
  return CLOSES.map((_, i) => {
    const c = 100 + dir * i;
    return { time: T0 + i * IV, open: c, high: c + 1, low: c - 1, close: c, volume: 100 };
  });
}

function compileOk(src: string) {
  const r = compilePine(src, 'test');
  expect(r.errors).toEqual([]);
  expect(r.def).not.toBeNull();
  return r.def!;
}

function plotValues(src: string, bars: Bar[] = BARS, params?: Record<string, ParamValue>): Array<number | undefined> {
  const def = compileOk(src);
  const out = def.compute(bars, params ?? {});
  return out.p0;
}

describe('Pine 表达式：四则 / 比较 / 逻辑', () => {
  it('四则运算与优先级（先乘除后加减，括号优先）', () => {
    expect(plotValues('plot(1 + 2 * 3)')).toEqual(CLOSES.map(() => 7));
    expect(plotValues('plot((1 + 2) * 3)')).toEqual(CLOSES.map(() => 9));
    expect(plotValues('plot(10 / 4)')).toEqual(CLOSES.map(() => 2.5));
    expect(plotValues('plot(10 - 20)')).toEqual(CLOSES.map(() => -10));
  });

  it('一元负号与数字字面量下划线分隔', () => {
    expect(plotValues('plot(-close)')![0]).toBe(-10);
    expect(plotValues('plot(1_000 + 1)')![0]).toBe(1001);
  });

  it('比较运算产出 1/0 布尔序列', () => {
    // 奇 bar 阳线（close>open）→ 1；偶 bar 阴线 → 0
    expect(plotValues('plot(close > open)')).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : 0)));
    expect(plotValues('plot(close >= close)')).toEqual(CLOSES.map(() => 1));
    expect(plotValues('plot(close != open)')).toEqual(CLOSES.map(() => 1));
    expect(plotValues('plot(close < open)')).toEqual(CLOSES.map((_, i) => (i % 2 === 0 ? 1 : 0)));
  });

  it('逻辑运算：and / or / not', () => {
    expect(plotValues('plot(close > open and volume > 0)')).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : 0)));
    expect(plotValues('plot(close > open or close < open)')).toEqual(CLOSES.map(() => 1));
    expect(plotValues('plot(not (close > open))')).toEqual(CLOSES.map((_, i) => (i % 2 === 0 ? 1 : 0)));
  });

  it('除零返回 undefined（不抛错、不透传 0）', () => {
    expect(plotValues('plot(close / 0)').every((v) => v === undefined)).toBe(true);
  });

  it('hl2/hlc3/ohlc4 源序列', () => {
    expect(plotValues('plot(hl2)')[0]).toBeCloseTo((12 + 8) / 2, 10); // bar0: high 12, low 8
    expect(plotValues('plot(hlc3)')[0]).toBeCloseTo((12 + 8 + 10) / 3, 10);
    expect(plotValues('plot(ohlc4)')[0]).toBeCloseTo((11 + 12 + 8 + 10) / 4, 10); // open 11
  });
});

describe('Pine ta 函数（10 个各一例，手算黄金值）', () => {
  it('ta.sma：窗口均值，窗口未满为 undefined', () => {
    const v = plotValues('plot(ta.sma(close, 3))');
    expect(v[0]).toBeUndefined();
    expect(v[1]).toBeUndefined();
    expect(v[2]).toBeCloseTo((10 + 11 + 12) / 3, 10);
    expect(v[11]).toBeCloseTo((13 + 15 + 16) / 3, 10);
  });

  it('ta.ema：SMA 播种后按 k=2/(n+1) 递推', () => {
    const v = plotValues('plot(ta.ema(close, 3))')!;
    expect(v[2]).toBeCloseTo(11, 10); // 播种 = 前 3 均值
    expect(v[3]).toBeCloseTo(11 * 0.5 + 11 * 0.5, 10); // k=0.5：close3=11
    expect(v[4]).toBeCloseTo(10 * 0.5 + 11 * 0.5, 10); // close4=10
    expect(v[5]).toBeCloseTo(9 * 0.5 + 10.5 * 0.5, 10); // close5=9
  });

  it('ta.rsi：单边上涨 100、单边下跌 0', () => {
    expect(plotValues('plot(ta.rsi(close, 3))', trendBars(1))[3]).toBe(100);
    expect(plotValues('plot(ta.rsi(close, 3))', trendBars(-1))[3]).toBe(0);
  });

  it('ta.stdev：总体标准差', () => {
    const v = plotValues('plot(ta.stdev(close, 3))')!;
    // 窗口 [10,11,12]：均值 11，方差 (1+0+1)/3 → sd ≈ 0.8165
    expect(v[2]).toBeCloseTo(Math.sqrt(2 / 3), 10);
  });

  it('ta.highest / ta.lowest：窗口极值', () => {
    expect(plotValues('plot(ta.highest(high, 3))')[2]).toBe(14); // highs: 12,13,14
    expect(plotValues('plot(ta.lowest(low, 3))')[2]).toBe(8); // lows: 8,9,10
  });

  it('ta.change：n 期差值', () => {
    const v1 = plotValues('plot(ta.change(close, 1))')!;
    expect(v1[0]).toBeUndefined();
    expect(v1[1]).toBe(1);
    expect(v1[3]).toBe(-1);
    const v2 = plotValues('plot(ta.change(close, 2))')!;
    expect(v2[2]).toBe(2); // 12 - 10
  });

  it('ta.crossover / ta.crossunder：上穿/下沿瞬间为 1', () => {
    // i=0 无前值 → undefined；close 上穿 open：奇 bar（1,3,5,7,9,11）
    expect(plotValues('plot(ta.crossover(close, open))')).toEqual([
      undefined, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
    ]);
    // close 下穿 open：偶 bar（2,4,6,8,10）
    expect(plotValues('plot(ta.crossunder(close, open))')).toEqual([
      undefined, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
    ]);
  });

  it('ta.nz：undefined 替换为 0', () => {
    const v = plotValues('plot(ta.nz(ta.sma(close, 3)))')!;
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(0);
    expect(v[2]).toBeCloseTo(11, 10);
  });
});

describe('Pine 赋值 / plot / input', () => {
  it('赋值 + plot：plot 标题取自位置参数字符串', () => {
    const def = compileOk('ma = ta.sma(close, 2)\nplot(ma, "均线")');
    expect(def.plots).toHaveLength(1);
    expect(def.plots[0].label).toBe('均线');
    const out = def.compute(BARS, {});
    expect(out.p0[1]).toBeCloseTo((10 + 11) / 2, 10);
  });

  it('多 plot：按序生成 p0/p1', () => {
    const def = compileOk('plot(close, "收")\nplot(open, "开")');
    expect(def.plots.map((p) => p.label)).toEqual(['收', '开']);
    const out = def.compute(BARS, {});
    expect(out.p1[0]).toBe(11); // open
  });

  it('input.int：参数元数据 + compute 期注入覆盖默认值', () => {
    const def = compileOk('len = input.int(3, "周期", minval=1, maxval=200)\nplot(ta.sma(close, len))');
    // 现状：input.int 仅识别 title=/defval= 关键字形式的位置标签，位置参数字符串回退为 key
    expect(def.params).toEqual([
      { key: 'len', label: 'len', type: 'number', default: 3, min: 1, max: 200, step: 1 },
    ]);
    // 默认 len=3 → 窗口 3（compute 期需注入全部 input 参数，与面板管线一致）
    expect((def.compute(BARS, { len: 3 }).p0 as number[])[2]).toBeCloseTo(11, 10);
    // 覆盖 len=2 → 窗口 2
    expect(def.compute(BARS, { len: 2 }).p0[1]).toBeCloseTo(10.5, 10);
  });

  it('input.source / input.bool：下拉与开关参数', () => {
    const def = compileOk('src = input.source(close, "源")\nflag = input.bool(true, "开关")\nplot(src)');
    expect(def.params[0]).toMatchObject({ key: 'src', type: 'select', default: 'close' });
    expect(def.params[1]).toMatchObject({ key: 'flag', type: 'boolean', default: true });
    expect(def.compute(BARS, { src: 'high', flag: false }).p0[0]).toBe(12); // 源切到 high
  });

  it('indicator() 头部：名称与 overlay', () => {
    const def = compileOk('indicator("我的指标", overlay=true)\nplot(close)');
    expect(def.name).toBe('我的指标');
    expect(def.overlay).toBe(true);
    expect(def.category).toBe('自定义');
  });

  it('lookback：基线 100 起步，取最大字面量周期 + 50，封顶 2000', () => {
    // acc.max 初值 100 → 任何脚本 lookback 下限 150
    expect(compileOk('plot(ta.sma(close, 20))').lookback).toBe(150);
    expect(compileOk('plot(ta.sma(close, 100))').lookback).toBe(150);
    expect(compileOk('x = ta.sma(close, 50)\nplot(ta.ema(x, 30))').lookback).toBe(150); // max(100,50,30)=100
    expect(compileOk('plot(ta.sma(close, 200))').lookback).toBe(250);
    expect(compileOk('plot(ta.sma(close, 5000))').lookback).toBe(2000);
  });

  it('plot 样式：histogram / color / linewidth', () => {
    const def = compileOk('plot(close, "柱", style=plot.style_histogram, color=color.orange, linewidth=3)');
    expect(def.plots[0].style).toMatchObject({ kind: 'histogram' });
    expect(def.plots[0].style.color).toBe('#ff9800');
    const line = compileOk('plot(close, "线", color=#123456, linewidth=2)');
    expect(line.plots[0].style).toMatchObject({ kind: 'line', color: '#123456', lineWidth: 2 });
  });

  it('DEFAULT_PINE_SCRIPT（双均线交叉）编译通过', () => {
    const def = compileOk(DEFAULT_PINE_SCRIPT);
    expect(def.name).toBe('双均线交叉');
    expect(def.overlay).toBe(true);
    expect(def.plots.map((p) => p.label)).toEqual(['快线', '慢线']);
    expect(def.params).toHaveLength(3);
    const out = def.compute(BARS, { fast: 2, slow: 3, src: 'close' });
    expect(out.p0[1]).toBeCloseTo((10 + 11) / 2, 10); // ema(src,2)：播种=前2均值
  });
});

describe('Pine 错误用例', () => {
  it('语法错误：表达式意外结束 → 收集错误，def 为 null', () => {
    const r = compilePine('plot(1 +)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(1);
  });

  it('未定义变量 → 指名报错', () => {
    const r = compilePine('plot(foo + 1)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toBe('未定义的标识符: foo');
  });

  it('不支持的函数 → 指名报错', () => {
    const r = compilePine('plot(ta.wma(close, 3))', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toBe('不支持的函数「ta.wma」');
  });

  it('缺少 plot() → 报错', () => {
    const r = compilePine('x = 1', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toBe('脚本缺少 plot() 调用');
  });

  it('不支持的语句 → 指名报错（带行号）', () => {
    const r = compilePine('// 注释\nif close > open\nplot(close)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0]).toMatchObject({ line: 2 });
    expect(r.errors[0].message).toContain('不支持的语句');
  });

  it('无法识别的字符 → 报错且行号正确', () => {
    const r = compilePine('plot(close)\nplot(close @ 1)', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].line).toBe(2);
  });

  it('注释行与空行被跳过；行号按源行计', () => {
    const r = compilePine('//@version=5\n\n// 说明\nplot(undefined_var)', 'test');
    expect(r.errors[0].line).toBe(4);
  });
});
