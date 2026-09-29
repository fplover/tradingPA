import {
  BarChart3,
  Bell,
  Camera,
  CandlestickChart,
  Clock,
  FileCode2,
  Keyboard,
  LayoutGrid,
  Maximize2,
  Moon,
  Percent,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Volume2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CHART_TYPES, TIMEFRAMES, type ChartTypeId, type TimeframeId } from '@/types/market';
import { LAYOUTS, type LayoutId } from '@/store/layoutStore';
import { isCustomIntervalId } from '@/features/market/customInterval';
import { useSymbolSearchStore } from '@/features/watchlist/searchStore';
import { useRightDockStore } from '@/features/rightbar/rightPanelStore';
import { usePineStore } from '@/store/pineStore';

export interface CommandItem {
  id: string;
  title: string;
  /** 参与模糊匹配的补充关键词（拼音/英文），命中率低于标题 */
  keywords?: string;
  hint?: string;
  icon?: LucideIcon;
  group: string;
  run: () => void;
}

/** App 本地状态（useState）类动作经此注入；store 类动作由注册表直接派生，不复制业务逻辑 */
export interface CommandContext {
  timeframe: TimeframeId;
  chartType: ChartTypeId;
  volumeActive: boolean;
  setTimeframe: (tf: TimeframeId) => void;
  setChartType: (ct: ChartTypeId) => void;
  toggleVolume: () => void;
  openIndicators: () => void;
  toggleLog: () => void;
  togglePercent: () => void;
  toggleTheme: () => void;
  toggleFullscreen: () => void;
  screenshot: () => void;
  openGoToDate: () => void;
  openShortcuts: () => void;
  openChartSettings: () => void;
  openReport: () => void;
  startReplay: () => void;
  reload: () => void;
  setLayout: (l: LayoutId) => void;
}

/** 全局命令注册表：从 TIMEFRAMES / CHART_TYPES / LAYOUTS 档位表与既有 store/action 派生 */
export function buildCommands(ctx: CommandContext): CommandItem[] {
  const items: CommandItem[] = [];

  for (const tf of TIMEFRAMES) {
    if (isCustomIntervalId(tf.id)) continue; // 运行时注册的自定义档不进命令面板
    items.push({
      id: `tf:${tf.id}`,
      title: `切换到 ${tf.label} 周期`,
      keywords: `timeframe interval ${tf.id} 周期`,
      icon: Clock,
      group: '周期',
      run: () => ctx.setTimeframe(tf.id),
    });
  }

  for (const ct of CHART_TYPES) {
    items.push({
      id: `ct:${ct.id}`,
      title: `图表类型：${ct.label}`,
      keywords: `chart type ${ct.id}`,
      icon: CandlestickChart,
      group: '图表类型',
      run: () => ctx.setChartType(ct.id),
    });
  }

  for (const l of LAYOUTS) {
    items.push({
      id: `layout:${l.id}`,
      title: `布局：${l.label}`,
      keywords: `layout grid ${l.id} 图表布局`,
      icon: LayoutGrid,
      group: '布局',
      run: () => ctx.setLayout(l.id),
    });
  }

  items.push(
    {
      id: 'view:volume',
      title: ctx.volumeActive ? '关闭成交量' : '打开成交量',
      keywords: 'volume 成交量 量能',
      icon: Volume2,
      group: '显示',
      run: ctx.toggleVolume,
    },
    {
      id: 'view:indicators',
      title: '打开指标面板',
      keywords: 'indicators indicators study 指标',
      icon: BarChart3,
      group: '显示',
      run: ctx.openIndicators,
    },
    {
      id: 'view:log',
      title: '切换对数坐标',
      keywords: 'log scale 对数',
      icon: Percent,
      group: '显示',
      run: ctx.toggleLog,
    },
    {
      id: 'view:percent',
      title: '切换百分比坐标',
      keywords: 'percent 百分比',
      icon: Percent,
      group: '显示',
      run: ctx.togglePercent,
    },
    {
      id: 'view:settings',
      title: '图表设置',
      keywords: 'settings 设置',
      icon: Settings2,
      group: '显示',
      run: ctx.openChartSettings,
    },
    {
      id: 'panel:alerts',
      title: '打开警报面板',
      keywords: 'alert alarm 警报 提醒',
      icon: Bell,
      group: '面板',
      run: () => useRightDockStore.getState().open('alerts'),
    },
    {
      id: 'panel:pine',
      title: 'Pine 编辑器',
      keywords: 'pine script 编辑器 脚本',
      icon: FileCode2,
      group: '面板',
      run: () => usePineStore.getState().setPanelOpen(!usePineStore.getState().panelOpen),
    },
    {
      id: 'data:search',
      title: '搜索品种',
      keywords: 'search symbol 品种 搜索',
      hint: '/',
      icon: Search,
      group: '面板',
      run: () => useSymbolSearchStore.getState().openSearch('switch'),
    },
    {
      id: 'data:goto',
      title: '前往日期',
      keywords: 'go to date 前往日期',
      icon: Clock,
      group: '数据',
      run: ctx.openGoToDate,
    },
    {
      id: 'data:reload',
      title: '重新加载数据',
      keywords: 'reload refresh 刷新 重载',
      icon: RefreshCw,
      group: '数据',
      run: ctx.reload,
    },
    {
      id: 'replay:start',
      title: '进入复盘回放',
      keywords: 'bar replay replay 复盘 回放',
      icon: Play,
      group: '复盘交易',
      run: ctx.startReplay,
    },
    {
      id: 'trade:report',
      title: '模拟交易报告',
      keywords: 'paper trading report 交易报告',
      icon: Play,
      group: '复盘交易',
      run: ctx.openReport,
    },
    {
      id: 'app:screenshot',
      title: '生成快照',
      keywords: 'screenshot png 截图 快照',
      icon: Camera,
      group: '应用',
      run: ctx.screenshot,
    },
    {
      id: 'app:fullscreen',
      title: '全屏模式',
      keywords: 'fullscreen 全屏',
      icon: Maximize2,
      group: '应用',
      run: ctx.toggleFullscreen,
    },
    {
      id: 'app:theme',
      title: '切换深浅主题',
      keywords: 'theme dark light 主题',
      icon: Moon,
      group: '应用',
      run: ctx.toggleTheme,
    },
    {
      id: 'app:shortcuts',
      title: '快捷键说明',
      keywords: 'shortcuts keyboard 快捷键',
      icon: Keyboard,
      group: '应用',
      run: ctx.openShortcuts,
    },
  );
  return items;
}
