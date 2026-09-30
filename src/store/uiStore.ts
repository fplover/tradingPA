import { create } from 'zustand';
import type { ChartMenuState } from '@/features/market/ChartContextMenu';

/**
 * 全局 UI 开关收敛（P2-C：原 App.tsx 约 10 个对话框本地 useState 下沉，释放上帝组件）。
 * 只放「开合状态 + 菜单位置」这类纯 UI 态；业务数据仍在各自领域 store。
 * pineOpen 沿用 pineStore（既有事实源），不搬迁。
 */

export interface UiStore {
  /** 命令面板（Ctrl+P） */
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  /** 图表设置（顶栏齿轮 / 底部齿轮 / 双击最新价线） */
  chartSettingsOpen: boolean;
  setChartSettingsOpen: (open: boolean) => void;
  /** 快捷键说明（?） */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** 前往日期（Alt+G） */
  goToDateOpen: boolean;
  setGoToDateOpen: (open: boolean) => void;
  /** 自定义间隔浮层（周期下拉「自定义间隔…」） */
  customIntervalOpen: boolean;
  setCustomIntervalOpen: (open: boolean) => void;
  /** 自定义周期增删后刷新下拉选项快照的版本号（关闭自定义浮层时 +1） */
  customVer: number;
  bumpCustomVer: () => void;
  /** 模拟交易总结报告 */
  reportOpen: boolean;
  setReportOpen: (open: boolean) => void;
  /** 图表空白区右键菜单（价格 + 屏幕坐标） */
  chartMenu: ChartMenuState | null;
  setChartMenu: (state: ChartMenuState | null) => void;
  /** 图例区右键菜单 */
  legendMenu: { x: number; y: number } | null;
  setLegendMenu: (state: { x: number; y: number } | null) => void;
  /** 画线右键菜单 */
  drawingMenu: { id: string; x: number; y: number } | null;
  setDrawingMenu: (state: { id: string; x: number; y: number } | null) => void;
  /** 周期输入浮层（数字键 / 逗号直开，TV featureset show_interval_dialog_on_key_press） */
  intervalOpen: boolean;
  intervalInitial: string;
  /** 打开并预填（触发键是数字时带入该数字） */
  openInterval: (initial: string) => void;
  setIntervalOpen: (open: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  chartSettingsOpen: false,
  setChartSettingsOpen: (chartSettingsOpen) => set({ chartSettingsOpen }),
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  goToDateOpen: false,
  setGoToDateOpen: (goToDateOpen) => set({ goToDateOpen }),
  customIntervalOpen: false,
  setCustomIntervalOpen: (customIntervalOpen) => set({ customIntervalOpen }),
  customVer: 0,
  bumpCustomVer: () => set((s) => ({ customVer: s.customVer + 1 })),
  reportOpen: false,
  setReportOpen: (reportOpen) => set({ reportOpen }),

  chartMenu: null,
  setChartMenu: (chartMenu) => set({ chartMenu }),
  legendMenu: null,
  setLegendMenu: (legendMenu) => set({ legendMenu }),
  drawingMenu: null,
  setDrawingMenu: (drawingMenu) => set({ drawingMenu }),

  intervalOpen: false,
  intervalInitial: '',
  openInterval: (initial) => set({ intervalOpen: true, intervalInitial: initial }),
  setIntervalOpen: (intervalOpen) => set({ intervalOpen }),
}));
