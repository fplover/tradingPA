import { getIndicatorDef } from '@/indicators/registry';
import type { ParamValue } from '@/indicators/core/types';
import { useIndicatorStore } from '@/store/indicatorStore';
import { Modal } from '@/ui/primitives';

/** 指标参数设置对话框：数值/颜色/布尔/下拉 */
export function IndicatorSettingsDialog({ id }: { id: string }) {
  const def = getIndicatorDef(id);
  const active = useIndicatorStore((s) => s.active.find((a) => a.id === id));
  const updateParams = useIndicatorStore((s) => s.updateParams);
  const setSettingsFor = useIndicatorStore((s) => s.setSettingsFor);
  if (!def || !active) return null;

  const set = (key: string, value: ParamValue) => updateParams(id, { [key]: value });

  return (
    <Modal open onOpenChange={(o) => !o && setSettingsFor(null)} title={`${def.name} 设置`} width={320}>
      {def.params.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>该指标无可调参数</div>}
        {def.params.map((p) => (
          <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: 'var(--text)' }}>
            <span style={{ width: 80 }}>{p.label}</span>
            {p.type === 'number' && (
              <input
                type="number"
                value={Number(active.params[p.key] ?? p.default)}
                min={p.min}
                max={p.max}
                step={p.step ?? 1}
                onChange={(e) => set(p.key, Number(e.target.value))}
                style={inputStyle}
              />
            )}
            {p.type === 'color' && (
              <input type="color" value={String(active.params[p.key] ?? p.default)} onChange={(e) => set(p.key, e.target.value)} style={{ width: 40, height: 24, border: 'none', background: 'none' }} />
            )}
            {p.type === 'boolean' && (
              <input type="checkbox" checked={Boolean(active.params[p.key] ?? p.default)} onChange={(e) => set(p.key, e.target.checked)} />
            )}
            {p.type === 'select' && (
              <select value={String(active.params[p.key] ?? p.default)} onChange={(e) => set(p.key, e.target.value)} style={inputStyle}>
                {p.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => {
              const defaults: Record<string, ParamValue> = {};
              for (const p of def.params) defaults[p.key] = p.default;
              updateParams(id, defaults);
            }}
            style={btnStyle}
          >
            恢复默认
          </button>
          <button onClick={() => setSettingsFor(null)} style={{ ...btnStyle, background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
            完成
          </button>
        </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  padding: '5px 12px',
  fontSize: 12,
  cursor: 'pointer',
};

