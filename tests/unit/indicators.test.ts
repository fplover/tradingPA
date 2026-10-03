import { describe, expect, it } from 'vitest';
import { ALL_INDICATORS, getIndicatorDef, indicatorsByCategory } from '@/indicators/registry';
import { IndicatorInstance } from '@/indicators/core/instance';
import { sma, ema, closes, combine } from '@/indicators/core/math';
import type { Bar } from '@/types/market';

function ramp(n: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 1; i <= n; i++) {
    bars.push({ time: i * 60_000, open: i, high: i + 1, low: i - 1, close: i, volume: 100 });
  }
  return bars;
}

function compute(id: string, bars: Bar[], params?: Record<string, string | number | boolean>) {
  const def = getIndicatorDef(id);
  if (!def) throw new Error(`指标不存在: ${id}`);
  return new IndicatorInstance(def, { params }).computeWindow(bars, 0, bars.length - 1).outputs;
}

describe('指标注册表', () => {
  it('包含全部内置指标且 id 唯一', () => {
    const ids = ALL_INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_INDICATORS.length).toBeGreaterThanOrEqual(30);
  });

  it('按分类组织', () => {
    const groups = indicatorsByCategory();
    expect(groups.length).toBeGreaterThanOrEqual(4);
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(ALL_INDICATORS.length);
  });
});

describe('指标计算金标准', () => {
  const bars = ramp(10);

  it('SMA', () => {
    expect(compute('sma', bars, { length: 3 }).sma).toEqual([undefined, undefined, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('RSI 单边上涨为 100', () => {
    const rsi = compute('rsi', bars, { length: 3 }).rsi;
    expect(rsi[2]).toBe(100);
    expect(rsi[9]).toBe(100);
  });

  it('BOLL 上下轨对称', () => {
    const bb = compute('bb', bars, { length: 3, mult: 2 });
    // 收盘=3 时：均值 2，标准差 sqrt(2/3)
    const sd = Math.sqrt(2 / 3);
    expect(bb.upper![2]).toBeCloseTo(2 + 2 * sd, 10);
    expect(bb.lower![2]).toBeCloseTo(2 - 2 * sd, 10);
    expect(bb.basis![2]).toBe(2);
  });

  it('MACD 快慢线差', () => {
    const macd = compute('macd', bars, { fast: 3, slow: 5, signal: 2 });
    // 尾部收敛：ema3=9, ema5=8 → macd=1
    expect(macd.macd![9]).toBeCloseTo(1, 10);
    // signal = EMA2(macd)：EMA 是**渐近**收敛，第 9 根上仍有 1/729 的滞后残差，
    // 不再是恒 0。（口径修正前信号线误用 SMA，此处恰为 0——本断言原样钉的是错口径，
    // 第四轮审查发现后按 EMA 语义更新；信号线口径本身由下一条专项用例钉死。）
    expect(macd.hist![9]).toBeCloseTo(1 / 729, 10);
  });

  /**
   * 信号线口径专项（第四轮审查发现）：内置 MACD 曾用 SMA 平滑 MACD 线，
   * 而 TradingView 标准定义与同仓 Pine `ta.macd`（`dea = EMA(dif, signal)`）都用 EMA
   * ——同一平台两套数值。上面那条「MACD 快慢线差」用的是单调 ramp，SMA 与 EMA
   * 都会收敛到同一值，结构上钉不住这一点，故单列本用例：
   * 用非收敛数据 + 独立算出的 EMA 作为 oracle，并自检该数据确实能区分两种口径。
   */
  it('MACD 信号线用 EMA 而非 SMA', () => {
    const zig: Bar[] = [];
    let p = 100;
    for (let i = 0; i < 40; i++) {
      p += i % 5 === 0 ? 6 : i % 3 === 0 ? -4 : 1.5;
      zig.push({ time: i * 60_000, open: p - 1, high: p + 2, low: p - 2, close: p, volume: 100 });
    }
    const fast = 5;
    const slow = 12;
    const sig = 4;
    const out = compute('macd', zig, { fast, slow, signal: sig });

    const c = closes(zig);
    const macdLine = combine(ema(c, fast), ema(c, slow), (a, b) => a - b);
    const filled = macdLine.map((v) => v ?? 0);
    const emaSignal = ema(filled, sig);
    const smaSignal = sma(filled, sig);

    // oracle：实现必须逐项等于 EMA(dif, signal)
    macdLine.forEach((v, i) => {
      if (v === undefined) return;
      expect(out.signal![i], `signal[${i}]`).toBeCloseTo(emaSignal[i]!, 10);
    });

    // 判别力自检：本数据集必须能区分 SMA / EMA，否则本用例形同虚设
    const distinguishable = macdLine.some(
      (v, i) => v !== undefined && Math.abs((smaSignal[i] ?? 0) - (emaSignal[i] ?? 0)) > 1e-9,
    );
    expect(distinguishable, '数据集需能区分 SMA 与 EMA 两种口径').toBe(true);
  });

  it('Stoch %K 位置', () => {
    const k = compute('stoch', bars, { k: 3, d: 2, smooth: 1 }).k;
    // 最后一根：close=10, 最高=11, 最低=7 → (10-7)/(11-7)=75
    expect(k![9]).toBeCloseTo(75, 10);
  });

  it('OBV 累计', () => {
    const obv = compute('obv', bars).obv;
    // 收盘恒涨 → 每根 +100（第一根为 0）
    expect(obv[0]).toBe(0);
    expect(obv[9]).toBe(900);
  });

  it('VWAP 量权', () => {
    const vwap = compute('vwap', bars).vwap;
    // 等量时 VWAP = 均价 = (1+...+10)/10
    expect(vwap![9]).toBeCloseTo(5.5, 10);
  });

  it('全部指标输出与输入等长', () => {
    for (const def of ALL_INDICATORS) {
      const out = new IndicatorInstance(def).computeWindow(bars, 0, bars.length - 1).outputs;
      for (const key of Object.keys(out)) {
        expect(out[key].length, `${def.id}.${key}`).toBe(bars.length);
      }
    }
  });
});
