import { describe, expect, it } from 'vitest';
import { ALL_INDICATORS, getIndicatorDef, indicatorsByCategory } from '@/indicators/registry';
import { IndicatorInstance } from '@/indicators/core/instance';
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
  return new IndicatorInstance(def, params).computeWindow(bars, 0, bars.length - 1).outputs;
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
    // 尾部收敛：ema3=9, ema5=8 → macd=1, signal=1, hist=0
    expect(macd.macd![9]).toBeCloseTo(1, 10);
    expect(macd.hist![9]).toBeCloseTo(0, 10);
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
