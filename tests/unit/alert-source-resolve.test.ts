import { describe, expect, it } from 'vitest';
import { resolveIndicatorAlertSource } from '@/features/alerts/alertLogic';

/**
 * 指标警报源解析（第四轮审查低优先项，用户口径 2026-10-08）：
 * 空 plot 不静默降级为价格警报——解析返回 null，AlertPanel 阻止创建并明示「无可用输出」。
 * 结构入参（只依赖 plots.key）即可测，无需构造完整 IndicatorDef。
 */
const withPlots = { plots: [{ key: 'rsi' }, { key: 'signal' }] };

describe('resolveIndicatorAlertSource', () => {
  it('有效 plotKey 原样采用', () => {
    expect(resolveIndicatorAlertSource('rsi', 'signal', withPlots)).toEqual({
      type: 'indicator',
      indicatorId: 'rsi',
      plotKey: 'signal',
    });
  });

  it('无效 plotKey 回退首个 plot（含空 plotKey 的首访）', () => {
    expect(resolveIndicatorAlertSource('rsi', 'nope', withPlots)).toEqual({
      type: 'indicator',
      indicatorId: 'rsi',
      plotKey: 'rsi',
    });
    expect(resolveIndicatorAlertSource('rsi', '', withPlots)).toEqual({
      type: 'indicator',
      indicatorId: 'rsi',
      plotKey: 'rsi',
    });
  });

  it('指标无任何 plot（空输出）→ null：阻止创建，不降级为价格警报', () => {
    expect(resolveIndicatorAlertSource('empty-ind', '', { plots: [] })).toBeNull();
    expect(resolveIndicatorAlertSource('empty-ind', 'rsi', { plots: [] })).toBeNull();
  });

  it('指标缺失（def undefined，如陈旧源 id）→ null：同样阻止创建', () => {
    expect(resolveIndicatorAlertSource('gone', 'rsi', undefined)).toBeNull();
  });
});
