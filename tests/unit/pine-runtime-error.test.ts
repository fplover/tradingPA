import { describe, expect, it, vi } from 'vitest';
import {
  compilePine,
  pineRuntimeError,
  pineRuntimeErrors,
  subscribePineRuntimeErrors,
} from '@/indicators/pine/compile';
import { BARS } from './helpers/pine-fixture';

/**
 * Pine 运行期错误出口（AC-B2 之后补 UI 通道）：
 * 编译期 dry-run 用默认参数，「用户把周期改成 0」这类错误只在运行期暴露，
 * 旧行为只写 meta.lastError、UI 无出口 → 指标静默空白。
 * 现在 compute 兜底捕获后广播到运行期错误表（图例设置面板 / 编辑器控制台订阅），
 * 同时 input.int 未声明 minval 时兜底 min:1，从参数入口挡住 0/负周期。
 */

const SRC = 'len = input.int(3)\nplot(ta.sma(close, len))';

describe('Pine 运行期错误：compute 兜底与订阅通道', () => {
  it('默认参数合法：编译通过（dry-run 发现不了后续的参数误用）', () => {
    const r = compilePine(SRC, 'rt-default');
    expect(r.errors).toEqual([]);
    expect(r.def).not.toBeNull();
    expect(pineRuntimeError(r.def!)).toBeUndefined();
  });

  it('参数覆盖为 0：compute 不抛错、输出全 undefined、错误可读', () => {
    const def = compilePine(SRC, 'rt-zero').def!;
    let out: Record<string, Array<number | undefined>> | undefined;
    expect(() => {
      out = def.compute(BARS, { len: 0 });
    }).not.toThrow();
    expect(out!.p0.every((v) => v === undefined)).toBe(true);
    expect(pineRuntimeError(def)).toContain('正整数');
  });

  it('恢复合法参数：错误被清除', () => {
    const def = compilePine(SRC, 'rt-recover').def!;
    def.compute(BARS, { len: 0 });
    expect(pineRuntimeError(def)).toBeDefined();
    def.compute(BARS, { len: 3 });
    expect(pineRuntimeError(def)).toBeUndefined();
    expect(pineRuntimeErrors().has('rt-recover')).toBe(false);
  });

  it('订阅者收到通知，快照含该脚本；退订后不再通知', () => {
    const cb = vi.fn();
    const unsub = subscribePineRuntimeErrors(cb);
    try {
      const def = compilePine(SRC, 'rt-sub').def!;
      def.compute(BARS, {});
      expect(cb).not.toHaveBeenCalled(); // 正常 compute 不广播
      def.compute(BARS, { len: 0 });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(pineRuntimeErrors().get('rt-sub')).toContain('正整数');
    } finally {
      unsub();
    }
    const def2 = compilePine(SRC, 'rt-sub').def!;
    def2.compute(BARS, { len: 0 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('运行期错误不影响同批次其他脚本', () => {
    const bad = compilePine(SRC, 'rt-bad').def!;
    const good = compilePine('plot(ta.sma(close, 3))', 'rt-good').def!;
    bad.compute(BARS, { len: 0 });
    expect(pineRuntimeError(good)).toBeUndefined();
    expect(pineRuntimeErrors().get('rt-bad')).toBeDefined();
    expect(pineRuntimeErrors().get('rt-good')).toBeUndefined();
  });
});

describe('Pine 参数兜底：input.int 的 min', () => {
  it('未声明 minval → 兜底 min:1（挡住 0/负周期）', () => {
    const def = compilePine(SRC, 'rt-min').def!;
    expect(def.params[0]).toMatchObject({ key: 'len', type: 'number', default: 3, min: 1, step: 1 });
  });

  it('显式 minval=0 / 负值按脚本声明保留', () => {
    expect(
      compilePine('len = input.int(3, "周期", minval=0)\nplot(ta.sma(close, len))', 'rt-min0').def!.params[0].min,
    ).toBe(0);
    expect(
      compilePine('len = input.int(3, "周期", minval=-5)\nplot(ta.sma(close, len))', 'rt-min-neg').def!.params[0].min,
    ).toBe(-5);
  });

  it('minval/maxval 同时声明时不变', () => {
    const def = compilePine(
      'len = input.int(3, "周期", minval=2, maxval=9)\nplot(ta.sma(close, len))',
      'rt-minmax',
    ).def!;
    expect(def.params[0]).toMatchObject({ min: 2, max: 9 });
  });

  it('默认值非法（0）：编译期即报运行期校验失败，不出静默空白指标', () => {
    const r = compilePine('len = input.int(0)\nplot(ta.sma(close, len))', 'rt-bad-default');
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('运行期校验失败');
    expect(r.errors[0].message).toContain('正整数');
  });
});
