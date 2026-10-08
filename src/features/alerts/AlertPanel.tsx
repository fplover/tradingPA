import { useMemo, useSyncExternalStore, useState } from 'react';
import { Bell, Pause, Pencil, Play, Plus, X } from 'lucide-react';
import { useAlertStore, type PriceAlert } from '@/store/alertStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { getIndicatorDef } from '@/indicators/registry';
import {
  CONDITION_OPTIONS,
  COOLDOWN_OPTIONS,
  EXPIRY_OPTIONS,
  FREQUENCY_OPTIONS,
  describeCondition,
  describeSource,
  resolveIndicatorAlertSource,
  type AlertCondition,
  type AlertFrequency,
  type AlertSource,
} from './alertLogic';
import { AlertEditDialog } from './AlertEditDialog';
import { PineConditionSection } from './PineConditionSection';
import { currentHlines, subscribeDrawings } from './useAlertWatcher';
import { ToolbarSelect, type ToolbarOption } from '@/ui/ToolbarSelect';
import { btnStyle, inputStyle, miniBtn, panelStyle, rowStyle } from './ui';
import { icon } from '@/ui/tokens';

interface AlertPanelProps {
  symbol: string;
  currentPrice: number;
}

const PRICE_SOURCE = 'price';

/** 源下拉选项：价格 + 当前已挂指标（P1-C 作用对象扩展到指标值） */
function useSourceOptions(): ToolbarOption[] {
  const active = useIndicatorStore((s) => s.active);
  return useMemo(() => {
    const defs = active.map((a) => getIndicatorDef(a.id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
    return [
      { value: PRICE_SOURCE, label: '价格', group: '作用对象' },
      ...defs.map((d) => ({ value: d.id, label: d.name, group: '指标' })),
    ];
  }, [active]);
}

/** 新建表单 + 列表 + 编辑浮层入口 */
export function AlertPanel({ symbol, currentPrice }: AlertPanelProps) {
  const alerts = useAlertStore((s) => s.alerts);
  const add = useAlertStore((s) => s.add);
  const remove = useAlertStore((s) => s.remove);
  const togglePause = useAlertStore((s) => s.togglePause);
  const clearTriggered = useAlertStore((s) => s.clearTriggered);

  const sourceOptions = useSourceOptions();
  const [sourceId, setSourceId] = useState(PRICE_SOURCE);
  const [plotKey, setPlotKey] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('greater');
  const [threshold, setThreshold] = useState('');
  const [frequency, setFrequency] = useState<AlertFrequency>('once');
  const [cooldownIdx, setCooldownIdx] = useState(0);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const def = sourceId === PRICE_SOURCE ? undefined : getIndicatorDef(sourceId);
  const plotOptions: ToolbarOption[] = useMemo(
    () => (def ? def.plots.map((p) => ({ value: p.key, label: p.label })) : []),
    [def],
  );
  // 指标源解析走 alertLogic 纯函数：plotKey 无效回退首个 plot；指标缺失或无任何
  // plot → null。空 plot 不静默降级为价格警报——阻止创建并明示（用户口径 2026-10-08）
  const indicatorSource = sourceId === PRICE_SOURCE ? null : resolveIndicatorAlertSource(sourceId, plotKey, def);
  const noPlotOutput = sourceId !== PRICE_SOURCE && indicatorSource === null;
  const effPlotKey = indicatorSource?.plotKey ?? '';

  const submit = () => {
    const t = Number(threshold);
    if (!Number.isFinite(t) || threshold.trim() === '') return;
    if (noPlotOutput) return; // 无可用输出：UI 已明示，不创建也不降级为价格警报
    const source: AlertSource = indicatorSource ?? { type: 'price' };
    const expiryMs = Number(EXPIRY_OPTIONS[expiryIdx]?.value ?? 0);
    add({
      symbol,
      source,
      threshold: t,
      condition,
      frequency,
      cooldownMs: Number(COOLDOWN_OPTIONS[cooldownIdx]?.value ?? 0) || undefined,
      expiresAt: expiryMs > 0 ? Date.now() + expiryMs : undefined,
    });
    setThreshold('');
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: 'var(--text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Bell size={icon.md} /> 警报
        </strong>
        <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>
          当前 {currentPrice > 0 ? currentPrice.toFixed(2) : '--'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <ToolbarSelect
          ariaLabel="警报作用对象"
          value={sourceId}
          options={sourceOptions}
          minWidth={86}
          onChange={(v) => {
            setSourceId(v);
            setPlotKey('');
          }}
        />
        {noPlotOutput && (
          <span style={{ alignSelf: 'center', fontSize: 10, color: 'var(--warn)' }} title="该指标没有任何可用的输出线">
            无可用输出
          </span>
        )}
        {def && !noPlotOutput && (
          <ToolbarSelect
            ariaLabel="警报指标线"
            value={effPlotKey}
            options={plotOptions}
            minWidth={72}
            onChange={(v) => setPlotKey(v)}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <ToolbarSelect
          ariaLabel="触发条件"
          value={condition}
          options={CONDITION_OPTIONS}
          minWidth={64}
          onChange={(v) => setCondition(v as AlertCondition)}
        />
        <input
          type="number"
          placeholder={def ? '指标值' : '价格'}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          style={inputStyle}
        />
        <button
          style={{ ...btnStyle, ...(noPlotOutput ? { opacity: 0.5, cursor: 'not-allowed' } : null) }}
          disabled={noPlotOutput}
          title={noPlotOutput ? '该指标无可用输出，无法创建条件' : undefined}
          onClick={submit}
        >
          <Plus size={icon.sm} /> 添加
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <ToolbarSelect
          ariaLabel="触发频率"
          value={frequency}
          options={FREQUENCY_OPTIONS}
          minWidth={64}
          onChange={(v) => setFrequency(v as AlertFrequency)}
        />
        {frequency === 'every' && (
          <ToolbarSelect
            ariaLabel="重复触发冷却"
            value={COOLDOWN_OPTIONS[cooldownIdx]?.value ?? '30000'}
            options={COOLDOWN_OPTIONS}
            minWidth={70}
            onChange={(v) => setCooldownIdx(COOLDOWN_OPTIONS.findIndex((o) => o.value === v))}
          />
        )}
        <ToolbarSelect
          ariaLabel="过期时间"
          value={EXPIRY_OPTIONS[expiryIdx]?.value ?? '0'}
          options={EXPIRY_OPTIONS}
          minWidth={72}
          onChange={(v) => setExpiryIdx(EXPIRY_OPTIONS.findIndex((o) => o.value === v))}
        />
      </div>

      {/* Pine 条件分区（P2-A③）：激活的自定义 Pine 指标注册的 alertcondition 条件 */}
      <PineConditionSection symbol={symbol} frequency={frequency} cooldownIdx={cooldownIdx} expiryIdx={expiryIdx} />

      {/* 画线水平线分区（P2-D②）：当前图表水平线一键建「价格触及」警报 */}
      <HlineAlertSection symbol={symbol} frequency={frequency} cooldownIdx={cooldownIdx} expiryIdx={expiryIdx} />

      {alerts.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>暂无警报</div>}
      {alerts.map((a) => (
        <AlertRow
          key={a.id}
          alert={a}
          onRemove={() => remove(a.id)}
          onTogglePause={() => togglePause(a.id)}
          onEdit={() => setEditingId(a.id)}
        />
      ))}
      {alerts.some((a) => a.triggered) && (
        <button style={{ ...btnStyle, width: '100%', marginTop: 6 }} onClick={clearTriggered}>
          清除已触发
        </button>
      )}
      <AlertEditDialog alert={alerts.find((a) => a.id === editingId) ?? null} onClose={() => setEditingId(null)} />
    </div>
  );
}

/** 画线水平线分区（P2-D②）：列出当前图表水平线及其价格，单选建警报。
 *  清单经画线数据桥（useAlertWatcher 的 currentHlines）实时读取；
 *  默认 crossUp——价格穿越水平线才触发，避免 greater 在「价格已在线上方」时立即触发。
 *  frequency / cooldownIdx / expiryIdx 跟随主表单当前选择（与价格/指标/Pine 警报一致）。 */
function HlineAlertSection({
  symbol,
  frequency,
  cooldownIdx,
  expiryIdx,
}: {
  symbol: string;
  frequency: AlertFrequency;
  cooldownIdx: number;
  expiryIdx: number;
}) {
  const add = useAlertStore((s) => s.add);
  const hlines = useSyncExternalStore(subscribeDrawings, currentHlines);
  if (hlines.length === 0) return null;
  const expiryMs = Number(EXPIRY_OPTIONS[expiryIdx]?.value ?? 0);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: 'var(--text-faint)', fontSize: 10, margin: '2px 0' }}>画线水平线</div>
      {hlines.map((h) => (
        <div key={h.id} style={rowStyle}>
          <span
            style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={`水平线 ${h.price}`}
          >
            水平线 {h.price.toFixed(2)}
          </span>
          <button
            style={miniBtn}
            title="添加为警报"
            aria-label="添加为警报"
            onClick={() =>
              add({
                symbol,
                source: { type: 'line', drawingId: h.id },
                threshold: h.price,
                condition: 'crossUp',
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

function AlertRow({
  alert,
  onRemove,
  onTogglePause,
  onEdit,
}: {
  alert: PriceAlert;
  onRemove: () => void;
  onTogglePause: () => void;
  onEdit: () => void;
}) {
  const color = !alert.active ? 'var(--text-faint)' : alert.triggered ? 'var(--warn)' : 'var(--up)';
  return (
    <div style={rowStyle}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {alert.source.type === 'pine'
          ? `${describeSource(alert.source)} 条件为真`
          : `${describeSource(alert.source)} ${describeCondition(alert.condition, alert.threshold)}`}
        {alert.frequency === 'every' && (
          <span style={{ color: 'var(--text-faint)' }} aria-label="重复触发">
            ·循环
          </span>
        )}
        {alert.expiresAt !== undefined && (
          <span style={{ color: 'var(--text-faint)' }}>·{fmtExpiry(alert.expiresAt)}</span>
        )}
        {!alert.active && <span style={{ color: 'var(--text-faint)' }}>·已暂停</span>}
        {alert.active && alert.triggered && alert.frequency === 'every' && (
          <span style={{ color: 'var(--warn)' }}>·已触发</span>
        )}
      </span>
      <button style={miniBtn} onClick={onEdit} title="编辑警报" aria-label="编辑警报">
        <Pencil size={icon.sm} />
      </button>
      <button
        style={miniBtn}
        onClick={onTogglePause}
        title={alert.active ? '暂停警报' : '恢复警报'}
        aria-label={alert.active ? '暂停警报' : '恢复警报'}
      >
        {alert.active ? <Pause size={icon.sm} /> : <Play size={icon.sm} />}
      </button>
      <button style={miniBtn} onClick={onRemove} title="删除警报" aria-label="删除警报">
        <X size={icon.sm} />
      </button>
    </div>
  );
}

function fmtExpiry(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay ? `${hm} 到期` : `${d.getMonth() + 1}/${d.getDate()} ${hm} 到期`;
}
