import { getIndicatorDef } from '@/indicators/registry';
import { useIndicatorStore } from '@/store/indicatorStore';

/** 激活指标 chips：设置/移除入口 */
export function ActiveIndicatorChips() {
  const active = useIndicatorStore((s) => s.active);
  const remove = useIndicatorStore((s) => s.remove);
  const setSettingsFor = useIndicatorStore((s) => s.setSettingsFor);
  if (active.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {active.map((a) => {
        const def = getIndicatorDef(a.id);
        return (
          <span
            key={a.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#2a2e39',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 11,
              color: '#d1d4dc',
            }}
          >
            {def?.name ?? a.id}
            <button onClick={() => setSettingsFor(a.id)} style={iconBtn} title="设置">
              ⚙
            </button>
            <button onClick={() => remove(a.id)} style={iconBtn} title="移除">
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#787b86',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
  lineHeight: 1,
};
