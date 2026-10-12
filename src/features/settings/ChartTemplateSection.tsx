import { relativeTime } from '@/store/indicatorTemplates';
import { useChartTemplateStore } from '@/store/chartTemplateStore';
import { NamedTemplateSection } from '@/ui/NamedTemplateSection';
import { fontSize, space } from '@/ui/tokens';

/** 图表设置「模板」页（三期-B1，TV 图表设置 Templates 形态）：把 chartTemplateStore 的
 *  命名偏好快照接到共用呈现层——与指标对话框的模板分区同构，只是快照单元是偏好切片。
 *  应用走 chartConfigStore（三期-B0 的单一来源），因此同帧内工具栏/状态栏/引擎下发全部跟随。 */
export function ChartTemplateSection() {
  const templates = useChartTemplateStore((s) => s.templates);
  const saveTemplate = useChartTemplateStore((s) => s.saveTemplate);
  const applyTemplate = useChartTemplateStore((s) => s.applyTemplate);
  const renameTemplate = useChartTemplateStore((s) => s.renameTemplate);
  const deleteTemplate = useChartTemplateStore((s) => s.deleteTemplate);

  return (
    <>
      <NamedTemplateSection
        ariaLabel="图表模板"
        rows={[...templates]
          .sort((a, b) => b.savedAt - a.savedAt)
          .map((t) => ({ id: t.id, name: t.name, meta: relativeTime(t.savedAt) }))}
        saveTitle="保存当前图表设置为模板"
        emptyText="保存当前图表设置为模板，随时一键应用"
        onSave={saveTemplate}
        onApply={applyTemplate}
        onRename={renameTemplate}
        onDelete={deleteTemplate}
      />
      <p style={hintStyle}>模板保存图表偏好（周期 / 类型 / 坐标 / 状态栏 / 画布），应用即覆盖当前设置。</p>
    </>
  );
}

const hintStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  lineHeight: 1.7,
  margin: `${space.xs}px ${space.sm}px 0`,
};
