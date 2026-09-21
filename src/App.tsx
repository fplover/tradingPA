import { useMemo, useState } from 'react';
import { Chart } from '@/components/Chart';
import { generateMockBars } from '@/data/mockData';
import { aggregateBars } from '@/data/aggregate';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';

const selectStyle: React.CSSProperties = {
  background: '#1e222d',
  color: '#d1d4dc',
  border: '1px solid #2a2e39',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
};

export default function App() {
  const [timeframe, setTimeframe] = useState<TimeframeId>('1m');
  const [chartType, setChartType] = useState<ChartTypeId>('candles');
  const [logScale, setLogScale] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

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
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
          对数坐标
        </label>
        <label style={{ color: '#b2b5be', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          成交量
        </label>
        <span style={{ color: '#787b86', fontSize: 11, marginLeft: 'auto' }}>
          {bars.length.toLocaleString()} 根 · {tf.label}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Chart
          bars={bars}
          symbol="BTC/USDT"
          interval={tf.label}
          decimals={2}
          liveTickMs={800}
          chartType={chartType}
          logScale={logScale}
          showVolume={showVolume}
        />
      </div>
    </div>
  );
}
