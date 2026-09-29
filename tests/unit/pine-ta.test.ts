import { describe, expect, it } from 'vitest';
import { compilePine } from '@/indicators/pine/compile';
import { BARS, CLOSES, compileOk, plotValues, trendBars } from './helpers/pine-fixture';

/**
 * Pine ta.* 扩容 golden 用例（21 个新增函数，固定输入 → 手算参考输出）。
 * 约定：EMA/Wilder 以 SMA 播种（与本项目 series.ts / core/math 同源）；
 * 窗口未满为 undefined；输入含洞的窗口不产出。
 */

describe('ta 均线族', () => {
  it('ta.wma：线性加权，窗口未满 undefined', () => {
    const v = plotValues('plot(ta.wma(close, 3))');
    expect(v[1]).toBeUndefined();
    expect(v[2]).toBeCloseTo((10 * 1 + 11 * 2 + 12 * 3) / 6, 10);
    expect(v[11]).toBeCloseTo((13 * 1 + 15 * 2 + 16 * 3) / 6, 10);
  });

  it('ta.hma：wma(2·wma(x,n/2) - wma(x,n), √n)，n=4', () => {
    const v = plotValues('plot(ta.hma(close, 4))');
    // raw[3] = 2·wma2[3] - wma4[3] = 2·11.3333 - 11.2 = 11.4667
    // raw[4] = 2·wma2[4] - wma4[4] = 2·10.3333 - 10.8 = 9.8667
    expect(v[3]).toBeUndefined(); // 首个 wma2 值所在窗口含洞
    expect(v[4]).toBeCloseTo(10.4, 6); // (11.4667 + 2·9.8667)/3
    expect(v[11]).toBeCloseTo(15.8778, 4);
  });

  it('ta.vwma：成交量加权均值', () => {
    const v = plotValues('plot(ta.vwma(close, 3))');
    expect(v[2]).toBeCloseTo((10 * 100 + 11 * 200 + 12 * 300) / 600, 10);
  });

  it('ta.dema：2·EMA1 - EMA(EMA1)，n=3', () => {
    const v = plotValues('plot(ta.dema(close, 3))');
    // e1[7]=10.9375；e2 播种(11,11,10.5)/3=10.8333 → e2[7]=10.5104167
    expect(v[7]).toBeCloseTo(11.3645833, 6);
  });

  it('ta.tema：3·E1 - 3·E2 + E3，n=3', () => {
    const v = plotValues('plot(ta.tema(close, 3))');
    expect(v[7]).toBeCloseTo(11.7378472, 6);
  });

  it('ta.rma：Wilder 平滑（稠密输入与 core.wilder 同源）', () => {
    const v = plotValues('plot(ta.rma(close, 3))');
    expect(v[2]).toBeCloseTo(11, 10); // SMA 播种
    expect(v[4]).toBeCloseTo((11 * 2 + 10) / 3, 10);
  });
});

describe('ta 波幅 / 通道（K 线依赖）', () => {
  it('ta.tr：max(h-l, |h-pc|, |l-pc|)，首根 h-l（夹具恒为 4）', () => {
    const v = plotValues('plot(ta.tr())');
    expect(v.every((x) => x === 4)).toBe(true);
  });

  it('ta.atr：TR 的 Wilder 平滑', () => {
    const v = plotValues('plot(ta.atr(3))');
    expect(v[1]).toBeUndefined();
    expect(v[2]).toBeCloseTo(4, 10);
    expect(v[11]).toBeCloseTo(4, 10);
  });

  it('ta.bb / ta.bbands：[mid, upper, lower] 元组，dev=总体标准差', () => {
    const def = compileOk('[m, u, l] = ta.bb(close, 3, 2)\nplot(m)\nplot(u)\nplot(l)');
    const out = def.compute(BARS, {});
    const dev = Math.sqrt(2 / 3);
    expect(out.p0![2]).toBeCloseTo(11, 10);
    expect(out.p1![2]).toBeCloseTo(11 + 2 * dev, 10);
    expect(out.p2![2]).toBeCloseTo(11 - 2 * dev, 10);
  });

  it('ta.kc：[mid, upper, lower]，range=ATR（夹具恒 4）', () => {
    const def = compileOk('[m, u, l] = ta.kc(close, 3, 2)\nplot(m)\nplot(u)\nplot(l)');
    const out = def.compute(BARS, {});
    expect(out.p0![2]).toBeCloseTo(11, 10); // ema(close,3) 播种
    expect(out.p1![2]).toBeCloseTo(11 + 8, 10);
    expect(out.p2![2]).toBeCloseTo(11 - 8, 10);
  });

  it('ta.donchian：[mid, upper, lower] 基于 high/low 窗口极值', () => {
    const def = compileOk('[m, u, l] = ta.donchian(3)\nplot(m)\nplot(u)\nplot(l)');
    const out = def.compute(BARS, {});
    expect(out.p1![2]).toBe(14); // highs 12,13,14
    expect(out.p2![2]).toBe(8); // lows 8,9,10
    expect(out.p0![2]).toBe(11);
  });
});

describe('ta 动量 / 震荡', () => {
  it('ta.adx：单边上涨 → DX 恒 100 → ADX=100', () => {
    const v = plotValues('plot(ta.adx(3, 2))', trendBars(1));
    expect(v[2]).toBeUndefined(); // adxLen=2 播种需 2 个 dx
    expect(v[3]).toBeCloseTo(100, 10);
  });

  it('ta.cci：(TP - SMA) / (0.015·MAD)，TP=close（夹具）', () => {
    const v = plotValues('plot(ta.cci(3))');
    expect(v[2]).toBeCloseTo(100, 6); // (12-11)/(0.015·(2/3))
    expect(v[3]).toBeCloseTo(-50, 6);
  });

  it('ta.mfi：窗口资金流比；单边上涨 → 100', () => {
    const v = plotValues('plot(ta.mfi(3))');
    // i=3：pos=11·200+12·300=5800，neg=11·400=4400 → 100-100/(1+5800/4400)
    expect(v[3]).toBeCloseTo(56.8627, 3);
    expect(plotValues('plot(ta.mfi(3))', trendBars(1))[5]).toBe(100);
  });

  it('ta.wpr：-100·(HH-C)/(HH-LL)', () => {
    const v = plotValues('plot(ta.wpr(3))');
    expect(v[2]).toBeCloseTo((-100 * (14 - 12)) / (14 - 8), 10);
  });

  it('ta.tsi：100·EMA(EMA(Δ,long),short)/EMA(EMA(|Δ|,long),short)，short=2/long=3', () => {
    const v = plotValues('plot(ta.tsi(close, 2, 3))');
    // num[7]=0.709876（EMA n=2 播种=前 2 个定义值均值），den[7]=1.333333
    expect(v[7]).toBeCloseTo(53.2407, 4);
  });

  it('ta.fisher：Fisher 变换（递归平滑），n=5', () => {
    const v = plotValues('plot(ta.fisher(close, 5))');
    // i=4：窗口 [10,11,12,11,10]，v=10 → x=0.66·(-0.5)=-0.33 → 0.5·ln(0.67/1.33)
    expect(v[4]).toBeCloseTo(-0.34283, 4);
  });

  it('ta.linreg：窗口线性回归末端值；offset 回溯', () => {
    expect(plotValues('plot(ta.linreg(close, 3))')[2]).toBe(12); // 完美直线
    expect(plotValues('plot(ta.linreg(close, 3))')[3]).toBeCloseTo(34 / 3, 10); // 斜率 0 → 均值
    expect(plotValues('plot(ta.linreg(close, 3, 1))')[2]).toBe(11); // x=1 处取值
  });
});

describe('ta 趋势跟随', () => {
  it('ta.psar：上升趋势 SAR 贴合低点并逐步抬升', () => {
    const v = plotValues('plot(ta.psar(0.02, 0.02, 0.2))', trendBars(1));
    expect(v[0]).toBeUndefined();
    expect(v[1]).toBeCloseTo(99, 10);
    expect(v[2]).toBeCloseTo(99.06, 6);
    expect(v[3]).toBeCloseTo(99.2176, 6);
  });

  it('ta.supertrend：上升趋势 direction=-1，ST 为上移的下轨', () => {
    const def = compileOk('[st, dir] = ta.supertrend(2, 3)\nplot(st, "st")\nplot(dir, "dir")');
    const out = def.compute(BARS, {});
    expect(out.p0![2]).toBeCloseTo(4, 10); // c-2·atr = 12-8
    expect(out.p0![7]).toBeCloseTo(4, 10); // 跟随抬升前的持稳段
    expect(out.p0![8]).toBeCloseTo(6, 10); // dn=14-8 抬升
    expect(out.p0![11]).toBeCloseTo(8, 10);
    expect(out.p1![11]).toBe(-1); // 多头方向
  });

  it('ta.macd：dif=EMA快-EMA慢，dea=EMA(dif,signal)，hist=dif-dea', () => {
    const def = compileOk('[d, s, h] = ta.macd(close, 2, 4, 3)\nplot(d)\nplot(s)\nplot(h)');
    const out = def.compute(BARS, {});
    expect(out.p0![3]).toBeCloseTo(1 / 6, 6);
    expect(out.p1![5]).toBeCloseTo(-0.180494, 5);
    expect(out.p2![7]).toBeCloseTo(0.327908, 5);
  });
});

describe('ta 新增函数错误路径', () => {
  it('元组函数单值调用 → 运行期校验失败（前置）', () => {
    const r = compilePine('plot(ta.bb(close, 3))', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('多序列');
  });

  it('周期参数非正整数 → 运行期校验失败（前置）', () => {
    const r = compilePine('plot(ta.wma(close, 0))', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('运行期校验失败');
  });

  it('参数数量不足 → 编译期报错', () => {
    const r = compilePine('plot(ta.psar(0.02, 0.02))', 'test');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('参数数量');
  });
});
