import type { IndicatorDef } from '../core/types';
import { PALETTE } from '@/engine/palette';

/**
 * Anchored VWAP（P2-B）：自锚定 bar 到最新 bar 的成交量加权均价。
 * 锚点经画线锚定落点交互（ChartController 选 bar 模式单击）写入 params.anchorTime
 * （纪元毫秒），并经 setIndicatorParamsCallback 写回 indicatorStore（P2-D③：
 * renderer 重建/布局切换不丢锚；store 为意图源、renderer 为实例源）；
 * 实时 bar 更新由实例脏缓存自动生效（末 bar 引用变化即失效重算，随最新 bar 连续延伸）。
 *
 * **cumulative: true**（修复第四轮审查发现）：本指标是自锚点起的绝对累计量，
 * 必须在**全序列前缀**上计算——否则锚点落在可见窗口之外时，compute 会退化成
 * 「自窗口首个 bar 累计」，数值随视口平移而变，且图例（窄窗口）与画线（宽窗口）
 * 给出两个不同的数。此前用 `lookback: 5000` 打补丁绕过（锚点距可见区超过该距离
 * 即退化），现由 cumulative 语义根治：只要锚点在已加载数据内，任何窗口都精确。
 * 回归测试见 tests/unit/indicator-window-invariance.test.ts。
 *
 * 与内置 VWAP 同源口径：典型价 (H+L+C)/3 累计量权和 / 累计成交量；
 * anchorTime ≤ 首 bar 时间时与内置 VWAP 完全一致（金标准单测同源验证）。
 * 锚点之前的 bar 输出 undefined（断线，不参与绘制）。
 */
export const AVWAP: IndicatorDef = {
  id: 'avwap',
  name: 'Anchored VWAP（锚定成交量加权均价）',
  category: '成交量',
  overlay: true,
  /** cumulative=true 时 lookback 失效（一律自 bar 0 累计），此值仅作契约占位 */
  lookback: 1,
  cumulative: true,
  params: [
    { key: 'anchorTime', label: '锚定 bar 时间（纪元 ms）', type: 'number', default: 0 },
    { key: 'color', label: '颜色', type: 'color', default: PALETTE.orange },
  ],
  plots: [{ key: 'avwap', label: 'AVWAP', style: { kind: 'line', color: PALETTE.orange, lineWidth: 1.5 } }],
  compute: (bars, params) => {
    const anchorTime = Number(params.anchorTime ?? 0);
    const out: Array<number | undefined> = [];
    let pv = 0;
    let v = 0;
    let started = false;
    for (const b of bars) {
      // 锚点未到：断线（窗口起点晚于锚点时此分支不触发，自窗口起点累计）
      if (!started && b.time < anchorTime) {
        out.push(undefined);
        continue;
      }
      started = true;
      const tp = (b.high + b.low + b.close) / 3;
      pv += tp * b.volume;
      v += b.volume;
      out.push(v > 0 ? pv / v : undefined);
    }
    return { avwap: out };
  },
};
