import { useIndicatorStore } from '@/store/indicatorStore';
import { relativeTime, sortTemplates } from '@/store/indicatorTemplates';
import { NamedTemplateSection } from '@/ui/NamedTemplateSection';

/** 指标面板内嵌「模板」分区：把 indicatorStore 的多命名模板接到共用呈现层。
 *  键盘导航只作用于指标搜索列表，本区不挂 ↑↓/Enter 劫持（呈现层已按此口径实现）。
 *  呈现与样式见 @/ui/NamedTemplateSection（三期-B1 起与图表设置「模板」页共用）。 */
export function TemplateSection() {
  const templates = useIndicatorStore((s) => s.templates);
  const saveTemplate = useIndicatorStore((s) => s.saveTemplate);
  const loadTemplate = useIndicatorStore((s) => s.loadTemplate);
  const renameTemplate = useIndicatorStore((s) => s.renameTemplate);
  const deleteTemplate = useIndicatorStore((s) => s.deleteTemplate);

  return (
    <NamedTemplateSection
      ariaLabel="指标模板"
      rows={sortTemplates(templates).map((t) => ({ id: t.id, name: t.name, meta: relativeTime(t.savedAt) }))}
      saveTitle="保存当前指标组合为模板"
      emptyText="保存当前指标组合为模板，随时一键应用"
      listMaxHeight={132}
      topDivider
      onSave={saveTemplate}
      onApply={loadTemplate}
      onRename={renameTemplate}
      onDelete={deleteTemplate}
    />
  );
}
