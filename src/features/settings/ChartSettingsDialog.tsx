import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DialogHeader } from '@/ui/primitives';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { GridMode } from '@/engine/renderer/drawAxes';
import type { LegendOptions } from '@/engine/renderer/drawCrosshair';
import { CheckRow, Segmented } from '@/ui/controls';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

const TABS = ['坐标轴', 'Scales', '状态栏', 'Canvas', '外观'] as const;
type Tab = (typeof TABS)[number];

/** 网格四态（TV 画布页）：无 / 横 / 竖 / 全 */
const GRID_OPTIONS: Array<{ value: GridMode; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'horizontal', label: '横' },
  { value: 'vertical', label: '竖' },
  { value: 'both', label: '全' },
];

interface ChartSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  logScale: boolean;
  percent: boolean;
  autoScale: boolean;
  legend: LegendOptions;
  /** 主图渲染器：网格四态/边框/水印实时下发 */
  renderer: ChartRenderer | null;
  onLog: (v: boolean) => void;
  onPercent: (v: boolean) => void;
  onAuto: (v: boolean) => void;
  onLegend: (patch: Partial<LegendOptions>) => void;
}

/** 图表设置：TV 左导航 + 实时生效（无确定按钮）。
 *  画布类偏好（网格/边框/水印）由对话框自持状态并即时下发 renderer。 */
export function ChartSettingsDialog(p: ChartSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('坐标轴');
  const [gridMode, setGridMode] = useState<GridMode>('both');
  const [borders, setBorders] = useState(true);
  /** 预留：引擎水印渲染未实现，开关态先落 renderer（setWatermarkVisible） */
  const [watermark, setWatermark] = useState(false);

  // renderer 就绪/偏好变更即下发（renderer 异步创建，就绪时补一次当前值）
  useEffect(() => {
    p.renderer?.setGridMode(gridMode);
    p.renderer?.setBordersVisible(borders);
    p.renderer?.setWatermarkVisible(watermark);
  }, [p.renderer, gridMode, borders, watermark]);

  return (
    <Dialog.Root
      open={p.open}
      onOpenChange={(o) => {
        if (!o) p.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} className="tv-dialog" aria-describedby={undefined}>
          <DialogHeader title="图表设置" />

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <nav style={navStyle}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    ...navItemStyle,
                    background: t === tab ? 'var(--panel-2)' : 'transparent',
                    color: t === tab ? 'var(--text)' : 'var(--text-dim)',
                  }}
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

              {tab === 'Scales' && (
                <>
                  <SettingRow label="价格坐标位置">
                    <Segmented
                      ariaLabel="价格坐标位置"
                      value="right"
                      options={[
                        { value: 'right', label: '右' },
                        { value: 'left', label: '左', disabled: true, title: '引擎侧支持中，敬请期待' },
                        { value: 'none', label: '无', disabled: true, title: '引擎侧支持中，敬请期待' },
                      ]}
                      onChange={() => undefined}
                    />
                  </SettingRow>
                  <p style={hintStyle}>坐标位置切换需引擎支持（画布偏移），当前版本仅右侧；左/无为预留态。</p>
                </>
              )}

              {tab === '状态栏' && (
                <>
                  <CheckRow
                    label="商品行"
                    checked={p.legend.showSeriesTitle}
                    onChange={(v) => p.onLegend({ showSeriesTitle: v })}
                  />
                  <CheckRow label="OHLC 值" checked={p.legend.showOHLC} onChange={(v) => p.onLegend({ showOHLC: v })} />
                  <CheckRow
                    label="涨跌与涨跌幅"
                    checked={p.legend.showChange}
                    onChange={(v) => p.onLegend({ showChange: v })}
                  />
                  <CheckRow
                    label="成交量"
                    checked={p.legend.showVolume}
                    onChange={(v) => p.onLegend({ showVolume: v })}
                  />
                  <CheckRow
                    label="指标名称"
                    checked={p.legend.showStudyNames}
                    onChange={(v) => p.onLegend({ showStudyNames: v })}
                  />
                  <CheckRow
                    label="指标参数"
                    checked={p.legend.showStudyArgs}
                    onChange={(v) => p.onLegend({ showStudyArgs: v })}
                  />
                  <CheckRow
                    label="指标数值"
                    checked={p.legend.showStudyValues}
                    onChange={(v) => p.onLegend({ showStudyValues: v })}
                  />
                </>
              )}

              {tab === 'Canvas' && (
                <>
                  <CheckRow label="画布边框" checked={borders} onChange={setBorders} />
                  <CheckRow label="水印" checked={watermark} onChange={setWatermark} />
                  <p style={hintStyle}>水印（商品代码 + 周期）渲染待引擎支持，当前仅记录开关状态。</p>
                </>
              )}

              {tab === '外观' && (
                <SettingRow label="网格线">
                  <Segmented ariaLabel="网格线" value={gridMode} options={GRID_OPTIONS} onChange={setGridMode} />
                </SettingRow>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 32 }}
    >
      <span style={{ color: 'var(--text)', fontSize: fontSize.lg }}>{label}</span>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay)',
  zIndex: zIndex.modal,
};

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
  borderRadius: radius.lg,
  boxShadow: shadow.modal,
  zIndex: zIndex.modal,
  outline: 'none',
};

const navStyle: React.CSSProperties = {
  width: 180,
  flexShrink: 0,
  borderRight: '1px solid var(--border)',
  padding: `${space.sm}px 0`,
};

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

const paneStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: `${space.xl}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: space.xs,
};

const hintStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  lineHeight: 1.7,
  margin: `${space.xs}px 0 0`,
};
