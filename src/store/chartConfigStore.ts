import { create } from 'zustand';
import type { LegendOptions } from '@/engine/renderer/drawCrosshair';
import { DEFAULT_LEGEND_OPTIONS } from '@/engine/renderer/drawCrosshair';
import type { ChartTypeId, TimeframeId } from '@/types/market';

/**
 * 单图图表配置（P2-C：原 App.tsx 本地 state 下沉，释放上帝组件）。
 * 覆盖：周期 / 图表类型 / 对数 / 百分比 / 自动坐标 / 画线锁定与隐藏 / 指标显隐 / 图例选项。
 *
 * 与 layoutStore 的分工：本 store 管「主图配置」（原 App state），layoutStore 管
 * 「布局与单元格」。layoutSnapshot 的桥接 getChartState 直接同步读本 store——
 * 消除原 App state + useLayoutEffect 补 ref 的 <1 帧竞态窗口（QA advisory #7）：
 * zustand setState 同步生效，Ctrl+S 同帧存档必读到的就是新周期。
 */

export interface ChartConfigStore {
  timeframe: TimeframeId;
  setTimeframe: (tf: TimeframeId) => void;
  chartType: ChartTypeId;
  setChartType: (ct: ChartTypeId) => void;
  /** 对数坐标（StatusBar log / 图表设置 / Alt+L） */
  logScale: boolean;
  setLogScale: (v: boolean) => void;
  toggleLog: () => void;
  /** 百分比坐标（StatusBar % / Alt+P） */
  percent: boolean;
  setPercent: (v: boolean) => void;
  togglePercent: () => void;
  /** 自动坐标（StatusBar auto） */
  autoScale: boolean;
  setAutoScale: (v: boolean) => void;
  toggleAutoScale: () => void;
  /** 画线锁定（画线工具栏） */
  drawingsLocked: boolean;
  setDrawingsLocked: (v: boolean) => void;
  toggleDrawingsLocked: () => void;
  /** 隐藏全部画线（Ctrl+Alt+H） */
  hideDrawings: boolean;
  setHideDrawings: (v: boolean) => void;
  toggleHideDrawings: () => void;
  /** 隐藏全部指标（StatusBar 眼睛） */
  hideStudies: boolean;
  setHideStudies: (v: boolean) => void;
  toggleHideStudies: () => void;
  /** 图例选项（图表设置 / 图例右键菜单） */
  legendOpts: LegendOptions;
  setLegendOpts: (patch: Partial<LegendOptions>) => void;
}

export const useChartConfigStore = create<ChartConfigStore>((set) => ({
  timeframe: '1m',
  setTimeframe: (timeframe) => set({ timeframe }),
  chartType: 'candles',
  setChartType: (chartType) => set({ chartType }),

  logScale: false,
  setLogScale: (v) => set({ logScale: v }),
  toggleLog: () => set((s) => ({ logScale: !s.logScale })),
  percent: false,
  setPercent: (v) => set({ percent: v }),
  togglePercent: () => set((s) => ({ percent: !s.percent })),
  autoScale: true,
  setAutoScale: (v) => set({ autoScale: v }),
  toggleAutoScale: () => set((s) => ({ autoScale: !s.autoScale })),

  drawingsLocked: false,
  setDrawingsLocked: (v) => set({ drawingsLocked: v }),
  toggleDrawingsLocked: () => set((s) => ({ drawingsLocked: !s.drawingsLocked })),
  hideDrawings: false,
  setHideDrawings: (v) => set({ hideDrawings: v }),
  toggleHideDrawings: () => set((s) => ({ hideDrawings: !s.hideDrawings })),
  hideStudies: false,
  setHideStudies: (v) => set({ hideStudies: v }),
  toggleHideStudies: () => set((s) => ({ hideStudies: !s.hideStudies })),

  legendOpts: { ...DEFAULT_LEGEND_OPTIONS },
  setLegendOpts: (patch) => set((s) => ({ legendOpts: { ...s.legendOpts, ...patch } })),
}));
