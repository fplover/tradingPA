import { useMemo } from 'react';
import {
  BarChart3,
  Camera,
  CandlestickChart,
  ChevronDown,
  Command,
  FileCode2,
  GitCompareArrows,
  Maximize2,
  Moon,
  Play,
  Redo2,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Undo2,
} from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Instrument } from '@/types/instrument';
import { MARKETS } from '@/types/instrument';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';
import { useChartConfigStore } from '@/store/chartConfigStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useThemeStore } from '@/store/themeStore';
import { useQuoteStore } from '@/store/quoteStore';
import { useReplayStore } from '@/store/replayStore';
import { usePineStore } from '@/store/pineStore';
import { useUiStore } from '@/store/uiStore';
import { useWatchlistStore, selectActiveInstrument } from '@/store/watchlistStore';
import { useSymbolSearchStore } from '@/features/watchlist/searchStore';
import { CUSTOM_INTERVAL_ACTION, customIntervalOptions, isCustomIntervalId } from '@/features/market/customInterval';
import type { ChartSeries } from '@/features/market/useChartSeries';
import { LayoutSaveMenu } from './LayoutSaveMenu';
import { LayoutMenu } from './LayoutGrid';
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { IconButton } from '@/ui/primitives';
import { ToolbarSelect, type ToolbarOption } from '@/ui/ToolbarSelect';
import { decimalsFor } from '@/data/format';
import { fontSize, space, zIndex } from '@/ui/tokens';

/**
 * 顶栏（P2-C 自 App.tsx 拆出）：品种 / 周期 / 图表类型 / 回放入口 / 指标 / 布局存取 /
 * 设置 / Pine / 搜索 / 命令面板 / 全屏 / 截图 / 主题。
 * 状态全部直读 store（chartConfigStore / uiStore / layoutStore…），App 只做装配。
 * 落点在 features/layout：P2-C 文件白名单内唯一可承载顶栏拆分的目录（布局菜单宿主于此）。
 */

function tfGroup(id: TimeframeId): string {
  if (id.endsWith('s')) return '秒';
  if (id.endsWith('m')) return '分钟';
  if (id.endsWith('H')) return '小时';
  return '日及以上';
}

/** 周期下拉选项：内置档位（自定义 id 运行时注册进 TIMEFRAMES，此处滤掉改由「自定义」分组展示）
 *  + 已存自定义周期 + 「自定义间隔…」动作项。运行时增删自定义周期后经 customVer 刷新重算。 */
function buildTfOptions(): ToolbarOption[] {
  return [
    ...TIMEFRAMES.filter((t) => !isCustomIntervalId(t.id)).map((t) => ({ value: t.id, label: t.label, group: tfGroup(t.id) })),
    ...customIntervalOptions(),
    { value: CUSTOM_INTERVAL_ACTION, label: '自定义间隔…', group: '自定义' },
  ];
}
const CT_OPTIONS: ToolbarOption[] = CHART_TYPES.map((c) => ({ value: c.id, label: c.label, group: c.timeBased ? '常规' : '特殊' }));

function ThemeButton() {
  const name = useThemeStore((s) => s.name);
  const toggle = useThemeStore((s) => s.toggle);
  return (
    <IconButton onClick={toggle} title={name === 'dark' ? '切换到浅色' : '切换到深色'}>
      {name === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </IconButton>
  );
}

/** 顶栏品种按钮：点击打开符号搜索，与 TradingView 图表左上角品种名一致 */
function SymbolButton({ instrument }: { instrument: Instrument | null }) {
  const openSearch = useSymbolSearchStore((s) => s.openSearch);
  const quote = useQuoteStore((s) => (instrument ? s.quotes[instrument.id] : undefined));
  if (!instrument) {
    return (
      <button className="tv-icon-btn" style={symbolBtnStyle} onClick={() => openSearch('switch')} title="搜索品种">
        选择品种
      </button>
    );
  }
  const dir = (quote?.changePct ?? 0) > 0 ? 'var(--up)' : (quote?.changePct ?? 0) < 0 ? 'var(--down)' : 'var(--text-faint)';
  return (
    <button
      className="tv-icon-btn"
      style={{ ...symbolBtnStyle, height: 'auto', padding: '2px 8px' }}
      onClick={() => openSearch('switch')}
      title="搜索品种（/ 或 Ctrl+K）"
      aria-label={`当前品种 ${instrument.symbol} ${instrument.name}，点击搜索其他品种`}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: fontSize.xl, fontWeight: 700, color: 'var(--text)' }}>{instrument.symbol}</span>
        <span style={{ fontSize: fontSize.sm, color: 'var(--text-faint)' }}>
          {instrument.name} · {MARKETS[instrument.market].label}
        </span>
        {quote && (
          <span style={{ fontSize: fontSize.md, color: dir, fontWeight: 600 }}>
            {quote.price.toFixed(decimalsFor(quote.price, instrument.decimals))}
          </span>
        )}
      </span>
      <ChevronDown size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
    </button>
  );
}

/** 对比品种按钮（P2-D）：开关叠加品种选择浮层；已有对比时常亮，标题显示当前对比品种 */
function CompareButton() {
  const compare = useChartConfigStore((s) => s.compareSymbol);
  const pickerOpen = useChartConfigStore((s) => s.comparePickerOpen);
  const setPickerOpen = useChartConfigStore((s) => s.setComparePickerOpen);
  return (
    <IconButton
      active={pickerOpen || compare !== null}
      onClick={() => setPickerOpen(!pickerOpen)}
      title={compare ? `对比品种：${compare.symbol}（点击更换或移除）` : '叠加对比品种'}
      aria-label="叠加对比品种"
    >
      <GitCompareArrows size={16} />
    </IconButton>
  );
}

export function TopBar({
  rendererRef,
  series,
  barsCount,
  onScreenshot,
}: {
  /** 主图 renderer（复原/重做用；多图表布局下为 null） */
  rendererRef: { current: ChartRenderer | null };
  series: ChartSeries;
  barsCount: number;
  /** 生成快照（App 持有：命令面板与快捷键共用同一下发） */
  onScreenshot: () => void;
}) {
  const layout = useLayoutStore((s) => s.layout);
  const activeInstrument = useWatchlistStore(selectActiveInstrument);
  const timeframe = useChartConfigStore((s) => s.timeframe);
  const setTimeframe = useChartConfigStore((s) => s.setTimeframe);
  const chartType = useChartConfigStore((s) => s.chartType);
  const setChartType = useChartConfigStore((s) => s.setChartType);
  const customVer = useUiStore((s) => s.customVer);
  const tfOptions = useMemo(buildTfOptions, [customVer]);
  const tf = getTimeframe(timeframe);
  const replayActive = useReplayStore((s) => s.index !== null || s.selectMode);

  const panelOpen = useIndicatorStore((s) => s.panelOpen);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const pineOpen = usePineStore((s) => s.panelOpen);
  const setPineOpen = usePineStore((s) => s.setPanelOpen);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  return (
    <div style={topBarStyle}>
      <strong style={{ color: 'var(--text)', fontSize: 13, marginRight: 4 }}>TradingPA</strong>
      <SymbolButton instrument={activeInstrument} />
      {layout === 1 && <CompareButton />}
      {layout === 1 && (
        <>
          <ToolbarSelect
            ariaLabel="周期"
            value={timeframe}
            options={tfOptions}
            label={tf.label}
            minWidth={104}
            onChange={(v) => {
              if (v === CUSTOM_INTERVAL_ACTION) {
                useUiStore.getState().setCustomIntervalOpen(true);
                return;
              }
              setTimeframe(v as TimeframeId);
            }}
          />
          <ToolbarSelect
            ariaLabel="图表类型"
            value={chartType}
            options={CT_OPTIONS}
            icon={<CandlestickChart size={14} />}
            minWidth={120}
            onChange={(v) => setChartType(v as ChartTypeId)}
          />
          <IconButton
            active={replayActive}
            onClick={() => {
              if (barsCount < 10) return; // 数据未就绪不进回放
              useReplayStore.getState().enterSelect(); // 默认进入选择K线
            }}
            title="回放：点击后在图表上选择 K 线作为起点"
          >
            <Play size={16} />
          </IconButton>
        </>
      )}
      {/* 指标按钮 + 指标列表框（需求②）：面板挂按钮正下方，绝对定位于外包 relative 容器；
          指标模板的保存/加载已收口进面板底部「模板」分区（TV 指标对话框 Templates 形态） */}
      <div style={{ position: 'relative', display: 'flex' }}>
        <IconButton active={panelOpen} onClick={() => setPanelOpen(!panelOpen)} title="指标">
          <BarChart3 size={16} />
        </IconButton>
        {panelOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: space.xs, zIndex: zIndex.dropdown }}>
            <IndicatorPanel />
          </div>
        )}
      </div>
      <span style={{ flex: 1 }} />
      {layout === 1 && (
        <>
          <IconButton onClick={() => rendererRef.current?.undoDrawing()} title="复原">
            <Undo2 size={16} />
          </IconButton>
          <IconButton onClick={() => rendererRef.current?.redoDrawing()} title="重做">
            <Redo2 size={16} />
          </IconButton>
        </>
      )}
      <LayoutSaveMenu />
      <LayoutMenu />
      <IconButton onClick={() => useUiStore.getState().setChartSettingsOpen(true)} title="图表设置">
        <Settings2 size={16} />
      </IconButton>
      <IconButton active={pineOpen} onClick={() => setPineOpen(!pineOpen)} title="Pine 编辑器">
        <FileCode2 size={16} />
      </IconButton>
      <IconButton onClick={() => useSymbolSearchStore.getState().openSearch('switch')} title="快速搜索">
        <Search size={16} />
      </IconButton>
      <IconButton onClick={() => useUiStore.getState().setCommandOpen(true)} title="命令面板（Ctrl+P）">
        <Command size={16} />
      </IconButton>
      <IconButton onClick={toggleFullscreen} title="全屏模式">
        <Maximize2 size={16} />
      </IconButton>
      <IconButton onClick={onScreenshot} title="生成快照">
        <Camera size={16} />
      </IconButton>
      {layout === 1 && (
        <IconButton onClick={series.reload} title={series.mode === 'mock' ? '重新连接实时数据' : '重新加载历史数据'}>
          <RefreshCw size={16} />
        </IconButton>
      )}
      <ThemeButton />
    </div>
  );
}

const symbolBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 26,
  padding: '0 8px',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
};

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 38,
  padding: '0 8px',
  background: 'var(--panel)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
  // 不设 overflow 滚动：指标列表框（需求②）以按钮为锚 absolute 展开在顶栏下方，
  // overflow 裁剪会把浮层切掉；窄屏由各控件自身 flex-shrink 收敛
};
