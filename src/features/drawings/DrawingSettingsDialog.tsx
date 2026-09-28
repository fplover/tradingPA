import { useReducer } from 'react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { useDrawingStore } from '@/store/drawingStore';
import { Modal } from '@/ui/primitives';
import { fontSize, space } from '@/ui/tokens';

/** 画线设置（TV 双击画线打开）：样式实时生效，无确定按钮 */
export function DrawingSettingsDialog({ renderer }: { renderer: ChartRenderer | null }) {
  const id = useDrawingStore((s) => s.settingsFor);
  const setSettingsFor = useDrawingStore((s) => s.setSettingsFor);
  const [, force] = useReducer((x: number) => x + 1, 0);

  const drawing = renderer?.listDrawings().find((d) => d.id === id) ?? null;
  if (!id || !drawing || !renderer) return null;

  const setStyle = (patch: Parameters<ChartRenderer['updateDrawingStyle']>[1]) => {
    renderer.updateDrawingStyle(id, patch);
    force();
  };

  return (
    <Modal open onOpenChange={(o) => !o && setSettingsFor(null)} title="画线设置" width={300}>
      <Row label="颜色">
        <input
          type="color"
          value={drawing.style.color}
          onChange={(e) => setStyle({ color: e.target.value })}
          style={swatchStyle}
          aria-label="画线颜色"
        />
      </Row>
      <Row label="线宽">
        <select value={String(drawing.style.lineWidth)} onChange={(e) => setStyle({ lineWidth: Number(e.target.value) })} style={inputStyle} aria-label="线宽">
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </select>
      </Row>
      <Row label="虚线">
        <input type="checkbox" checked={drawing.style.dash === true} onChange={(e) => setStyle({ dash: e.target.checked })} />
      </Row>
      <Row label="显示">
        <input
          type="checkbox"
          checked={drawing.visible}
          onChange={(e) => {
            renderer.setDrawingVisible(id, e.target.checked);
            force();
          }}
        />
      </Row>
      <Row label="锁定">
        <input
          type="checkbox"
          checked={drawing.locked}
          onChange={(e) => {
            renderer.setDrawingLocked(id, e.target.checked);
            force();
          }}
        />
      </Row>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, marginBottom: space.xs, cursor: 'pointer' }}>
      <span style={{ color: 'var(--text)', fontSize: fontSize.lg }}>{label}</span>
      {children}
    </label>
  );
}

const swatchStyle: React.CSSProperties = { width: 22, height: 22, padding: 0, border: '1px solid var(--border)', borderRadius: 3, background: 'none', cursor: 'pointer' };

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: fontSize.md,
};
