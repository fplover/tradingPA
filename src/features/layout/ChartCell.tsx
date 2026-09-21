import { useMemo, useState } from 'react';
import { Chart } from '@/components/Chart';
import { generateSeededMockBars } from '@/data/mockData';
import { aggregateBars } from '@/data/aggregate';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';

const selectStyle: React.CSSProperties = {
  background: '#1e222d',
  color: '#d1d4dc',
  border: '1px solid #2a2e39',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 11,
};

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];

/** 多图表布局中的单个单元格（模拟数据 + 独立状态 + 联动） */
export function ChartCell({ index }: { index: number }) {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOLS[index % DEFAULT_SYMBOLS.length]);
  const [timeframe, setTimeframe] = useState<TimeframeId>('5m');
  const [chartType, setChartType] = useState<ChartTypeId>('candles');
  const tf = getTimeframe(timeframe);

  const bars = useMemo(() => {
    const base = generateSeededMockBars(symbol, 5000, 60_000);
    return timeframe === '1m' ? base : aggregateBars(base, tf);
  }, [symbol, timeframe, tf]);

  return (
    <div style={{ position: 'relative', minWidth: 0, minHeight: 0, borderRight: '1px solid #2a2e39', borderBottom: '1px solid #2a2e39' }}>
      <div style={{ position: 'absolute', top: 4, left: 6, zIndex: 10, display: 'flex', gap: 4 }}>
        <select style={selectStyle} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {DEFAULT_SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
      </div>
      <Chart bars={bars} symbol={symbol} interval={tf.label} decimals={2} chartType={chartType} sync />
    </div>
  );
}
