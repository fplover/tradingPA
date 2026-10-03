import { describe, it, expect } from 'vitest';
import { isPurePrepend, seriesKey } from '@/components/chartPrepend';
import { renko, pointAndFigure, rangeBars } from '@/data/transforms';
import type { Bar } from '@/types/market';

/**
 * 第四轮审查的「崩溃/卡死」两类缺陷回归测试。
 *
 * A. 左侧翻页前插判定：换品种时新旧序列共用时间栅格，仅凭时间戳嗅探会
 *    把两个标的的序列拼在一起（详见 chartPrepend.ts 注释）。
 * B. 砖块类变换的死循环：brickSize=0 时 `>= 0` 恒真；离群价配小砖会爆迭代数。
 */

function barsAt(times: number[], close = 100): Bar[] {
  return times.map((t) => ({ time: t, open: close, high: close + 1, low: close - 1, close, volume: 1 }));
}

describe('A. 前插判定：只有「同序列前面接了一段更早数据」才成立', () => {
  const K = seriesKey('BTC/USDT', '1m');
  const prev = barsAt([300, 400, 500]);

  it('真前插：同标的同周期 + 后缀逐根一致 → true', () => {
    expect(isPurePrepend(prev, barsAt([100, 200, 300, 400, 500]), K, K)).toBe(true);
  });

  it('换品种：时间戳能对上也必须 false（原缺陷的核心场景）', () => {
    // timestamps 相同（共用 1m 栅格），但这是另一个标的的数据
    const other = seriesKey('ETH/USDT', '1m');
    expect(isPurePrepend(prev, barsAt([100, 200, 300, 400, 500]), K, other)).toBe(false);
  });

  it('换周期：seriesKey 变化 → false', () => {
    const m5 = seriesKey('BTC/USDT', '5m');
    expect(isPurePrepend(prev, barsAt([100, 200, 300, 400, 500]), K, m5)).toBe(false);
  });

  it('后缀不一致（首柱时间巧合命中）→ false', () => {
    // index 2 处时间等于 prev[0]，但之后与 prev 不同 → 不是前插而是替换
    expect(isPurePrepend(prev, barsAt([100, 200, 300, 450, 550]), K, K)).toBe(false);
  });

  it('整体替换（旧序列被完全替换）→ false', () => {
    expect(isPurePrepend(prev, barsAt([600, 700, 800]), K, K)).toBe(false);
  });

  it('新增末柱（追加）→ false（走 setData，保持既有行为）', () => {
    expect(isPurePrepend(prev, barsAt([300, 400, 500, 600]), K, K)).toBe(false);
  });

  it('旧首柱落在 index 0（未变长）→ false', () => {
    expect(isPurePrepend(prev, barsAt([300, 400, 600]), K, K)).toBe(false);
  });

  it('prev 为空 → false', () => {
    expect(isPurePrepend([], barsAt([100, 200]), K, K)).toBe(false);
  });
});

describe('B. 砖块类变换：退化输入不再死循环/爆量', () => {
  it('renko：brickSize=0（ChartState 在全 0 价数据上会推出 0）立即终止', () => {
    const zeros: Bar[] = barsAt(
      [1, 2, 3, 4].map((i) => i * 60_000),
      0,
    );
    const out = renko(zeros, 0);
    expect(out.length).toBeLessThanOrEqual(20_000);
  });

  it('renko：离群价 + 极小砖 → 被输出上限截断（旧实现会迭代上亿次）', () => {
    // 100000 的价格跨度配砖宽 1：不加护栏会产出 10 万根；上限应截到 20000
    const out = renko(
      [
        { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 1 },
        { time: 60_000, open: 100_000, high: 100_000, low: 100_000, close: 100_000, volume: 1 },
      ],
      1,
    );
    expect(out.length).toBe(20_000);
  });

  it('pointAndFigure：boxSize=0 立即终止', () => {
    const zeros: Bar[] = barsAt(
      [1, 2, 3].map((i) => i * 60_000),
      0,
    );
    expect(pointAndFigure(zeros, 0).length).toBeLessThanOrEqual(20_000);
  });

  it('rangeBars：rangeSize=0 不产生每根一段的爆炸，且尺寸被规整', () => {
    const many = barsAt(
      Array.from({ length: 50 }, (_, i) => i * 60_000),
      100,
    );
    const out = rangeBars(many, 0);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(many.length);
  });
});
