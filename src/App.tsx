import { useMemo, useState } from 'react';
import { Chart } from '@/components/Chart';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { generateMockBars } from '@/data/mockData';
import { aggregateBars } from '@/data/aggregate';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useDrawingStore } from '@/store/drawingStore';
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { IndicatorSettingsDialog } from '@/features/indicators/IndicatorSettingsDialog';
import { ActiveIndicatorChips } from '@/features/indicators/ActiveIndicatorChips';
import { DrawingToolbar } from '@/features/drawings/DrawingToolbar';
import { ObjectTree } from '@/features/drawings/ObjectTree';

const selectStyle: React.CSSProperties = {
  background: '#1e222d',
  color: '#d1d4dc',
  border: '1px solid #2a2e39',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  background: '#2a2e39',
  color: '#d1d4dc',
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

export default function App() {
  const [timeframe, setTimeframe] = useState<TimeframeId>('1m');
  const [chartType, setChartType] = useState<ChartTypeId>('candles');
  const [logScale, setLogScale] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [renderer, setRenderer] = useState<ChartRenderer | null>(null);

  const panelOpen = useIndicatorStore((s) => s.panelOpen);
  const setPanelOpen = useIndicatorStore((s) => s.setPanelOpen);
  const settingsFor = useIndicatorStore((s) => s.settingsFor);
  const saveTemplate = useIndicatorStore((s) => s.saveTemplate);
  const loadTemplate = useIndicatorStore((s) => s.loadTemplate);
  const treeOpen = useDrawingStore((s) => s.treeOpen);
  const setTreeOpen = useDrawingStore((s) => s.setTreeOpen);

  const baseBars = useMemo(() => generateMockBars(100_000, 60_000, 30_000), []);
  const tf = getTimeframe(timeframe);
  const bars = useMemo(
    () => (timeframe === '1m' ? baseBars : aggregateBars(baseBars, tf)),
    [baseBars, timeframe, tf],
  );

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#131722', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: '#1e222d',
          borderBottom: '1px solid #2a2e39',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: '#d1d4dc', fontSize: 13, marginRight: 8 }}>TradingPA</strong>
        <select style={selectStyle} value={timeframe} onChange={(e) => setTimeframe(e.target.value as TimeframeId)}>
          {TIMEFRAMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={chartType} onChange={(e) => setChartType(e.target.value as ChartTypeId)}>
          {CHART_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button style={{ ...btnStyle, background: panelOpen ? '#2962ff' : '#2a2e39' }} onClick={() => setPanelOpen(!panelOpen)}>
          指标
        </button>
        <button style={btnStyle} onClick={saveTemplate}>
          存模板
        </button>
        <button style={btnStyle} onClick={loadTemplate}>
          取模板
        </button>
        <button style={btnStyle} onClick={() => setTreeOpen(!treeOpen)}>
          对象树
        </button>
        <button
          style={btnStyle}
          onClick={() => {
            const raw = renderer?.exportDrawings() ?? '[]';
            void navigator.clipboard?.writeText(raw);
          }}
          title="复制画线 JSON 到剪贴板"
        >
          导画线
        </button>
        <button
          style={btnStyle}
          onClick={() => {
            const raw = window.prompt('粘贴画线 JSON 导入');
            if (raw) renderer?.importDrawings(raw);
          }}
          title="从 JSON 导入画线"
        >
          入画线
        </button>
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
          对数
        </label>
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          成交量
        </label>
        <ActiveIndicatorChips />
        <span style={{ color: '#787b86', fontSize: 11, marginLeft: 'auto' }}>
          {bars.length.toLocaleString()} 根 · {tf.label}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Chart
          bars={bars}
          symbol="BTC/USDT"
          interval={tf.label}
          decimals={2}
          liveTickMs={800}
          chartType={chartType}
          logScale={logScale}
          showVolume={showVolume}
          onRendererReady={setRenderer}
        />
        <DrawingToolbar />
        {panelOpen && <IndicatorPanel />}
        {treeOpen && <ObjectTree renderer={renderer} onClose={() => setTreeOpen(false)} />}
        {settingsFor && <IndicatorSettingsDialog id={settingsFor} />}
      </div>
    </div>
  );
}
