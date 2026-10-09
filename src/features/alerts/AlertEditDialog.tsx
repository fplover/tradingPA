import { useState } from 'react';
import { useAlertStore, type PriceAlert } from '@/store/alertStore';
import {
  CONDITION_OPTIONS,
  COOLDOWN_OPTIONS,
  DEFAULT_COOLDOWN_MS,
  EXPIRY_OPTIONS,
  FREQUENCY_OPTIONS,
  describeSource,
  isChannelCondition,
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
  const [threshold2, setThreshold2] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('greater');
  const [frequency, setFrequency] = useState<AlertFrequency>('once');
  const [cooldownIdx, setCooldownIdx] = useState(0);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [lastAlert, setLastAlert] = useState(alert);

  // 打开/切换警报时把表单重置为该警报的当前值：渲染期按 prev prop 调整状态（同组件
  // 渲染期 setState 合法）。与原 [alert] effect 同触发条件——alert 对象身份变化即重置，
  // alert 为 null（未在编辑）时只跟踪不填充；档位反查下沉到模块函数，推导语义不变
  if (alert !== lastAlert) {
    setLastAlert(alert);
    if (alert) {
      setThreshold(String(alert.threshold));
      setThreshold2(alert.threshold2 !== undefined ? String(alert.threshold2) : '');
      setCondition(alert.condition);
      setFrequency(alert.frequency);
      setCooldownIdx(cooldownIndexFor(alert));
      setExpiryIdx(expiryIndexFor(alert));
    }
  }

  if (!alert) return null;
  const open = Boolean(alert);
  const isPine = alert.source.type === 'pine';
  const channelMode = isChannelCondition(condition);

  const save = () => {
    if (!isPine) {
      const t = Number(threshold);
      if (!Number.isFinite(t) || threshold.trim() === '') return;
    }
    // 通道条件须携带有效上沿；非通道条件清掉 threshold2
    let t2: number | undefined;
    if (!isPine && channelMode) {
      t2 = Number(threshold2);
      if (!Number.isFinite(t2) || threshold2.trim() === '') return;
    }
    const expiryMs = Number(EXPIRY_OPTIONS[expiryIdx]?.value ?? 0);
    const cooldownMs =
      frequency === 'every'
        ? Number(COOLDOWN_OPTIONS[cooldownIdx]?.value ?? 0) || DEFAULT_COOLDOWN_MS
        : alert.cooldownMs;
    update(alert.id, {
      // Pine 条件源：触发方式固定「条件为真」（阈值 1 + greater），仅可改频率/冷却/过期
      ...(isPine
        ? {}
        : { threshold: Number(threshold), condition, threshold2: channelMode ? Number(threshold2) : undefined }),
      frequency,
      cooldownMs,
      expiresAt: expiryMs > 0 ? Date.now() + expiryMs : undefined,
      // 编辑不隐式改变暂停状态（用户裁决 2026-10-03）：active 保留原值，已暂停的警报
      // 不再被静默恢复（重新启用走面板的暂停开关）；触发标志清零（旧阈值下的记录随编辑失效）
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
            aria-label={channelMode ? '编辑区间下沿' : '编辑阈值'}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            style={inputStyle}
          />
          {channelMode && (
            <input
              type="number"
              aria-label="编辑区间上沿"
              value={threshold2}
              onChange={(e) => setThreshold2(e.target.value)}
              style={inputStyle}
            />
          )}
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

/** 冷却档位反查：按 alert.cooldownMs 找下拉下标，未命中归零 */
function cooldownIndexFor(alert: PriceAlert): number {
  const ci = COOLDOWN_OPTIONS.findIndex((o) => Number(o.value) === alert.cooldownMs);
  return ci >= 0 ? ci : 0;
}

/** 过期档位取「剩余时长」最近的非零档；已过期/无过期归零。
 *  Date.now() 收在模块函数内：渲染期直接调用 impure 全局会触发 react(purity)，
 *  而本推导与开屏重置同时机求值一次（alert 身份变化时），语义与原 effect 一致 */
function expiryIndexFor(alert: PriceAlert): number {
  const remaining = alert.expiresAt !== undefined ? alert.expiresAt - Date.now() : 0;
  let ei = 0;
  if (remaining > 0) {
    ei = EXPIRY_OPTIONS.findIndex((o) => {
      const ms = Number(o.value);
      return ms > 0 && Math.abs(ms - remaining) < ms / 2;
    });
    if (ei < 0) ei = EXPIRY_OPTIONS.length - 1;
  }
  return ei;
}
