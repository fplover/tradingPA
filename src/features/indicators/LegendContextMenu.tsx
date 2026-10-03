import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Settings } from 'lucide-react';
import type { LegendOptions } from '@/engine/renderer/drawCrosshair';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

export interface LegendMenuState {
  x: number;
  y: number;
}

interface LegendContextMenuProps {
  state: LegendMenuState | null;
  legend: LegendOptions;
  onLegend: (patch: Partial<LegendOptions>) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const TOGGLES: Array<{ key: keyof LegendOptions; label: string }> = [
  { key: 'showSeriesTitle', label: '商品' },
  { key: 'showOHLC', label: 'OHLC值' },
  { key: 'showChange', label: 'K线变化' },
  { key: 'showVolume', label: '成交量' },
  { key: 'showStudyNames', label: '指标名称' },
  { key: 'showStudyArgs', label: '指标参数' },
  { key: 'showStudyValues', label: '指标值' },
];

/** 图例右键菜单（TV legend_context_menu）：开关图例各部分 + 设置 */
export function LegendContextMenu({ state, legend, onLegend, onOpenSettings, onClose }: LegendContextMenuProps) {
  return (
    <DropdownMenu.Root
      open={state !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: state?.x ?? 0,
            top: state?.y ?? 0,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={2} className="tv-scroll" style={menuStyle}>
          {TOGGLES.map((t) => (
            <DropdownMenu.CheckboxItem
              key={t.key}
              className="tv-menu-item"
              style={itemStyle}
              checked={legend[t.key] as boolean}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(v) => onLegend({ [t.key]: v } as Partial<LegendOptions>)}
            >
              <span style={checkSlot}>{legend[t.key] ? <Check size={14} /> : null}</span>
              {t.label}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Separator style={sepStyle} />
          <DropdownMenu.Item
            className="tv-menu-item"
            style={itemStyle}
            onSelect={() => {
              onOpenSettings();
              onClose();
            }}
          >
            <span style={checkSlot}>
              <Settings size={14} />
            </span>
            设置
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const menuStyle: React.CSSProperties = {
  minWidth: 160,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.md,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: `6px ${space.sm + 2}px`,
  border: 'none',
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  outline: 'none',
  whiteSpace: 'nowrap',
};

const checkSlot: React.CSSProperties = { width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' };

const sepStyle: React.CSSProperties = { height: 1, background: 'var(--border)', margin: `${space.xs}px 0` };
