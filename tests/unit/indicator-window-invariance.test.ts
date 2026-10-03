import { describe, it, expect } from 'vitest';
import { IndicatorInstance } from '@/indicators/core/instance';
import { ALL_INDICATORS, getIndicatorDef } from '@/indicators/registry';
import type { Bar } from '@/types/market';

/**
 * 窗口不变性回归测试（第四轮审查发现后的防线）。
 *
 * 背景：`computeWindow(bars, from, to)` 会把入参切成 `bars.slice(from - lookback, to + 1)`
 * 再交给 `compute`。对**有界回看**型指标（SMA…）这没问题；但对**累积型**指标
 * （OBV / VWAP / CVD / ADL / Chaikin / AVWAP）数值是自数据起点累计的绝对量，
 * 切片重算会让同一根 bar 的值随窗口而变——表现为：
 *   - 平移一次图，同一根 bar 的 OBV/CVD/ADL/VWAP 数值全变；
 *   - 图例走 `(i-50, i)` 窗口、绘制走 `(from, to)` 窗口 → **同一条线的两个数不相等**；
 *   - 警报采样走 `(to-1, to)` 更窄窗口 → 拿局部累计值比全序列阈值。
 * 这批指标现以 `IndicatorDef.cumulative` 声明，由 `computeWindow` 保证自 bar 0 起算。
 *
 * 本文件是**唯一**断言该性质的地方：既有测试里的 `computeWindow(bars, 10, 20)`
 * 属于脏缓存用例（同窗口比对缓存命中），结构上抓不到窗口依赖。
 *
 * 判据：同一根 bar、同一份数据，**任意窗口**取值必须相同。
 */

/** 确定性种子数据：让累计量非平凡（涨跌不对称，避免互相抵消） */
function seedBars(n: number): Bar[] {
  const out: Bar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += ((i * 7) % 11) - 5;
    out.push({
      time: i * 60_000,
      open: price - 0.5,
      high: price + 1 + (i % 3),
      low: price - 1 - (i % 2),
      close: price,
      volume: 100 + (i % 13) * 10,
    });
  }
  return out;
}

/** 用独立实例在给定窗口下取第 i 根 bar 的值（避免缓存干扰） */
function valueAt(
  id: string,
  bars: readonly Bar[],
  i: number,
  from: number,
  to: number,
  params: Record<string, string | number | boolean> = {},
): number | undefined {
  const def = getIndicatorDef(id);
  if (!def) throw new Error(`指标不存在: ${id}`);
  const { outputs, ctxFrom } = new IndicatorInstance(def, { params }).computeWindow(bars, from, to);
  const key = Object.keys(outputs)[0];
  return outputs[key][i - ctxFrom] as number | undefined;
}

const BARS = seedBars(140);
const LAST = BARS.length - 1;

/** 累积型指标清单：必须与注册表中 `cumulative === true` 的集合严格一致 */
const CUMULATIVE = ['adl', 'avwap', 'chaikin-osc', 'cvd', 'obv', 'vwap'];

describe('累积型指标：窗口不变性', () => {
  it('cumulative 标记集合与本清单严格一致（新增累积型指标必须同步此处）', () => {
    const marked = ALL_INDICATORS.filter((d) => d.cumulative === true)
      .map((d) => d.id)
      .sort();
    expect(marked).toEqual([...CUMULATIVE].sort());
  });

  for (const id of CUMULATIVE) {
    it(`${id}：同一根 bar 在任意窗口下取值相同`, () => {
      const full = valueAt(id, BARS, LAST, 0, LAST);
      const narrow = valueAt(id, BARS, LAST, LAST - 19, LAST);
      const mid = valueAt(id, BARS, LAST, LAST - 80, LAST);
      expect(full, `${id} 不应为 undefined`).toBeDefined();
      expect(narrow, `${id} 全量 vs 窄窗`).toBe(full);
      expect(mid, `${id} 全量 vs 中窗`).toBe(full);
    });

    it(`${id}：窗口右缘（to）延伸不影响更早 bar 的值`, () => {
      const i = LAST - 30;
      expect(valueAt(id, BARS, i, 0, LAST), `${id} 第 ${i} 根`).toBe(valueAt(id, BARS, i, 0, i));
    });
  }

  it('图例窗口 (i-50, i) 与绘制窗口给出同一个数（用户可见症状）', () => {
    // 修复前 OBV 在全量窗口末值为 -3、在 (100,119) 切片窗口为 104
    for (const id of CUMULATIVE) {
      if (id === 'avwap') continue; // 锚点默认 0 → 与内置 VWAP 同源，另有专测
      const legend = valueAt(id, BARS, LAST, LAST - 50, LAST);
      const drawn = valueAt(id, BARS, LAST, LAST - 120, LAST);
      expect(legend, `${id} 图例 vs 绘制`).toBe(drawn);
    }
  });
});

describe('AVWAP：锚点落在可见窗口之外（原 lookback:5000 补丁针对的场景）', () => {
  const anchorTime = BARS[10].time;

  it('锚点远在窗口左侧时仍自锚点起算，不再退化为自窗口起算', () => {
    const full = valueAt('avwap', BARS, LAST, 0, LAST, { anchorTime });
    const narrow = valueAt('avwap', BARS, LAST, LAST - 19, LAST, { anchorTime });
    expect(full).toBeDefined();
    expect(narrow, '锚点在窗口外也必须与全量一致').toBe(full);
  });

  it('锚点之前的 bar 输出 undefined（断线语义不变）', () => {
    expect(valueAt('avwap', BARS, 5, 0, LAST, { anchorTime })).toBeUndefined();
    expect(valueAt('avwap', BARS, 10, 0, LAST, { anchorTime })).toBeDefined();
  });

  it('anchorTime ≤ 首 bar 时与内置 VWAP 一致（既有同源契约不回归）', () => {
    for (const i of [20, 70, LAST]) {
      expect(valueAt('avwap', BARS, i, 0, LAST, { anchorTime: 0 })).toBe(valueAt('vwap', BARS, i, 0, LAST));
    }
  });
});

describe('有界回看型指标：语义不被 cumulative 改动波及', () => {
  it('SMA 在同一根 bar 上任意窗口取值相同', () => {
    const p = { length: 20 };
    expect(valueAt('sma', BARS, LAST, LAST - 50, LAST, p)).toBe(valueAt('sma', BARS, LAST, LAST - 120, LAST, p));
    expect(valueAt('sma', BARS, LAST, 0, LAST, p)).toBe(valueAt('sma', BARS, LAST, LAST - 50, LAST, p));
  });

  it('非累积型指标未被标记 cumulative（防误标造成无谓全量重算）', () => {
    for (const id of ['sma', 'ema', 'macd', 'rsi', 'bb', 'vol', 'volume-ma']) {
      expect(getIndicatorDef(id)?.cumulative, `${id} 不应为累积型`).not.toBe(true);
    }
  });
});
