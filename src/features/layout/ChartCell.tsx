import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Chart } from '@/components/Chart';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { generateSeededMockBars } from '@/data/mockData';
import { aggregateBars } from '@/data/aggregate';
import { CHART_TYPES, TIMEFRAMES, getTimeframe, type ChartTypeId, type TimeframeId } from '@/types/market';
import { CELL_DEFAULT_SYMBOLS, defaultCell, useLayoutStore } from '@/store/layoutStore';
import { syncBus } from '@/store/syncBus';

const selectStyle: React.CSSProperties = {
  background: 'var(--panel)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 11,
};

const titleBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 4px',
  background: 'var(--panel)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
  userSelect: 'none',
  cursor: 'pointer',
};

/** 多图表布局中的单个单元格（模拟数据 + 独立状态 + 联动）。
 *  symbol/timeframe/chartType 提升到 layoutStore（B8 布局快照的组成部分），本地不再持有。
 *  P2-C：窗格标题区双击 / Alt+Enter 最大化还原；品种/周期/画线三 channel 经 syncBus
 *  联动——sourceId 显式防环，发布侧读布局开关裁决；画线接收路径用导入抑制标志兜底
 *  （importDrawings 同步触发 onDrawingsChanged，无抑制会形成 A→B→A 乒乓）。 */
export function ChartCell({ index }: { index: number }) {
  const cell = useLayoutStore((s) => s.cells[index]) ?? defaultCell(index);
  const setCell = useLayoutStore((s) => s.setCell);
  const maximized = useLayoutStore((s) => s.maximizedCell === index);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximizeCell);
  const { symbol, timeframe, chartType } = cell;
  const tf = getTimeframe(timeframe);
  const [renderer, setRenderer] = useState<ChartRenderer | null>(null);
  /** 本单元格的联动源标识：自己发出的事件不回送（显式防环） */
  const sourceId = useMemo(() => Symbol('cell-sync'), []);

  const bars = useMemo(() => {
    const base = generateSeededMockBars(symbol, 5000, 60_000);
    return timeframe === '1m' ? base : aggregateBars(base, tf);
  }, [symbol, timeframe, tf]);

  // 品种/周期联动：订阅常驻；发布只在用户改下拉时（接收路径不再发布，防环）
  useEffect(() => {
    const offSymbol = syncBus.onSymbol((sym) => setCell(index, { symbol: sym }), sourceId);
    const offInterval = syncBus.onInterval((t) => setCell(index, { timeframe: t }), sourceId);
    return () => {
      offSymbol();
      offInterval();
    };
  }, [index, setCell, sourceId]);

  // 画线联动：renderer 就绪后订阅；开关关闭时不回发，接收导入时抑制回发
  useEffect(() => {
    if (!renderer) return;
    let applying = false;
    const off = syncBus.onDrawings((raw) => {
      applying = true;
      try {
        renderer.importDrawings(raw);
      } finally {
        applying = false;
      }
    }, sourceId);
    const offChanged = renderer.onDrawingsChanged(() => {
      if (applying) return;
      if (!useLayoutStore.getState().syncDrawings) return;
      syncBus.emitDrawings(renderer.exportDrawings(), sourceId);
    });
    return () => {
      off();
      offChanged();
    };
  }, [renderer, sourceId]);

  const changeSymbol = (v: string) => {
    setCell(index, { symbol: v });
    if (useLayoutStore.getState().syncSymbol) syncBus.emitSymbol(v, sourceId);
  };
  const changeTimeframe = (v: string) => {
    setCell(index, { timeframe: v as TimeframeId });
    if (useLayoutStore.getState().syncInterval) syncBus.emitInterval(v as TimeframeId, sourceId);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* 窗格标题区：双击最大化/还原（Alt+Enter 等效）；下拉与按钮的双击不冒泡触发 */}
      <div onDoubleClick={() => toggleMaximize(index)} title="双击最大化 / 还原（Alt+Enter）" style={titleBarStyle}>
        <select
          style={selectStyle}
          value={symbol}
          onChange={(e) => changeSymbol(e.target.value)}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {CELL_DEFAULT_SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={timeframe}
          onChange={(e) => changeTimeframe(e.target.value)}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {TIMEFRAMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={chartType}
          onChange={(e) => setCell(index, { chartType: e.target.value as ChartTypeId })}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {CHART_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => toggleMaximize(index)}
          onDoubleClick={(e) => e.stopPropagation()}
          title={maximized ? '还原窗格（Alt+Enter）' : '最大化窗格（Alt+Enter）'}
          aria-label={maximized ? '还原窗格' : '最大化窗格'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            background: 'transparent',
            color: 'var(--text-faint)',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Chart
          bars={bars}
          symbol={symbol}
          interval={tf.label}
          decimals={2}
          chartType={chartType}
          sync
          onRendererReady={setRenderer}
        />
      </div>
    </div>
  );
}
