import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Chart } from '@/components/Chart';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Bar } from '@/types/market';
import type { Instrument } from '@/types/instrument';
import { getTimeframe } from '@/types/market';
import { useChartConfigStore } from '@/store/chartConfigStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useUiStore } from '@/store/uiStore';
import { usePineStore } from '@/store/pineStore';
import { useQuoteStore } from '@/store/quoteStore';
import { useReplayStore } from '@/store/replayStore';
import type { ChartSeries } from '@/features/market/useChartSeries';
import { buildCompareLegend, CompareSymbolPicker, useCompareSeries } from '@/features/market/useCompareSeries';
import { notifyDrawingsChanged, setDrawingsGetter } from '@/features/alerts/useAlertWatcher';
import type { SelectionPopupInfo } from '@/engine/renderer/selectionPopup';
import { SelectionToolbar } from '@/features/indicators/SelectionToolbar';
import { IndicatorSettingsDialog } from '@/features/indicators/IndicatorSettingsDialog';
import { DrawingToolbar } from '@/features/drawings/DrawingToolbar';
import { DrawingSettingsDialog } from '@/features/drawings/DrawingSettingsDialog';
import { PineEditorPanel } from '@/features/pine/PineEditorPanel';
import { ReplayBar } from '@/features/replay/ReplayBar';
import { TradePanel } from '@/features/trading/TradePanel';
import { ChartOrderMenu } from '@/features/trading/ChartOrderMenu';
import { SummaryReport } from '@/features/trading/SummaryReport';
import { StatusBar } from '@/features/market/StatusBar';
import { fontSize, space } from '@/ui/tokens';

/**
 * 单图布局主工作区（P2-C 自 App.tsx 拆出）：画线工具栏 + 主图 + 浮层 + 底部状态栏
 * + 回放/交易 UI。状态直读 store（chartConfigStore / uiStore / indicatorStore…），
 * renderer 仍由 App 持有（RightSide 与各对话框共用），经 props 下发。
 */
export function ChartWorkspace({
  bars,
  series,
  instrument,
  decimals,
  renderer,
  rendererRef,
  onRendererReady,
}: {
  bars: Bar[];
  series: ChartSeries;
  instrument: Instrument | null;
  decimals: number;
  renderer: ChartRenderer | null;
  rendererRef: { current: ChartRenderer | null };
  onRendererReady: (r: ChartRenderer | null) => void;
}) {
  const timeframe = useChartConfigStore((s) => s.timeframe);
  const chartType = useChartConfigStore((s) => s.chartType);
  const logScale = useChartConfigStore((s) => s.logScale);
  const percent = useChartConfigStore((s) => s.percent);
  const autoScale = useChartConfigStore((s) => s.autoScale);
  const drawingsLocked = useChartConfigStore((s) => s.drawingsLocked);
  const toggleDrawingsLocked = useChartConfigStore((s) => s.toggleDrawingsLocked);
  const hideDrawings = useChartConfigStore((s) => s.hideDrawings);
  const toggleHideDrawings = useChartConfigStore((s) => s.toggleHideDrawings);
  const hideStudies = useChartConfigStore((s) => s.hideStudies);
  const toggleHideStudies = useChartConfigStore((s) => s.toggleHideStudies);
  const legendOpts = useChartConfigStore((s) => s.legendOpts);
  const toggleLog = useChartConfigStore((s) => s.toggleLog);
  const togglePercent = useChartConfigStore((s) => s.togglePercent);
  const toggleAutoScale = useChartConfigStore((s) => s.toggleAutoScale);
  const tf = getTimeframe(timeframe);

  // 对比序列（P2-D①）：独立订阅 + 按 time 对齐主 series；图例数据组装后经 setLegend 下发
  const compareSymbol = useChartConfigStore((s) => s.compareSymbol);
  const comparePickerOpen = useChartConfigStore((s) => s.comparePickerOpen);
  const compare = useCompareSeries(compareSymbol, timeframe, bars);
  const compareLegend = useMemo(
    () => buildCompareLegend(compareSymbol?.symbol ?? '', compare.aligned),
    [compareSymbol, compare.aligned],
  );

  // 主图左缘懒加载（useLazyLoad 500ms 轮询触发）：主 series 与对比序列同步向左翻页，
  // 各自携带 inflight / 无更多守卫，互不等待。经 ref 间接调用保住回调身份稳定——
  // 否则每次渲染都重建 useLazyLoad 的轮询 effect，高频 tick 下左缘检测会被反复重置。
  const needsMoreRef = useRef<() => void>(() => {});
  needsMoreRef.current = () => {
    series.loadMore();
    compare.loadMore();
  };
  const handleNeedsMoreHistory = useCallback(() => needsMoreRef.current(), []);

  const settingsFor = useIndicatorStore((s) => s.settingsFor);
  const replayActive = useReplayStore((s) => s.index !== null || s.selectMode);
  const replayIndex = useReplayStore((s) => s.index);
  const pineOpen = usePineStore((s) => s.panelOpen);
  const reportOpen = useUiStore((s) => s.reportOpen);
  const setReportOpen = useUiStore((s) => s.setReportOpen);
  const setChartMenu = useUiStore((s) => s.setChartMenu);
  const setLegendMenu = useUiStore((s) => s.setLegendMenu);
  const setDrawingMenu = useUiStore((s) => s.setDrawingMenu);
  const setChartSettingsOpen = useUiStore((s) => s.setChartSettingsOpen);
  const activeQuote = useQuoteStore((s) => (instrument ? s.quotes[instrument.id] : undefined));

  // 选中画线/指标浮动工具栏（需求③）：引擎经 setSelectionPopupCallback 上报锚点，
  // 删除后引擎发 null 自动消失；renderer 重建（布局切换/重挂）时就地清除陈旧锚点。
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupInfo | null>(null);
  useEffect(() => setSelectionPopup(null), [renderer]);

  // 底部状态栏 / 左工具栏开关 → 渲染器（配置在 chartConfigStore，此处只做命令式下发）
  useEffect(() => {
    renderer?.setAutoScale(autoScale);
  }, [renderer, autoScale]);
  useEffect(() => {
    renderer?.setPercentMode(percent);
  }, [renderer, percent]);
  useEffect(() => {
    renderer?.setDrawingsHidden(hideDrawings);
  }, [renderer, hideDrawings]);
  useEffect(() => {
    renderer?.setDrawingsLocked(drawingsLocked);
  }, [renderer, drawingsLocked]);
  useEffect(() => {
    renderer?.setHideStudies(hideStudies);
  }, [renderer, hideStudies]);
  useEffect(() => {
    renderer?.setLegendOptions(legendOpts);
  }, [renderer, legendOpts]);

  // 对比序列 → renderer（P2-D①）：经 setLegend 既有公开通道下发，帧内随 legend 进
  // PaneRenderer（归一化叠加）与 drawLegendBlock（图例第二行）；无对比时显式清空。
  useEffect(() => {
    renderer?.setLegend({ compare: compareLegend ?? undefined });
  }, [renderer, compareLegend]);

  // 画线数据桥（P2-D②）：登记 exportDrawings getter，useAlertWatcher 的水平线采样
  // 与 AlertPanel 源列表共用同一读数入口；renderer 重建/卸载时重新登记或清空。
  useEffect(() => {
    if (!renderer) return;
    setDrawingsGetter(() => rendererRef.current?.exportDrawings() ?? null);
    const off = renderer.onDrawingsChanged(() => notifyDrawingsChanged());
    return () => {
      off();
      setDrawingsGetter(null);
    };
  }, [renderer, rendererRef]);

  /** 选择日期：二分查找第一个 >= 目标时间的 bar */
  const handleSeekToTime = (time: number) => {
    let lo = 0;
    let hi = bars.length - 1;
    let ans = bars.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time >= time) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    useReplayStore.getState().setIndex(Math.max(0, ans));
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <DrawingToolbar
          locked={drawingsLocked}
          onToggleLock={toggleDrawingsLocked}
          hideDrawings={hideDrawings}
          onToggleHide={toggleHideDrawings}
          onRemoveAll={(scope) => {
            if (scope === 'drawings' || scope === 'all') rendererRef.current?.clearDrawings();
            if (scope === 'studies' || scope === 'all') useIndicatorStore.getState().replaceAll([]);
          }}
        />
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Chart
            bars={bars}
            symbol={instrument?.symbol ?? '—'}
            interval={tf.label}
            decimals={decimals}
            timeframeId={timeframe}
            exchange={instrument?.exchange}
            market={instrument?.market}
            liveTickMs={series.mode === 'mock' ? 800 : undefined}
            chartType={chartType}
            logScale={logScale}
            onRendererReady={onRendererReady}
            onNeedsMoreHistory={handleNeedsMoreHistory}
            onChartContextMenu={(price, _time, x, y) => setChartMenu({ price, x, y })}
            onLegendMenu={(x, y) => setLegendMenu({ x, y })}
            onDrawingMenu={(id, x, y) => setDrawingMenu({ id, x, y })}
            onSelectionPopup={setSelectionPopup}
            onPriceLineDblClick={() => setChartSettingsOpen(true)}
          />
          {/* 对比品种选择浮层（P2-D）：顶栏 Compare 按钮经 chartConfigStore 开合 */}
          {comparePickerOpen && <CompareSymbolPicker />}
          {/* 选中画线/指标的 TV 式浮动工具栏（需求③）：锚点为 canvas CSS 像素 */}
          {selectionPopup && <SelectionToolbar info={selectionPopup} renderer={renderer} />}
          {settingsFor && <IndicatorSettingsDialog id={settingsFor} />}
          <DrawingSettingsDialog renderer={renderer} />

          {/* 该市场没有历史数据源时，明确说明原因而不是留一块空白画布 */}
          {bars.length === 0 && series.status === 'error' && (
            <div style={noDataStyle}>
              <div style={{ fontSize: fontSize.lg, color: 'var(--text-dim)', marginBottom: space.xs }}>
                无法载入 K 线
              </div>
              <div style={{ fontSize: fontSize.md, color: 'var(--text-faint)', lineHeight: 1.7 }}>
                {series.statusDetail}
              </div>
            </div>
          )}

          {/* 首批数据未就绪：居中加载指示，避免画布空白无反馈 */}
          {bars.length === 0 &&
            (series.status === 'idle' || series.status === 'loading' || series.status === 'reconnecting') && (
              <div style={noDataStyle}>
                <LoaderCircle
                  size={24}
                  className="spin"
                  style={{ color: 'var(--text-faint)', marginBottom: space.sm }}
                />
                <div style={{ fontSize: fontSize.md, color: 'var(--text-faint)' }}>
                  {series.status === 'reconnecting' ? '正在重新连接数据…' : series.statusDetail || '正在载入 K 线…'}
                </div>
              </div>
            )}
        </div>
      </div>
      {pineOpen && <PineEditorPanel />}
      <StatusBar
        barsCount={bars.length}
        intervalLabel={tf.label}
        statusText={series.mode === 'mock' ? '模拟数据' : series.statusDetail || series.status}
        dayChangePct={activeQuote?.changePct}
        percent={percent}
        onTogglePercent={togglePercent}
        logScale={logScale}
        onToggleLog={toggleLog}
        autoScale={autoScale}
        onToggleAuto={toggleAutoScale}
        hideStudies={hideStudies}
        onToggleHideStudies={toggleHideStudies}
        onOpenSettings={() => setChartSettingsOpen(true)}
        onShowRange={(fromTime) => rendererRef.current?.showRange(fromTime)}
        onZoomIn={() => rendererRef.current?.zoom(1.2)}
        onZoomOut={() => rendererRef.current?.zoom(1 / 1.2)}
        onPanLeft={() => rendererRef.current?.pan(-30)}
        onPanRight={() => rendererRef.current?.pan(30)}
        onResetView={() => rendererRef.current?.resetView()}
      />
      {replayActive && (
        <ReplayBar
          barCount={bars.length}
          intervalLabel={tf.label}
          price={bars[replayIndex ?? 0]?.close ?? 0}
          time={bars[replayIndex ?? 0]?.time ?? Date.now()}
          onSeekToTime={handleSeekToTime}
        />
      )}
      {replayIndex !== null && (
        <TradePanel
          price={bars[replayIndex]?.close ?? 0}
          time={bars[replayIndex]?.time ?? Date.now()}
          onReport={() => setReportOpen(true)}
        />
      )}
      {replayActive && <ChartOrderMenu decimals={decimals} />}
      {reportOpen && <SummaryReport onClose={() => setReportOpen(false)} />}
    </div>
  );
}

const noDataStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: space.xl,
  pointerEvents: 'none',
};
