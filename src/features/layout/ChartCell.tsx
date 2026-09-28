import { useMemo } from 'react';
import { Chart } from '@/components/Chart';
import { generateSeededMockBars } from '@/data/mockData';
import { aggregateBars } from '@/data/aggregate';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';
import { CELL_DEFAULT_SYMBOLS, defaultCell, useLayoutStore } from '@/store/layoutStore';

const selectStyle: React.CSSProperties = {
  background: 'var(--panel)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 11,
};

/** 多图表布局中的单个单元格（模拟数据 + 独立状态 + 联动）。
 *  symbol/timeframe/chartType 提升到 layoutStore（B8 布局快照的组成部分），本地不再持有。 */
export function ChartCell({ index }: { index: number }) {
  const cell = useLayoutStore((s) => s.cells[index]) ?? defaultCell(index);
  const setCell = useLayoutStore((s) => s.setCell);
  const { symbol, timeframe, chartType } = cell;
  const tf = getTimeframe(timeframe);

  const bars = useMemo(() => {
    const base = generateSeededMockBars(symbol, 5000, 60_000);
    return timeframe === '1m' ? base : aggregateBars(base, tf);
  }, [symbol, timeframe, tf]);

  return (
    <div style={{ position: 'relative', minWidth: 0, minHeight: 0, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ position: 'absolute', top: 4, left: 6, zIndex: 10, display: 'flex', gap: 4 }}>
        <select style={selectStyle} value={symbol} onChange={(e) => setCell(index, { symbol: e.target.value })}>
          {CELL_DEFAULT_SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={timeframe} onChange={(e) => setCell(index, { timeframe: e.target.value as TimeframeId })}>
          {TIMEFRAMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={chartType} onChange={(e) => setCell(index, { chartType: e.target.value as ChartTypeId })}>
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
