import { Eye, EyeOff, Settings2 } from 'lucide-react';
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
  hideStudies: boolean;
  onToggleHideStudies: () => void;
  /** 底部齿轮：打开图表设置（TV 底部入口） */
  onOpenSettings: () => void;
  /** 时间范围预设：fromTime 毫秒时间戳；0 = 全部 */
  onShowRange: (fromTime: number) => void;
}

/** 底部时间范围预设（TV 时间轴下方预设条）：天数 → 按钮 */
const RANGES: Array<{ label: string; days: number }> = [
  { label: '1D', days: 1 },
  { label: '5D', days: 5 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 182 },
  { label: '1Y', days: 365 },
  { label: '5Y', days: 1825 },
  { label: 'All', days: 0 },
];

function timeZoneLabel(): string {
  const offset = -new Date().getTimezoneOffset() / 60;
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `UTC${sign}${abs % 1 === 0 ? abs : abs.toFixed(1)}`;
}

/**
 * 图表底部控制栏（TV 39px = 38 内容 + 1 顶边框）：
 * 左 UTC 时区与数据状态 + 时间范围预设 + 齿轮，右 % / log / auto 坐标开关。
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
  hideStudies,
  onToggleHideStudies,
  onOpenSettings,
  onShowRange,
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

      {/* 时间范围预设（TV 预设条）：按自然日回看 */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, padding: `0 ${space.xs}px` }}>
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => onShowRange(r.days === 0 ? 0 : Date.now() - r.days * 86400000)}
            title={`显示${r.label === 'All' ? '全部' : `最近${r.label}`}数据`}
            aria-label={`显示${r.label === 'All' ? '全部' : `最近${r.label}`}数据`}
            style={rangeBtnStyle}
          >
            {r.label}
          </button>
        ))}
      </span>

      <button
        onClick={onOpenSettings}
        title="图表设置"
        aria-label="图表底部设置"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          background: 'transparent',
          color: 'var(--text-faint)',
          border: 'none',
          borderRadius: 3,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <Settings2 size={14} />
      </button>

      <span style={{ flex: 1 }} />

      <button
        onClick={onToggleHideStudies}
        title={hideStudies ? '显示所有指标' : '隐藏所有指标'}
        aria-label={hideStudies ? '显示所有指标' : '隐藏所有指标'}
        aria-pressed={hideStudies}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 22,
          padding: `0 ${space.xs + 2}px`,
          background: 'transparent',
          color: hideStudies ? 'var(--accent)' : 'var(--text-faint)',
          border: 'none',
          borderRadius: 3,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {hideStudies ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
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

const rangeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-faint)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: '2px 5px',
  borderRadius: 3,
  flexShrink: 0,
};

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
