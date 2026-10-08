import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DialogHeader } from '@/ui/primitives';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { GridMode } from '@/engine/renderer/drawAxes';
import type { PriceAxisPos } from '@/engine/renderer/chartPanes';
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

/** 价格坐标位置（TV Scales 页）：轴在右 / 左 / 无 */
const PRICE_AXIS_OPTIONS: Array<{ value: PriceAxisPos; label: string }> = [
  { value: 'right', label: '右' },
  { value: 'left', label: '左' },
  { value: 'none', label: '无' },
];

/** 时间坐标制式（TV 坐标轴页）：24 小时 / 12 小时（AM/PM） */
const TIME_FORMAT_OPTIONS: Array<{ value: '24' | '12'; label: string }> = [
  { value: '24', label: '24 小时' },
  { value: '12', label: '12 小时（AM/PM）' },
];

interface ChartSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  logScale: boolean;
  percent: boolean;
  autoScale: boolean;
  legend: LegendOptions;
  /** 主图渲染器：网格四态/边框/水印/价格轴位置/时间制式实时下发 */
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
  /** 水印开关（TV 画布页）：实时下发 renderer，引擎渲染到画布 */
  const [watermark, setWatermark] = useState(false);
  /** 价格坐标位置（TV Scales 页）：右 / 左 / 无，引擎实时换算图表区几何 */
  const [priceAxisPos, setPriceAxisPos] = useState<PriceAxisPos>('right');
  /** 时间坐标制式：false = 24 小时，true = 12 小时（AM/PM） */
  const [timeHour12, setTimeHour12] = useState(false);

  // renderer 就绪/偏好变更即下发（renderer 异步创建，就绪时补一次当前值）
  useEffect(() => {
    p.renderer?.setGridMode(gridMode);
    p.renderer?.setBordersVisible(borders);
    p.renderer?.setWatermarkVisible(watermark);
    p.renderer?.setPriceAxisPos(priceAxisPos);
    p.renderer?.setTimeHour12(timeHour12);
  }, [p.renderer, gridMode, borders, watermark, priceAxisPos, timeHour12]);

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
                      value={priceAxisPos}
                      options={PRICE_AXIS_OPTIONS}
                      onChange={setPriceAxisPos}
                    />
                  </SettingRow>
                  <SettingRow label="时间坐标">
                    <Segmented
                      ariaLabel="时间坐标"
                      value={timeHour12 ? '12' : '24'}
                      options={TIME_FORMAT_OPTIONS}
                      onChange={(v) => setTimeHour12(v === '12')}
                    />
                  </SettingRow>
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
                  <p style={hintStyle}>水印（商品代码 + 周期）实时渲染到画布。</p>
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
