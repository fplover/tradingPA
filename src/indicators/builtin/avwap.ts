import type { IndicatorDef } from '../core/types';

/**
 * AVWAP 回看上限（bar 数）：指标计算走实例窗口化管线（computeWindow 按可见区间
 * 切片），锚点距可见区超过该距离时上下文窗口已不含锚点 bar，compute 退化为
 * 「自窗口首个 bar 累计」（见下方 compute 注释）。5000 覆盖 HISTORY_LIMIT（800）
 * 量级的常规数据量：锚点在已加载数据内时数值精确。
 */
const AVWAP_LOOKBACK = 5000;

/**
 * Anchored VWAP（P2-B）：自锚定 bar 到最新 bar 的成交量加权均价。
 * 锚点经画线锚定落点交互（ChartController 选 bar 模式单击）写入 params.anchorTime
 * （纪元毫秒），并经 setIndicatorParamsCallback 写回 indicatorStore（P2-D③：
 * renderer 重建/布局切换不丢锚；store 为意图源、renderer 为实例源）；
 * 实时 bar 更新由实例脏缓存自动生效（末 bar 引用变化即失效重算，随最新 bar 连续延伸）。
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
  lookback: AVWAP_LOOKBACK,
  params: [
    { key: 'anchorTime', label: '锚定 bar 时间（纪元 ms）', type: 'number', default: 0 },
    { key: 'color', label: '颜色', type: 'color', default: '#ff9800' },
  ],
  plots: [{ key: 'avwap', label: 'AVWAP', style: { kind: 'line', color: '#ff9800', lineWidth: 1.5 } }],
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
