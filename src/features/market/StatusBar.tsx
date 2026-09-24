import { fontSize, space } from '@/ui/tokens';

interface StatusBarProps {
  barsCount: number;
  intervalLabel: string;
  /** 数据源状态文案，如「腾讯财经」 */
  statusText: string;
  percent: boolean;
  onTogglePercent: () => void;
  logScale: boolean;
  onToggleLog: () => void;
  autoScale: boolean;
  onToggleAuto: () => void;
}

function timeZoneLabel(): string {
  const offset = -new Date().getTimezoneOffset() / 60;
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `UTC${sign}${abs % 1 === 0 ? abs : abs.toFixed(1)}`;
}

/**
 * 图表底部控制栏（TV 39px = 38 内容 + 1 顶边框）：
 * 左 UTC 时区与数据状态，右 % / log / auto 坐标开关。
 * 磁吸/锁定/隐藏画线按 TV 归左画线工具栏底部，不在这里。
 */
export function StatusBar({
  barsCount,
  intervalLabel,
  statusText,
  percent,
  onTogglePercent,
  logScale,
  onToggleLog,
  autoScale,
  onToggleAuto,
}: StatusBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.sm,
        height: 38,
        padding: `0 ${space.xs}px`,
        background: 'var(--panel)',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-faint)',
        fontSize: fontSize.lg,
        flexShrink: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--text-dim)', padding: `0 ${space.xs}px` }}>{timeZoneLabel()}</span>
      <span style={{ padding: `0 ${space.xs}px` }}>
        {statusText} · {barsCount.toLocaleString()} 根 · {intervalLabel}
      </span>

      <span style={{ flex: 1 }} />

      <Toggle label="切换为百分比坐标" active={percent} onClick={onTogglePercent}>
        %
      </Toggle>
      <Toggle label="切换为对数坐标" active={logScale} onClick={onToggleLog}>
        log
      </Toggle>
      <Toggle label="切换为自动坐标" active={autoScale} onClick={onToggleAuto}>
        auto
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
        height: 24,
        padding: `0 ${space.sm - 2}px`,
        background: 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-faint)',
        border: 'none',
        borderRadius: 3,
        fontSize: fontSize.lg,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
