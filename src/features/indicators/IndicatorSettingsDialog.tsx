import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { getIndicatorDef } from '@/indicators/registry';
import type { ParamValue } from '@/indicators/core/types';
import type { PlotStyleOverride } from '@/store/indicatorStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { TIMEFRAMES, type TimeframeId } from '@/types/market';
import { isCustomIntervalId } from '@/features/market/customInterval';
import { CheckRow, Checkbox, NumberStepper } from '@/ui/controls';
import { ToolbarSelect, type ToolbarOption } from '@/ui/ToolbarSelect';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';
import type { PlotKind } from '@/indicators/core/types';

/** TV 页签顺序：输入 → 样式 → 可见范围（精度折进样式页的「覆盖最小tick」） */
const TABS = ['输入', '样式', '可见范围'] as const;
type Tab = (typeof TABS)[number];

const PRECISIONS: Array<{ label: string; value: number | undefined }> = [
  { label: '默认', value: undefined },
  { label: '1 (0.0)', value: 1 },
  { label: '1/100 (0.00)', value: 2 },
  { label: '1/1000 (0.000)', value: 3 },
  { label: '1/10000 (0.0000)', value: 4 },
];

const LINE_WIDTH_OPTIONS: ToolbarOption[] = [1, 2, 3, 4].map((w) => ({ value: String(w), label: `${w}px` }));

/** plot 类型下拉（TV 样式页）：band 需成对 plot，仅多 plot 指标可选 */
const PLOT_KIND_LABELS: Record<PlotKind, string> = {
  line: '线形',
  histogram: '柱状',
  band: '带状',
  level: '水平线',
};

const PLOT_KIND_OPTIONS: ToolbarOption[] = (['line', 'histogram', 'band', 'level'] as PlotKind[]).map((k) => ({
  value: k,
  label: PLOT_KIND_LABELS[k],
}));

function tfGroup(id: TimeframeId): string {
  if (isCustomIntervalId(id)) return '自定义';
  if (id.endsWith('s')) return '秒';
  if (id.endsWith('m')) return '分钟';
  if (id.endsWith('H')) return '小时';
  if (id === '1W' || id === '1M') return '周/月';
  return '日';
}

/** 指标设置：TV 左导航四页签，全部实时生效，无确定按钮 */
export function IndicatorSettingsDialog({ id }: { id: string }) {
  const def = getIndicatorDef(id);
  const active = useIndicatorStore((s) => s.active.find((a) => a.id === id));
  const updateParams = useIndicatorStore((s) => s.updateParams);
  const updateInstance = useIndicatorStore((s) => s.updateInstance);
  const setSettingsFor = useIndicatorStore((s) => s.setSettingsFor);
  const [tab, setTab] = useState<Tab>('输入');

  if (!def || !active) return null;

  const setParam = (key: string, value: ParamValue) => updateParams(id, { [key]: value });
  const setStyle = (plotKey: string, patch: PlotStyleOverride) =>
    updateInstance(id, { styles: { ...active.styles, [plotKey]: { ...active.styles?.[plotKey], ...patch } } });

  // 可见周期活校验（B5）：自定义档位运行时才注册进 TIMEFRAMES，不能用
  // 「next.length === TIMEFRAMES.length」数量偶合判断全选；覆盖全部内置档位的
  // 显式旧存档 ≡ 无限制（自定义档位天然不在旧列表里，应正常显示指标）。
  const allTfIds = TIMEFRAMES.map((t) => t.id);
  const builtinIds = TIMEFRAMES.filter((t) => !isCustomIntervalId(t.id)).map((t) => t.id);
  const listCoversBuiltins = (list: string[]): boolean => builtinIds.every((id) => list.includes(id));
  const savedTfs = active.visibleTimeframes;
  const checkedTfs = !savedTfs || listCoversBuiltins(savedTfs) ? allTfIds : savedTfs;
  const allChecked = allTfIds.every((id) => checkedTfs.includes(id));
  const setTf = (tfId: TimeframeId, on: boolean) => {
    const next = on ? [...checkedTfs, tfId] : checkedTfs.filter((t) => t !== tfId);
    updateInstance(id, { visibleTimeframes: allTfIds.every((tf) => next.includes(tf)) ? undefined : next });
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) setSettingsFor(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} className="tv-dialog" aria-describedby={undefined}>
          <div style={headerStyle}>
            <Dialog.Title style={titleStyle}>{active.displayName || def.name} 设置</Dialog.Title>
            <Dialog.Close asChild>
              <button style={closeStyle} aria-label="关闭">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* 左导航：TV 为 180px 全宽填充行，无强调条 */}
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
              {tab === '样式' && (
                <>
                  <Row label="名称">
                    <input
                      value={active.displayName ?? def.name}
                      onChange={(e) => updateInstance(id, { displayName: e.target.value })}
                      style={inputStyle}
                      aria-label="指标显示名称"
                    />
                  </Row>
                  {def.plots.map((plot) => {
                    const st = active.styles?.[plot.key];
                    const kind = st?.kind ?? plot.style.kind;
                    // band 需与另一 plot 成对；单 plot 指标不提供该选项
                    const kindOptions =
                      def.plots.length > 1
                        ? PLOT_KIND_OPTIONS
                        : PLOT_KIND_OPTIONS.filter((o) => o.value !== 'band');
                    return (
                      <Row key={plot.key} label={plot.label}>
                        <ToolbarSelect
                          ariaLabel={`${plot.label} 类型`}
                          value={kind}
                          options={kindOptions}
                          minWidth={88}
                          onChange={(v) => setStyle(plot.key, { kind: v as PlotKind })}
                        />
                        <input
                          type="color"
                          value={st?.color ?? plot.style.color}
                          onChange={(e) => setStyle(plot.key, { color: e.target.value })}
                          style={swatchStyle}
                          aria-label={`${plot.label} 颜色`}
                        />
                        {(kind === 'line' || kind === 'band') && (
                          <ToolbarSelect
                            ariaLabel={`${plot.label} 线宽`}
                            value={String(st?.lineWidth ?? plot.style.lineWidth ?? 1)}
                            options={LINE_WIDTH_OPTIONS}
                            minWidth={72}
                            onChange={(v) => setStyle(plot.key, { lineWidth: Number(v) })}
                          />
                        )}
                        <Checkbox
                          checked={st?.hidden !== true}
                          ariaLabel={`${plot.label} 显示`}
                          onChange={(e) => setStyle(plot.key, { hidden: !e })}
                        />
                        显示
                      </Row>
                    );
                  })}
                  <Row label="覆盖最小tick">
                    <ToolbarSelect
                      ariaLabel="覆盖最小tick"
                      value={String(active.precision ?? '')}
                      options={PRECISIONS.map((p) => ({ value: String(p.value ?? ''), label: p.label }))}
                      minWidth={132}
                      onChange={(v) => updateInstance(id, { precision: v === '' ? undefined : Number(v) })}
                    />
                  </Row>
                </>
              )}

              {tab === '输入' && (
                <>
                  {def.params.length === 0 && <div style={emptyStyle}>该指标无可调参数</div>}
                  {def.params
                    .filter((p) => {
                      // 关联 plot 全部隐藏时隐藏该输入（TV hideWhenPlotsHidden）
                      if (!p.hideWhenPlotsHidden || p.hideWhenPlotsHidden.length === 0) return true;
                      return !p.hideWhenPlotsHidden.every((k) => active.styles?.[k]?.hidden === true);
                    })
                    .map((p) => (
                    <Row key={p.key} label={p.label}>
                      {p.type === 'number' && (
                        <NumberStepper
                          value={Number(active.params[p.key] ?? p.default)}
                          min={p.min}
                          max={p.max}
                          step={p.step ?? 1}
                          ariaLabel={p.label}
                          onChange={(v) => setParam(p.key, v)}
                        />
                      )}
                      {p.type === 'color' && (
                        <input
                          type="color"
                          value={String(active.params[p.key] ?? p.default)}
                          onChange={(e) => setParam(p.key, e.target.value)}
                          style={swatchStyle}
                        />
                      )}
                      {p.type === 'boolean' && (
                        <Checkbox checked={Boolean(active.params[p.key] ?? p.default)} ariaLabel={p.label} onChange={(v) => setParam(p.key, v)} />
                      )}
                      {p.type === 'select' && (
                        <ToolbarSelect
                          ariaLabel={p.label}
                          value={String(active.params[p.key] ?? p.default)}
                          options={(p.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))}
                          minWidth={120}
                          onChange={(v) => setParam(p.key, v)}
                        />
                      )}
                    </Row>
                  ))}
                </>
              )}

              {tab === '可见范围' && (
                <>
                  <Row label="全部周期">
                    <Checkbox
                      checked={allChecked}
                      ariaLabel="全部周期"
                      onChange={(e) => updateInstance(id, { visibleTimeframes: e ? undefined : [] })}
                    />
                  </Row>
                  {['秒', '分钟', '小时', '日', '周/月', '自定义'].map((group) => {
                    const items = TIMEFRAMES.filter((t) => tfGroup(t.id) === group);
                    if (items.length === 0) return null;
                    const allOn = items.every((t) => checkedTfs.includes(t.id));
                    return (
                      <div key={group} style={{ marginBottom: space.md }}>
                        <div style={groupLabelStyle}>
                          <CheckRow
                            label={group}
                            checked={allOn}
                            onChange={(e) => {
                              const next = e
                                ? [...new Set([...checkedTfs, ...items.map((t) => t.id)])]
                                : checkedTfs.filter((t) => !items.some((i) => i.id === t));
                              updateInstance(id, { visibleTimeframes: allTfIds.every((tf) => next.includes(tf)) ? undefined : next });
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, paddingLeft: 22 }}>
                          {items.map((t) => (
                            <label key={t.id} style={checkLabelStyle}>
                              <Checkbox checked={checkedTfs.includes(t.id)} ariaLabel={t.label} onChange={(e) => setTf(t.id, e)} />
                              {t.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          <div style={footerStyle}>
            <button
              style={ghostBtnStyle}
              onClick={() => {
                const defaults: Record<string, ParamValue> = {};
                for (const p of def.params) defaults[p.key] = p.default;
                updateParams(id, defaults);
                updateInstance(id, { styles: {}, precision: undefined, displayName: undefined, visibleTimeframes: undefined });
              }}
            >
              应用默认值
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={{ color: 'var(--text)', fontSize: fontSize.lg }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>{children}</span>
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: zIndex.modal };

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 600,
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.lg,
  boxShadow: shadow.modal,
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

const paneStyle: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: `${space.xl}px ${space.xl}px` };

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 32,
  marginBottom: space.sm,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: fontSize.md,
};

const swatchStyle: React.CSSProperties = { width: 22, height: 22, padding: 0, border: '1px solid var(--border)', borderRadius: 3, background: 'none', cursor: 'pointer' };

const checkLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)', fontSize: fontSize.md, cursor: 'pointer' };

const groupLabelStyle: React.CSSProperties = { marginBottom: space.xs };

const emptyStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: fontSize.md };

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  height: 44,
  padding: `0 ${space.lg}px`,
  borderTop: '1px solid var(--border)',
  alignItems: 'center',
  flexShrink: 0,
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  padding: `${space.xs}px ${space.sm}px`,
  borderRadius: 4,
};
