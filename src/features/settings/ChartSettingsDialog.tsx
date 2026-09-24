import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { LegendOptions } from '@/engine/renderer/drawCrosshair';
import { fontSize, shadow, space, zIndex } from '@/ui/tokens';

const TABS = ['坐标轴', '状态栏', '外观'] as const;
type Tab = (typeof TABS)[number];

interface ChartSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  logScale: boolean;
  percent: boolean;
  autoScale: boolean;
  grid: boolean;
  legend: LegendOptions;
  onLog: (v: boolean) => void;
  onPercent: (v: boolean) => void;
  onAuto: (v: boolean) => void;
  onGrid: (v: boolean) => void;
  onLegend: (patch: Partial<LegendOptions>) => void;
}

/** 图表设置：TV 左导航 + 实时生效（无确定按钮） */
export function ChartSettingsDialog(p: ChartSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('坐标轴');

  return (
    <Dialog.Root
      open={p.open}
      onOpenChange={(o) => {
        if (!o) p.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} aria-describedby={undefined}>
          <div style={headerStyle}>
            <Dialog.Title style={titleStyle}>图表设置</Dialog.Title>
            <Dialog.Close asChild>
              <button style={closeStyle} aria-label="关闭">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <nav style={navStyle}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{ ...navItemStyle, background: t === tab ? 'var(--panel-2)' : 'transparent', color: t === tab ? 'var(--text)' : 'var(--text-dim)' }}
                >
                  {t}
                </button>
              ))}
            </nav>

            <div className="tv-scroll" style={paneStyle}>
              {tab === '坐标轴' && (
                <>
                  <CheckRow label="对数坐标" checked={p.logScale} onChange={p.onLog} />
                  <CheckRow label="百分比坐标" checked={p.percent} onChange={p.onPercent} />
                  <CheckRow label="自动坐标（适应数据）" checked={p.autoScale} onChange={p.onAuto} />
                </>
              )}
              {tab === '状态栏' && (
                <>
                  <CheckRow label="OHLC 值" checked={p.legend.showOHLC} onChange={(v) => p.onLegend({ showOHLC: v })} />
                  <CheckRow label="涨跌与涨跌幅" checked={p.legend.showChange} onChange={(v) => p.onLegend({ showChange: v })} />
                  <CheckRow label="成交量" checked={p.legend.showVolume} onChange={(v) => p.onLegend({ showVolume: v })} />
                  <CheckRow label="指标图例" checked={p.legend.showStudies} onChange={(v) => p.onLegend({ showStudies: v })} />
                </>
              )}
              {tab === '外观' && <CheckRow label="网格线" checked={p.grid} onChange={p.onGrid} />}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={rowStyle}>
      <span style={{ color: 'var(--text)', fontSize: fontSize.lg }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: zIndex.modal };

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 520,
  maxHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  boxShadow: shadow.menu,
  zIndex: zIndex.modal,
  outline: 'none',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 44,
  padding: `0 ${space.lg}px`,
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = { color: 'var(--text)', fontSize: 16, fontWeight: 600 };

const closeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  color: 'var(--text-faint)',
  cursor: 'pointer',
};

const navStyle: React.CSSProperties = { width: 180, flexShrink: 0, borderRight: '1px solid var(--border)', padding: `${space.sm}px 0` };

const navItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 34,
  padding: `0 ${space.lg}px`,
  border: 'none',
  textAlign: 'left',
  fontSize: fontSize.lg,
  cursor: 'pointer',
};

const paneStyle: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: `${space.xl}px` };

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 32,
  marginBottom: space.xs,
  cursor: 'pointer',
};
