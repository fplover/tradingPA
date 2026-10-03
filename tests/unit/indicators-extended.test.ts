import { describe, expect, it } from 'vitest';
import { getIndicatorDef } from '@/indicators/registry';
import { IndicatorInstance } from '@/indicators/core/instance';
import type { Bar } from '@/types/market';

function ramp(n: number, volume?: (i: number) => number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 1; i <= n; i++) {
    bars.push({ time: i * 60_000, open: i, high: i + 1, low: i - 1, close: i, volume: volume ? volume(i) : 100 });
  }
  return bars;
}

function custom(rows: Array<[number, number, number, number, number]>): Bar[] {
  // [open, high, low, close, volume]
  return rows.map(([o, h, l, c, v], i) => ({ time: (i + 1) * 60_000, open: o, high: h, low: l, close: c, volume: v }));
}

function compute(id: string, bars: Bar[], params?: Record<string, string | number | boolean>) {
  const def = getIndicatorDef(id);
  if (!def) throw new Error(`指标不存在: ${id}`);
  return new IndicatorInstance(def, { params }).computeWindow(bars, 0, bars.length - 1).outputs;
}

const SD3 = Math.sqrt(2 / 3); // 收盘 1,2,3 的总体标准差

describe('P1-A 趋势扩充金标准', () => {
  it('Alligator：SMMA(hl2) 种子为 SMA', () => {
    const out = compute('alligator', ramp(20));
    expect(out.jaw![12]).toBeCloseTo(7, 10); // SMA(1..13)
    expect(out.jaw![13]).toBeCloseTo(98 / 13, 10); // (7*12+14)/13
    expect(out.teeth![7]).toBeCloseTo(4.5, 10);
    expect(out.teeth![8]).toBeCloseTo(5.0625, 10);
    expect(out.lips![4]).toBeCloseTo(3, 10);
    expect(out.lips![5]).toBeCloseTo(3.6, 10);
  });

  it('McGinley：自适应除数 (c/prev)^4', () => {
    const bars = custom([
      [100, 101, 99, 100, 100],
      [110, 111, 109, 110, 100],
    ]);
    const out = compute('mcginley', bars, { length: 10 });
    // md1 = 100 + 10 / (10 × 1.1^4)
    expect(out.md![1]).toBeCloseTo(100 + 10 / (10 * Math.pow(1.1, 4)), 10);
  });

  it('Vortex：VI+/VI- = Σ|跨bar极差| / ΣTR（ramp 下 1.5/0.5）', () => {
    const out = compute('vortex', ramp(10), { length: 2 });
    expect(out.vip![9]).toBeCloseTo(1.5, 10);
    expect(out.vim![9]).toBeCloseTo(0.5, 10);
    expect(out.vip![1]).toBeUndefined();
  });

  it('Aroon Oscillator：Up−Down', () => {
    const out = compute('aroon-osc', ramp(10), { length: 3 });
    // 创新高 Up=100；最低在窗口首根 Down=(3-2)/3
    expect(out.osc![9]).toBeCloseTo(100 - (100 * 1) / 3, 10);
  });

  it('Linear Regression：完美线性拟合等于收盘', () => {
    const out = compute('linreg', ramp(10), { length: 3 });
    expect(out.linreg![2]).toBeCloseTo(3, 10);
    expect(out.linreg![9]).toBeCloseTo(10, 10);
    expect(out.linreg![1]).toBeUndefined();
  });
});

describe('P1-A 动量扩充金标准', () => {
  const bars = ramp(10);

  it('ROC', () => {
    const out = compute('roc', bars, { length: 3 });
    expect(out.roc![2]).toBeUndefined();
    expect(out.roc![9]).toBeCloseTo(300 / 7, 10);
  });

  it('MOM', () => {
    const out = compute('mom', bars, { length: 3 });
    expect(out.mom![2]).toBeUndefined();
    expect(out.mom![9]).toBe(3);
  });

  it('CMO：单边上涨为 100', () => {
    const out = compute('cmo', bars, { length: 3 });
    expect(out.cmo![2]).toBeUndefined();
    expect(out.cmo![9]).toBe(100);
  });

  it('DPO：close − SMA(close, p)[p/2+1]（TV 定义，窗口为全周期）', () => {
    const out = compute('dpo', bars, { length: 4 });
    // shift = 3，首个有效值在 i = shift + p - 1 = 6
    expect(out.dpo![5]).toBeUndefined();
    expect(out.dpo![6]).toBeCloseTo(7 - 2.5, 10); // 7 − SMA(close 1..4)
    expect(out.dpo![9]).toBeCloseTo(10 - 5.5, 10); // 10 − SMA(close 3..6)
  });

  it('BOP：(close−open)/(high−low)', () => {
    const out = compute('bop', custom([[10, 12, 8, 11, 100]]), { length: 1 });
    expect(out.bop![0]).toBeCloseTo(0.25, 10);
  });

  it('TRIX：三重 EMA 的环比（p=1 退化为 ROC(1)）', () => {
    const out = compute('trix', bars, { length: 1, signal: 1 });
    expect(out.trix![0]).toBeUndefined();
    expect(out.trix![1]).toBeCloseTo(100, 10);
    expect(out.trix![9]).toBeCloseTo(100 / 9, 10);
    expect(out.signal![9]).toBeCloseTo(100 / 9, 10);
  });

  it('TSI：动量/|动量| 双重 RMA（p=1 退化为符号）', () => {
    const out = compute(
      'tsi',
      custom([
        [10, 11, 9, 10, 100],
        [10, 13, 11, 12, 100],
        [10, 12, 10, 11, 100],
      ]),
      { long: 1, short: 1 },
    );
    expect(out.tsi![1]).toBe(100);
    expect(out.tsi![2]).toBe(-100);
  });

  it('Fisher：Ehlers 递推（hl2 = 10,12,8, p=2）', () => {
    const barsF = custom([
      [10, 11, 9, 10, 100],
      [10, 13, 11, 12, 100],
      [10, 9, 7, 8, 100],
    ]);
    const out = compute('fisher', barsF, { length: 2 });
    // p=2 时 i=0 无窗口 → undefined；value: 0.33, −0.1089
    // fisher = atanh(v) + 0.5·fisher[1]（Ehlers；第四轮审查修正，此前漏了递归项）
    expect(out.fisher![0]).toBeUndefined();
    expect(out.fisher![1]).toBeCloseTo(0.3428283, 5); // 首个点 prevFisher=0 → 与 atanh(v1) 相同
    expect(out.fisher![2]).toBeCloseTo(0.0620806, 5); // atanh(−0.1089) + 0.5·0.3428283
    // trigger = 上一根 fisher（TradingView 定义）：i=1 尚无前值 → undefined
    expect(out.trigger![1]).toBeUndefined();
    expect(out.trigger![2]).toBeCloseTo(0.3428283, 5);
  });

  /**
   * ADX 专项（第四轮审查发现）：此前把 DX 的未就绪段补 0 再 Wilder 平滑，
   * 种子被摊薄到真值的 1/smoothing（smoothing=5 时首个 ADX ≈ 20 而非 100）。
   * 单边上涨时 plusDI>0 且 minusDI=0 → **DX 恒为 100**，故 ADX 从首个有值点
   * 起就必须是 100——这条判据不依赖实现细节，只依赖 DX 的定义。
   * 注：修复前 ADX 在此前没有任何金标准用例（`-t ADX` 零匹配），缺陷因此长期存活。
   */
  it('ADX：单边上涨时从首个有值点起即为 100（未被未就绪段零填充摊薄）', () => {
    const up: Bar[] = [];
    for (let i = 0; i < 40; i++) {
      const base = 100 + i * 2;
      up.push({ time: i * 60_000, open: base, high: base + 1, low: base - 1, close: base + 0.5, volume: 100 });
    }
    const out = compute('adx', up, { length: 5, smoothing: 5 });
    const defined = out.adx!.filter((v): v is number => v !== undefined);
    expect(defined.length).toBeGreaterThan(5);
    for (const v of defined) expect(v).toBeCloseTo(100, 6);
    // 判别力自检：旧实现（补 0 后平滑）的首值约为 100/smoothing = 20
    expect(defined[0]!).toBeGreaterThan(95);
  });

  it('KST：四段 ROC 加权和（等长 ROC=2 解析值）', () => {
    const out = compute('kst', ramp(30), { roc1: 2, roc2: 2, roc3: 2, roc4: 2, signal: 9 });
    // t1..t3 = 8.64126（200/10·Σ_{j=19..28}1/j）；t4 = 9.96050（200/15·Σ_{j=14..28}1/j）
    // kst = 6·t1 + 4·t4 = 91.6895
    expect(out.kst![29]).toBeCloseTo(91.6895, 3);
    expect(out.kst![13]).toBeUndefined(); // t4 需 15+2 根
  });

  it('Coppock：WMA(ROC(slow)+ROC(fast))', () => {
    const out = compute('coppock', ramp(10), { fast: 2, slow: 3, length: 2 });
    expect(out.coppock![2]).toBeUndefined();
    // sum[3]=400, sum[4]=650/3 → (1×400+2×650/3)/3 = 2500/9
    expect(out.coppock![4]).toBeCloseTo(2500 / 9, 10);
  });

  it('PPO：100×(EMA快−EMA慢)/EMA慢', () => {
    const out = compute('ppo', bars, { fast: 3, slow: 5, signal: 2 });
    expect(out.ppo![9]).toBeCloseTo(12.5, 10); // ema3=9, ema5=8
  });
});

describe('P1-A 波动扩充金标准', () => {
  const bars = ramp(10);

  it('NATR：100×ATR/close', () => {
    const out = compute('natr', bars, { length: 3 });
    expect(out.natr![2]).toBeCloseTo(200 / 3, 10);
    expect(out.natr![9]).toBeCloseTo(20, 10); // ATR=2, close=10
  });

  it('Stdev：总体标准差', () => {
    const out = compute('stdev', bars, { length: 3 });
    expect(out.sd![2]).toBeCloseTo(SD3, 10);
  });

  it('BBWidth：200·m·sd/basis', () => {
    const out = compute('bb-width', bars, { length: 3, mult: 2 });
    expect(out.bbw![2]).toBeCloseTo((100 * 4 * SD3) / 2, 10);
  });

  it('Percent B：(c−lower)/(upper−lower)×100', () => {
    const out = compute('percent-b', bars, { length: 3, mult: 2 });
    const expected = ((3 - (2 - 2 * SD3)) / (4 * SD3)) * 100;
    expect(out.pb![2]).toBeCloseTo(expected, 10);
  });

  it('Choppiness：100·log10(ΣTR/区间)/log10(p)', () => {
    const out = compute('choppiness', bars, { length: 3 });
    const expected = (100 * Math.log10(6 / 4)) / Math.log10(3);
    expect(out.chop![2]).toBeCloseTo(expected, 10);
  });

  it('Mass Index：Σ EMA9(r)/EMA9(EMA9(r))（恒定振幅从第 17 根起 ratio=1）', () => {
    const flat = Array.from({ length: 30 }, (_, i) => ({
      time: (i + 1) * 60_000,
      open: 10,
      high: 12,
      low: 8,
      close: 10,
      volume: 100,
    }));
    const out = compute('mass-index', flat);
    // 独立闭式参考：single 自 i=8 起恒 4；double 种子 4/9，d(i)=4−(32/9)·0.8^(i−8)
    // ratio(i) = 1/(1−(8/9)·0.8^(i−8))（i≥8，否则 0）
    const expectMi = (n: number): number => {
      let s = 0;
      for (let i = 0; i <= n; i++) s += i < 8 ? 0 : 1 / (1 - (8 / 9) * Math.pow(0.8, i - 8));
      return s;
    };
    expect(out.mi![23]).toBeUndefined();
    expect(out.mi![24]).toBeCloseTo(expectMi(24), 8);
    expect(out.mi![29]).toBeCloseTo(expectMi(29), 8);
  });

  it('HistVol：100·Stdev(对数收益)·√年化因子', () => {
    const out = compute('hist-vol', bars, { length: 3, annual: 1 });
    expect(out.hv![2]).toBeUndefined();
    const expected =
      100 *
      Math.sqrt(
        ((Math.log(2) - 0.4620981) ** 2 + (Math.log(1.5) - 0.4620981) ** 2 + (Math.log(4 / 3) - 0.4620981) ** 2) / 3,
      );
    expect(out.hv![3]).toBeCloseTo(expected, 8);
  });
});

describe('P1-A 量能扩充金标准', () => {
  it('A/D：CLV×Vol 累计', () => {
    const out = compute(
      'adl',
      custom([
        [10, 12, 8, 11, 100],
        [11, 13, 9, 9, 100],
        [9, 10, 7, 10, 100],
      ]),
    );
    expect(out.adl![0]).toBeCloseTo(50, 10);
    expect(out.adl![1]).toBeCloseTo(-50, 10);
    expect(out.adl![2]).toBeCloseTo(50, 10);
  });

  it('Chaikin Osc：EMA(ADL,f)−EMA(ADL,s)', () => {
    const out = compute(
      'chaikin-osc',
      custom([
        [10, 12, 8, 11, 100],
        [11, 13, 9, 9, 100],
        [9, 10, 7, 10, 100],
      ]),
      { fast: 2, slow: 3 },
    );
    expect(out.osc![2]).toBeCloseTo(50 / 3, 10);
  });

  it('Elder Ray：high/low − EMA(close)', () => {
    const flat = Array.from({ length: 15 }, (_, i) => ({
      time: (i + 1) * 60_000,
      open: 100,
      high: 102,
      low: 98,
      close: 100,
      volume: 100,
    }));
    const out = compute('elder-ray', flat, { length: 13 });
    expect(out.bull![12]).toBeCloseTo(2, 10);
    expect(out.bear![12]).toBeCloseTo(-2, 10);
  });

  it('Klinger：VF=Vol×Trend×CM，EMA快−EMA慢（解析小样本）', () => {
    const bars = custom([
      [9, 10, 8, 9, 1],
      [10, 11, 9, 10, 2],
      [11, 12, 10, 11, 3],
      [10, 11, 9, 10, 4],
      [9, 10, 8, 9, 5],
    ]);
    const out = compute('klinger', bars, { fast: 2, slow: 3, signal: 2 });
    // vf = [-2,4,12,-8,-20] → kvo = [·,·,11/3,−8/9,−181/54]
    expect(out.kvo![2]).toBeCloseTo(11 / 3, 8);
    expect(out.kvo![3]).toBeCloseTo(-8 / 9, 8);
    expect(out.kvo![4]).toBeCloseTo(-181 / 54, 8);
    // signal 的 EMA 以填充零序列种子启动（与 MACD signal 同约定）
    expect(out.signal![4]).toBeCloseTo(-175 / 81, 8);
  });

  it('Volume Osc：100×(SMA快−SMA慢)/SMA慢', () => {
    const bars = ramp(4, (i) => i * 100);
    const out = compute('volume-osc', bars, { fast: 2, slow: 3 });
    expect(out.vo![2]).toBeCloseTo(25, 10); // (250−200)/200
    expect(out.vo![3]).toBeCloseTo((100 * 50) / 300, 10); // (350−300)/300
  });

  it('Net Volume：涨为正、跌为负', () => {
    const out = compute('net-volume', ramp(3));
    expect(out.nv![0]).toBe(100);
    expect(out.nv![2]).toBe(100);
    const down = compute(
      'net-volume',
      custom([
        [10, 11, 9, 10, 100],
        [10, 11, 9, 9, 100],
      ]),
    );
    expect(down.nv![1]).toBe(-100);
  });

  it('Corr Coeff：close×volume 的 Pearson r', () => {
    const same = compute(
      'corr-coeff',
      ramp(5, (i) => i),
      { length: 3 },
    );
    expect(same.corr![2]).toBeCloseTo(1, 10);
    const inv = compute(
      'corr-coeff',
      ramp(5, (i) => 6 - i),
      { length: 3 },
    );
    expect(inv.corr![2]).toBeCloseTo(-1, 10);
    const flat = compute('corr-coeff', ramp(5), { length: 3 });
    expect(flat.corr![2]).toBe(0); // 量恒定 → 方差 0 → 0
  });
});

describe('第四轮审查修复（指标数值）', () => {
  it('UO：fast > slow 时预热取三周期最大值，不再输出 NaN', () => {
    // fast=3 > slow=2 的非法倒挂参数：修复前 avg(fast) 取负索引 → bSum += undefined → 全 NaN
    const out = compute('uo', ramp(10), { fast: 3, mid: 4, slow: 2 });
    for (let i = 0; i < 10; i++) {
      const v = out.uo![i];
      if (v === undefined) continue; // 预热期（i < max(f,m,s) - 1 = 3）
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(out.uo![3]).toBeDefined();
    // 首个有效值 i=3：bp/tr 全窗口有限，结果落在 0..100
    expect(out.uo![3]!).toBeGreaterThanOrEqual(0);
    expect(out.uo![3]!).toBeLessThanOrEqual(100);
  });

  it('UO：ramp 数据下 bp=1/tr=2 恒定 → 输出 50', () => {
    // ramp bars：bp = close − min(low, prevClose) = 1，tr = maxHigh − minLow = 2 → avg 恒为 0.5
    const out = compute('uo', ramp(10), { fast: 2, mid: 3, slow: 4 });
    expect(out.uo![9]).toBeCloseTo(50, 10);
  });
});

