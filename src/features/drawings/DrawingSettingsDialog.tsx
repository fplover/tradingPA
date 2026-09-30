import { useReducer } from 'react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { useDrawingStore } from '@/store/drawingStore';
import { Modal } from '@/ui/primitives';
import { Checkbox } from '@/ui/controls';
import { ToolbarSelect, type ToolbarOption } from '@/ui/ToolbarSelect';
import { fontSize, radius, space } from '@/ui/tokens';
import { defaultLevelsFor, type DrawingTypeId } from '@/engine/drawing/types';
import { DrawingLevelsEditor } from './DrawingLevelsEditor';

const LINE_WIDTH_OPTIONS: ToolbarOption[] = [1, 2, 3, 4].map((w) => ({ value: String(w), label: `${w}px` }));

/** 支持自定义分割档位的工具（TV fib 设置 levels 页）：回撤 / 扩展 / 百分比线 */
const LEVELS_TOOLS: ReadonlySet<DrawingTypeId> = new Set<DrawingTypeId>(['fib', 'fib-extension', 'percent-line']);

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

  // 分割档位（fib / 扩展 / 百分比线）：自定义 levels 优先，undefined 时展示工具默认档
  const supportsLevels = LEVELS_TOOLS.has(drawing.type);
  const effectiveLevels = drawing.levels ?? defaultLevelsFor(drawing.type) ?? [];

  return (
    <Modal open onOpenChange={(o) => !o && setSettingsFor(null)} title="画线设置" width={supportsLevels ? 320 : 300}>
      {supportsLevels && (
        <DrawingLevelsEditor
          levels={effectiveLevels}
          onChange={(next) => {
            renderer.updateDrawingLevels(id, next);
            force();
          }}
        />
      )}
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
        <ToolbarSelect
          ariaLabel="线宽"
          value={String(drawing.style.lineWidth)}
          options={LINE_WIDTH_OPTIONS}
          minWidth={72}
          onChange={(v) => setStyle({ lineWidth: Number(v) })}
        />
      </Row>
      <Row label="虚线">
        <Checkbox checked={drawing.style.dash === true} ariaLabel="虚线" onChange={(v) => setStyle({ dash: v })} />
      </Row>
      <Row label="显示">
        <Checkbox
          checked={drawing.visible}
          ariaLabel="显示"
          onChange={(v) => {
            renderer.setDrawingVisible(id, v);
            force();
          }}
        />
      </Row>
      <Row label="锁定">
        <Checkbox
          checked={drawing.locked}
          ariaLabel="锁定"
          onChange={(v) => {
            renderer.setDrawingLocked(id, v);
            force();
          }}
        />
      </Row>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, marginBottom: space.xs }}>
      <span style={{ color: 'var(--text)', fontSize: fontSize.lg }}>{label}</span>
      {children}
    </div>
  );
}

const swatchStyle: React.CSSProperties = { width: 22, height: 22, padding: 0, border: '1px solid var(--border)', borderRadius: radius.xs, background: 'none', cursor: 'pointer' };
