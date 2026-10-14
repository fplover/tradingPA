import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { DataWindowDrawing, DataWindowSnapshot, DataWindowStudy } from '@/engine/renderer/dataWindow';
import { useChartConfigStore } from '@/store/chartConfigStore';
import { tzDate } from '@/engine/renderer/drawAxes';
import { formatCompact, formatPrice } from '@/data/format';
import { radius } from '@/ui/tokens';

interface DataWindowPanelProps {
  renderer: ChartRenderer | null;
  decimals: number;
  onClose: () => void;
}

/**
 * 数据窗口：光标所在 bar 的 OHLCV + 全部可见指标读数 + 画线价格读数。
 * 数值全部来自引擎的 `dataWindowSnapshot`（显示序列 index 空间与回放钳制都封在引擎内），
 * 本组件只做展示与格式化；刷新由引擎的合帧广播驱动（`onDataWindowChanged`）。
 */
export function DataWindowPanel({ renderer, decimals, onClose }: DataWindowPanelProps) {
  const [snap, setSnap] = useState<DataWindowSnapshot | null>(null);
  const hour12 = useChartConfigStore((s) => s.timeHour12);
  const tzOffsetMinutes = useChartConfigStore((s) => s.tzOffsetMinutes);

  useEffect(() => {
    if (!renderer) return;
    const sync = () => setSnap(renderer.dataWindowSnapshot);
    sync();
    return renderer.onDataWindowChanged(sync);
  }, [renderer]);

  if (!renderer) return null;
  const bar = snap?.bar ?? null;
  const cursorPrice = snap?.cursorPrice ?? null;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: 'var(--text)', fontSize: 12 }}>
          数据窗口
          {snap?.fromCrosshair === false && (
            <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> · 跟随最新</span>
          )}
        </strong>
        <button style={closeBtn} onClick={onClose} aria-label="关闭数据窗口" title="关闭">
          <X size={14} />
        </button>
      </div>

      {bar ? (
        <>
          <Row label="时间" value={formatBarTime(bar.time, tzOffsetMinutes, hour12)} />
          <Row label="开盘" value={formatPrice(bar.open, decimals)} />
          <Row label="最高" value={formatPrice(bar.high, decimals)} />
          <Row label="最低" value={formatPrice(bar.low, decimals)} />
          <Row label="收盘" value={formatPrice(bar.close, decimals)} />
          <Row label="成交量" value={formatCompact(bar.volume)} />
          {cursorPrice !== null && <Row label="光标价" value={formatPrice(cursorPrice, decimals)} />}
        </>
      ) : (
        <Empty text="无 K 线数据" />
      )}

      <Section>指标</Section>
      {!snap || snap.studies.length === 0 ? (
        <Empty text="未添加指标（或已隐藏全部研究）" />
      ) : (
        snap.studies.map(renderStudy)
      )}

      <Section>画线</Section>
      {!snap || snap.drawings.length === 0 ? (
        <Empty text="无画线" />
      ) : (
        snap.drawings.map((d) => renderDrawing(d, decimals))
      )}
    </div>
  );
}

/** 指标一行一个 plot（多 plot 研究如 MACD 三值各占一行，标签带 plot 名） */
function renderStudy(study: DataWindowStudy) {
  if (study.values.length === 0) return <Row key={study.uid} label={study.name} value="—" />;
  return study.values.map((v) => (
    <Row
      key={`${study.uid}-${v.label}`}
      label={v.label ? `${study.name} ${v.label}` : study.name}
      value={fmtIndicatorValue(v.value, study.precision)}
    />
  ));
}

/** 画线一行一条读数；该 bar 上无读数（乙/丙/丁/戊档，或甲档在线段之外）一律 — */
function renderDrawing(d: DataWindowDrawing, decimals: number) {
  if (d.readings.length === 0) return <Row key={d.id} label={d.name} value="—" />;
  return d.readings.map((r) => (
    <Row
      key={`${d.id}-${r.label}`}
      label={r.label ? `${d.name} ${r.label}` : d.name}
      value={formatPrice(r.value, decimals)}
    />
  ));
}

/** 标签 + 数值一行（数值列等宽，随光标跳动不错位） */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div data-testid="dw-row" style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10, marginBottom: 2, fontSize: 10, color: 'var(--text-faint)', letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '2px 0' }}>{text}</div>;
}

/** 指标数值：带 precision 用 toFixed，否则与画布图例同一兜底位数（drawLegend.ts:151/:207） */
function fmtIndicatorValue(v: number, precision?: number): string {
  if (precision !== undefined) return v.toFixed(precision);
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(2);
  if (a >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

/** bar 时间的完整读数（数据窗口不像时间轴按间距降级，恒为「日期 时间」）：
 *  走 tzDate 与坐标轴同一显示时区换算；hour12 与轴日内段同规则（12 点不折半）。 */
function formatBarTime(time: number, tzOffsetMinutes: number | null, hour12: boolean): string {
  const d = tzDate(time, tzOffsetMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const h24 = d.getUTCHours();
  if (!hour12) return `${date} ${pad(h24)}:${pad(d.getUTCMinutes())}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${date} ${pad(h12)}:${pad(d.getUTCMinutes())} ${h24 < 12 ? 'AM' : 'PM'}`;
}

const panelStyle: React.CSSProperties = {
  color: 'var(--text)',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: 10,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 11,
  lineHeight: '18px',
  borderBottom: '1px solid var(--border)',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-dim)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const valueStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-dim)',
  cursor: 'pointer',
  padding: 2,
  borderRadius: radius.sm,
  display: 'flex',
};
