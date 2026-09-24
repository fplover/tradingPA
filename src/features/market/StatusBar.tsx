import { Eye, EyeOff, Magnet } from 'lucide-react';
import { useDrawingStore } from '@/store/drawingStore';
import { fontSize, space } from '@/ui/tokens';

interface StatusBarProps {
  barsCount: number;
  intervalLabel: string;
  /** 数据源状态文案，如「腾讯财经 · 800 根」 */
  statusText: string;
  logScale: boolean;
  onToggleLog: () => void;
  autoScale: boolean;
  onToggleAuto: () => void;
  hideDrawings: boolean;
  onToggleHide: () => void;
}

function timeZoneLabel(): string {
  const offset = -new Date().getTimezoneOffset() / 60;
  const sign = offset >= 0 ? '+' : '-';
  return `UTC${sign}${Math.abs(offset) % 1 === 0 ? Math.abs(offset) : Math.abs(offset).toFixed(1)}`;
}

/** 图表底部状态栏：左侧时区与数据状态，右侧轴/画线开关（TradingView 同位置） */
export function StatusBar({
  barsCount,
  intervalLabel,
  statusText,
  logScale,
  onToggleLog,
  autoScale,
  onToggleAuto,
  hideDrawings,
  onToggleHide,
}: StatusBarProps) {
  const magnet = useDrawingStore((s) => s.magnet);
  const setMagnet = useDrawingStore((s) => s.setMagnet);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        height: 26,
        padding: `0 ${space.sm}px`,
        background: 'var(--panel)',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-faint)',
        fontSize: fontSize.sm,
        flexShrink: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--text-dim)' }}>{timeZoneLabel()}</span>
      <span>
        {statusText} · {barsCount.toLocaleString()} 根 · {intervalLabel}
      </span>

      <span style={{ flex: 1 }} />

      <Toggle label="磁吸（吸附 OHLC）" active={magnet} onClick={() => setMagnet(!magnet)}>
        <Magnet size={12} />
      </Toggle>
      <Toggle label="对数坐标" active={logScale} onClick={onToggleLog}>
        log
      </Toggle>
      <Toggle label="自动缩放价格域" active={autoScale} onClick={onToggleAuto}>
        auto
      </Toggle>
      <Toggle label={hideDrawings ? '显示画线' : '隐藏画线'} active={hideDrawings} onClick={onToggleHide}>
        {hideDrawings ? <EyeOff size={12} /> : <Eye size={12} />}
      </Toggle>
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        height: 20,
        padding: '0 6px',
        background: active ? 'var(--panel-2)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-faint)',
        border: 'none',
        borderRadius: 3,
        fontSize: fontSize.sm,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
