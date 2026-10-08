import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useIndicatorStore } from '@/store/indicatorStore';
import { getIndicatorDef } from '@/indicators/registry';
import { pineAlertsOf } from '@/indicators/pine/alerts';
import { useAlertStore } from '@/store/alertStore';
import { COOLDOWN_OPTIONS, EXPIRY_OPTIONS, type AlertFrequency } from './alertLogic';
import { miniBtn, rowStyle } from './ui';
import { icon } from '@/ui/tokens';

interface PineConditionSectionProps {
  symbol: string;
  /** 频率/冷却/过期跟随主表单当前选择（与价格/指标警报一致） */
  frequency: AlertFrequency;
  cooldownIdx: number;
  expiryIdx: number;
}

interface PineCondRow {
  indicatorId: string;
  indicatorName: string;
  key: string;
  title: string;
  message: string;
}

/**
 * Pine 条件分区（P2-A③）：列出当前激活自定义 Pine 指标经 alertcondition 编译期
 * 注册的条件（indicatorStore.active + pine 注册表读取），一键添加为警报
 * （条件源 = 该 Pine 条件；触发判定走 useAlertWatcher 同一采样机制）。
 * 非 Pine 指标无注册条件 → 分区整体不渲染。
 */
export function PineConditionSection({ symbol, frequency, cooldownIdx, expiryIdx }: PineConditionSectionProps) {
  const active = useIndicatorStore((s) => s.active);
  const add = useAlertStore((s) => s.add);

  const rows: PineCondRow[] = useMemo(() => {
    const out: PineCondRow[] = [];
    for (const a of active) {
      const entries = pineAlertsOf(a.id);
      if (entries.length === 0) continue;
      const def = getIndicatorDef(a.id);
      for (const e of entries) {
        out.push({
          indicatorId: a.id,
          indicatorName: def?.name ?? a.id,
          key: e.key,
          title: e.title || e.key,
          message: e.message,
        });
      }
    }
    return out;
  }, [active]);

  if (rows.length === 0) return null;
  const expiryMs = Number(EXPIRY_OPTIONS[expiryIdx]?.value ?? 0);

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: 'var(--text-faint)', fontSize: 10, margin: '2px 0' }}>Pine 条件</div>
      {rows.map((r) => (
        <div key={`${r.indicatorId}:${r.key}`} style={rowStyle}>
          <span
            style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={r.message || r.title}
          >
            {r.indicatorName}·{r.title}
          </span>
          <button
            style={miniBtn}
            title="添加为警报"
            aria-label="添加为警报"
            onClick={() =>
              add({
                symbol,
                source: { type: 'pine', indicatorId: r.indicatorId, key: r.key },
                threshold: 1,
                condition: 'greater',
                frequency,
                cooldownMs: Number(COOLDOWN_OPTIONS[cooldownIdx]?.value ?? 0) || undefined,
                expiresAt: expiryMs > 0 ? Date.now() + expiryMs : undefined,
              })
            }
          >
            <Plus size={icon.sm} />
          </button>
        </div>
      ))}
    </div>
  );
}
