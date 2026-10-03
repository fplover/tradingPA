import { useEffect, useState } from 'react';
import { useAlertStore, type PriceAlert } from '@/store/alertStore';
import {
  CONDITION_OPTIONS,
  COOLDOWN_OPTIONS,
  DEFAULT_COOLDOWN_MS,
  EXPIRY_OPTIONS,
  FREQUENCY_OPTIONS,
  describeSource,
  type AlertCondition,
  type AlertFrequency,
} from './alertLogic';
import { Modal } from '@/ui/primitives';
import { ToolbarSelect } from '@/ui/ToolbarSelect';
import { btnStyle, inputStyle } from './ui';

interface AlertEditDialogProps {
  alert: PriceAlert | null;
  onClose: () => void;
}

const fieldStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 };
const labelStyle: React.CSSProperties = { width: 52, fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 };

/** 警报编辑浮层：改阈值/改条件/改频率与冷却/改过期（AC-C2） */
export function AlertEditDialog({ alert, onClose }: AlertEditDialogProps) {
  const update = useAlertStore((s) => s.update);
  const [threshold, setThreshold] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('greater');
  const [frequency, setFrequency] = useState<AlertFrequency>('once');
  const [cooldownIdx, setCooldownIdx] = useState(0);
  const [expiryIdx, setExpiryIdx] = useState(0);

  useEffect(() => {
    if (!alert) return;
    setThreshold(String(alert.threshold));
    setCondition(alert.condition);
    setFrequency(alert.frequency);
    const ci = COOLDOWN_OPTIONS.findIndex((o) => Number(o.value) === alert.cooldownMs);
    setCooldownIdx(ci >= 0 ? ci : 0);
    const remaining = alert.expiresAt !== undefined ? alert.expiresAt - Date.now() : 0;
    // 过期档位取「剩余时长」最近的非零档；已过期/无过期归零
    let ei = 0;
    if (remaining > 0) {
      ei = EXPIRY_OPTIONS.findIndex((o) => {
        const ms = Number(o.value);
        return ms > 0 && Math.abs(ms - remaining) < ms / 2;
      });
      if (ei < 0) ei = EXPIRY_OPTIONS.length - 1;
    }
    setExpiryIdx(ei);
  }, [alert]);

  if (!alert) return null;
  const open = Boolean(alert);
  const isPine = alert.source.type === 'pine';

  const save = () => {
    if (!isPine) {
      const t = Number(threshold);
      if (!Number.isFinite(t) || threshold.trim() === '') return;
    }
    const expiryMs = Number(EXPIRY_OPTIONS[expiryIdx]?.value ?? 0);
    const cooldownMs =
      frequency === 'every'
        ? Number(COOLDOWN_OPTIONS[cooldownIdx]?.value ?? 0) || DEFAULT_COOLDOWN_MS
        : alert.cooldownMs;
    update(alert.id, {
      // Pine 条件源：触发方式固定「条件为真」（阈值 1 + greater），仅可改频率/冷却/过期
      ...(isPine ? {} : { threshold: Number(threshold), condition }),
      frequency,
      cooldownMs,
      expiresAt: expiryMs > 0 ? Date.now() + expiryMs : undefined,
      // 重新编辑保存即重新武装（once 已停用 → 恢复待触发）
      active: true,
      triggered: false,
      lastFiredAt: undefined,
    });
    onClose();
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="编辑警报" width={300}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10 }}>
        {alert.symbol} · {describeSource(alert.source)}
      </div>
      {isPine ? (
        <div style={fieldStyle}>
          <span style={labelStyle}>触发</span>
          <span style={{ fontSize: 11, color: 'var(--text)' }}>Pine 条件为真时触发</span>
        </div>
      ) : (
        <div style={fieldStyle}>
          <span style={labelStyle}>条件</span>
          <ToolbarSelect
            ariaLabel="编辑触发条件"
            value={condition}
            options={CONDITION_OPTIONS}
            minWidth={64}
            onChange={(v) => setCondition(v as AlertCondition)}
          />
          <input
            type="number"
            aria-label="编辑阈值"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            style={inputStyle}
          />
        </div>
      )}
      <div style={fieldStyle}>
        <span style={labelStyle}>频率</span>
        <ToolbarSelect
          ariaLabel="编辑触发频率"
          value={frequency}
          options={FREQUENCY_OPTIONS}
          minWidth={64}
          onChange={(v) => setFrequency(v as AlertFrequency)}
        />
        {frequency === 'every' && (
          <ToolbarSelect
            ariaLabel="编辑重复冷却"
            value={COOLDOWN_OPTIONS[cooldownIdx]?.value ?? String(DEFAULT_COOLDOWN_MS)}
            options={COOLDOWN_OPTIONS}
            minWidth={70}
            onChange={(v) => setCooldownIdx(COOLDOWN_OPTIONS.findIndex((o) => o.value === v))}
          />
        )}
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>过期</span>
        <ToolbarSelect
          ariaLabel="编辑过期时间"
          value={EXPIRY_OPTIONS[expiryIdx]?.value ?? '0'}
          options={EXPIRY_OPTIONS}
          minWidth={90}
          onChange={(v) => setExpiryIdx(EXPIRY_OPTIONS.findIndex((o) => o.value === v))}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
        <button style={btnStyle} onClick={onClose}>
          取消
        </button>
        <button style={{ ...btnStyle, color: 'var(--accent)' }} onClick={save}>
          保存
        </button>
      </div>
    </Modal>
  );
}
