import { describe, expect, it } from 'vitest';
import {
  channelLineAt,
  FIB_CHANNEL_LEVELS,
  GOLDEN_RATIO,
  SPIRAL_GROWTH,
  SPIRAL_TURNS,
  spiralSamples,
} from '@/engine/drawing/fibTailMath';
import { defaultLevelsFor } from '@/engine/drawing/types';

/** 基准样本：趋势线 (0,100)→(10,110)，第三锚点 (5,105)——宽度向量 (5,5) */
const P0 = { time: 0, price: 100 };
const P1 = { time: 10, price: 110 };
const P2 = { time: 5, price: 105 };

describe('channelLineAt：fib 通道档位线', () => {
  it('level=1 的通道恰好过第三锚点（a 端 = P2），b 端平行平移', () => {
    const line = channelLineAt(P0, P1, P2, 1);
    expect(line.a).toEqual(P2);
    expect(line.b).toEqual({ time: 15, price: 115 });
  });

  it('level 按宽度向量等比缩放（0.382 档逐字段钉住）', () => {
    const line = channelLineAt(P0, P1, P2, 0.382);
    expect(line.a.time).toBeCloseTo(1.91, 6);
    expect(line.a.price).toBeCloseTo(101.91, 6);
    expect(line.b.time).toBeCloseTo(11.91, 6);
    expect(line.b.price).toBeCloseTo(111.91, 6);
  });

  it('默认档位表钉住：0.382 / 0.618 / 1 / 1.618 / 2.618，并与 defaultLevelsFor 同源', () => {
    expect([...FIB_CHANNEL_LEVELS]).toEqual([0.382, 0.618, 1, 1.618, 2.618]);
    expect(defaultLevelsFor('fib-channel')).toEqual([...FIB_CHANNEL_LEVELS]);
    // 档位编辑器不支持的系列工具返回 null 不回归
    expect(defaultLevelsFor('fib-spiral')).toBeNull();
  });
});

describe('spiralSamples：对数螺旋采样', () => {
  it('首样本 = 初始点（θ=0 处半径 r0），样本数 = steps+1', () => {
    const samples = spiralSamples(0, 0, 30, 0, 60);
    expect(samples.length).toBe(61);
    expect(samples[0]).toEqual({ x: 30, y: 0 });
  });

  it('增长率钉住：展开 SPIRAL_TURNS 圈后半径 = r0·φ^10（每 90° ×φ）', () => {
    const r0 = 25;
    const samples = spiralSamples(0, 0, r0, 0, 200);
    const last = samples[samples.length - 1];
    const expected = r0 * Math.pow(GOLDEN_RATIO, SPIRAL_TURNS * 4);
    expect(Math.hypot(last.x, last.y)).toBeCloseTo(expected, 4);
    // SPIRAL_GROWTH 与 φ 的关系本身钉住（ln φ / (π/2)）
    expect(SPIRAL_GROWTH).toBeCloseTo(Math.log(GOLDEN_RATIO) / (Math.PI / 2), 12);
  });

  it('初始角度保留：初始点在左上方向，第二采样沿角度递增方向展开且半径已增', () => {
    const samples = spiralSamples(100, 100, 100 - 20, 100 - 20, 40);
    expect(samples[0].x).toBeCloseTo(80, 10);
    expect(samples[0].y).toBeCloseTo(80, 10);
    // 屏幕坐标 y 向下：角度自 -135° 递增（数值探针核实：s1=(87.79, 70.53)）
    const second = samples[1];
    expect(second.x).toBeGreaterThan(80);
    expect(second.y).toBeLessThan(80);
  });

  it('零半径（两点重合）→ 空数组（渲染/命中安全降级）', () => {
    expect(spiralSamples(5, 5, 5, 5)).toEqual([]);
  });
});
