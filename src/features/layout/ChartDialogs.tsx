import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Bar } from '@/types/market';
import type { TimeframeId } from '@/types/market';
import { getTimeframe } from '@/types/market';
import type { Instrument } from '@/types/instrument';
import { useChartConfigStore } from '@/store/chartConfigStore';
import { useUiStore } from '@/store/uiStore';
import { useReplayStore } from '@/store/replayStore';
import { eachChartRenderer } from '@/hooks/useTvShortcuts';
import { ShortcutsDialog } from '@/features/settings/ShortcutsDialog';
import { GoToDateDialog } from '@/features/market/GoToDateDialog';
import { IntervalInputDialog } from '@/features/market/IntervalInputDialog';
import { CustomIntervalDialog } from '@/features/market/CustomIntervalDialog';
import { ChartSettingsDialog } from '@/features/settings/ChartSettingsDialog';
import { ChartContextMenu } from '@/features/market/ChartContextMenu';
import { LegendContextMenu } from '@/features/indicators/LegendContextMenu';
import { DrawingContextMenu } from '@/features/drawings/DrawingContextMenu';

/**
 * 图表对话框集群（P2-C 自 App.tsx 拆出）：快捷键说明 / 周期输入 / 自定义间隔 /
 * 前往日期 / 图表设置 / 三个右键菜单。开合状态全部收敛在 uiStore。
 * 落点在 features/layout：P2-C 文件白名单内唯一可承载拆分的目录。
 */
export function ChartDialogs({
  bars,
  renderer,
  instrument,
  applyInterval,
}: {
  bars: Bar[];
  renderer: ChartRenderer | null;
  instrument: Instrument | null;
  /** 周期浮层确认（useTvShortcuts：单图走 store，多图表走聚焦单元格） */
  applyInterval: (tf: TimeframeId) => void;
}) {
  const timeframe = useChartConfigStore((s) => s.timeframe);
  const setTimeframe = useChartConfigStore((s) => s.setTimeframe);
  const logScale = useChartConfigStore((s) => s.logScale);
  const setLogScale = useChartConfigStore((s) => s.setLogScale);
  const percent = useChartConfigStore((s) => s.percent);
  const setPercent = useChartConfigStore((s) => s.setPercent);
  const autoScale = useChartConfigStore((s) => s.autoScale);
  const setAutoScale = useChartConfigStore((s) => s.setAutoScale);
  const legendOpts = useChartConfigStore((s) => s.legendOpts);
  const setLegendOpts = useChartConfigStore((s) => s.setLegendOpts);
  const tf = getTimeframe(timeframe);

  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const intervalOpen = useUiStore((s) => s.intervalOpen);
  const intervalInitial = useUiStore((s) => s.intervalInitial);
  const setIntervalOpen = useUiStore((s) => s.setIntervalOpen);
  const customIntervalOpen = useUiStore((s) => s.customIntervalOpen);
  const setCustomIntervalOpen = useUiStore((s) => s.setCustomIntervalOpen);
  const bumpCustomVer = useUiStore((s) => s.bumpCustomVer);
  const goToDateOpen = useUiStore((s) => s.goToDateOpen);
  const setGoToDateOpen = useUiStore((s) => s.setGoToDateOpen);
  const chartSettingsOpen = useUiStore((s) => s.chartSettingsOpen);
  const setChartSettingsOpen = useUiStore((s) => s.setChartSettingsOpen);
  const chartMenu = useUiStore((s) => s.chartMenu);
  const setChartMenu = useUiStore((s) => s.setChartMenu);
  const legendMenu = useUiStore((s) => s.legendMenu);
  const setLegendMenu = useUiStore((s) => s.setLegendMenu);
  const drawingMenu = useUiStore((s) => s.drawingMenu);
  const setDrawingMenu = useUiStore((s) => s.setDrawingMenu);

  /** 前往日期定位：复盘模式走 store（与 ReplayBar 定位同一路径，未来 K 线不越权）；
   *  普通模式把目标 bar 居中显示——借用 setReplayIndex 首次选中的居中逻辑后立即关闭复盘边缘 */
  const handleGoToDate = (index: number) => {
    if (useReplayStore.getState().index !== null) {
      useReplayStore.getState().setIndex(index);
      return;
    }
    eachChartRenderer((r) => {
      r.setReplayIndex(index);
      r.setReplayIndex(null);
    });
  };

  return (
    <>
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <IntervalInputDialog
        open={intervalOpen}
        initial={intervalInitial}
        currentLabel={tf.label}
        onOpenChange={setIntervalOpen}
        onApply={applyInterval}
      />
      <CustomIntervalDialog
        open={customIntervalOpen}
        onOpenChange={(o) => {
          setCustomIntervalOpen(o);
          if (!o) bumpCustomVer(); // 关闭浮层后刷新下拉（可能新增/删除了自定义周期）
        }}
        currentLabel={tf.label}
        onApply={(t) => setTimeframe(t.id as TimeframeId)}
      />
      <GoToDateDialog open={goToDateOpen} onClose={() => setGoToDateOpen(false)} bars={bars} onGoToDate={handleGoToDate} />
      <ChartSettingsDialog
        open={chartSettingsOpen}
        onClose={() => setChartSettingsOpen(false)}
        logScale={logScale}
        percent={percent}
        autoScale={autoScale}
        legend={legendOpts}
        renderer={renderer}
        onLog={setLogScale}
        onPercent={setPercent}
        onAuto={setAutoScale}
        onLegend={(patch) => setLegendOpts(patch)}
      />
      <ChartContextMenu
        state={chartMenu}
        instrument={instrument}
        renderer={renderer}
        onOpenSettings={() => setChartSettingsOpen(true)}
        onGoToDate={() => setGoToDateOpen(true)}
        onClose={() => setChartMenu(null)}
      />
      <LegendContextMenu
        state={legendMenu}
        legend={legendOpts}
        onLegend={(patch) => setLegendOpts(patch)}
        onOpenSettings={() => setChartSettingsOpen(true)}
        onClose={() => setLegendMenu(null)}
      />
      <DrawingContextMenu state={drawingMenu} renderer={renderer} onClose={() => setDrawingMenu(null)} />
    </>
  );
}
