import { describe, it, expect } from 'vitest';
import { shouldWrite, klineCache } from '@/data/cache/klineCache';

/**
 * 第四轮审查的缓存写入修复回归测试。
 *
 * 背景：`klineCache.put` 由聚合路径每个轮询拍调用（aggregatePath 的 onBars，5–30s 一拍），
 * 而它每次都把整段历史（约 800 根）整表重写，且此前每次还新开一个 IDBDatabase 连接
 * 从不 close。修法：连接改模块级单例（异常/被关闭时丢弃重建），写入加
 * 「内容指纹 + 最小间隔」双重节流。节流判定抽为纯函数 `shouldWrite` 以便此处单测。
 *
 * 注：连接单例本身依赖 IndexedDB 运行时，环境无该 API（且未装 fake-indexeddb），
 * 故以代码审查为准；这里覆盖的是会造成「反复整表重写」的那部分逻辑。
 */

const MIN = 5_000;

describe('klineCache 写入节流', () => {
  it('首次写入（无历史记录）应放行', () => {
    expect(shouldWrite(undefined, '10:0:9:100', 1_000_000)).toBe(true);
  });

  it('内容指纹未变 → 跳过（不重写整段历史）', () => {
    const prev = { fp: '10:0:9:100', at: 1_000_000 };
    expect(shouldWrite(prev, '10:0:9:100', 1_000_000 + MIN * 10)).toBe(false);
  });

  it('末根收盘变化（实时 tick）→ 指纹变化，但间隔不足时仍跳过', () => {
    const prev = { fp: '10:0:9:100', at: 1_000_000 };
    expect(shouldWrite(prev, '10:0:9:101', 1_000_000 + MIN - 1)).toBe(false);
  });

  it('指纹变化且已过最小间隔 → 放行', () => {
    const prev = { fp: '10:0:9:100', at: 1_000_000 };
    expect(shouldWrite(prev, '10:0:9:101', 1_000_000 + MIN)).toBe(true);
  });

  it('追加新 bar（长度变化）同样受间隔约束', () => {
    const prev = { fp: '10:0:9:100', at: 1_000_000 };
    expect(shouldWrite(prev, '11:0:10:105', 1_000_000 + 100)).toBe(false);
    expect(shouldWrite(prev, '11:0:10:105', 1_000_000 + MIN + 1)).toBe(true);
  });
});

describe('klineCache.merge 语义不回归', () => {
  it('按时间去重、后者赢、结果升序', () => {
    const cached = [
      { time: 2, open: 0, high: 0, low: 0, close: 20, volume: 1 },
      { time: 1, open: 0, high: 0, low: 0, close: 10, volume: 1 },
    ];
    const fresh = [
      { time: 2, open: 0, high: 0, low: 0, close: 99, volume: 1 },
      { time: 3, open: 0, high: 0, low: 0, close: 30, volume: 1 },
    ];
    const out = klineCache.merge(cached, fresh);
    expect(out.map((b) => b.time)).toEqual([1, 2, 3]);
    expect(out[1].close).toBe(99); // 后者赢
  });
});
