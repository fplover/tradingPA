import { Copy, Settings, Trash2 } from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { SelectionPopupInfo } from '@/engine/renderer/selectionPopup';
import { useDrawingStore } from '@/store/drawingStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { icon, radius, shadow, zIndex } from '@/ui/tokens';

/**
 * 选中画线/指标时的 TV 式浮动工具栏（需求③）：绝对定位于画布容器内，
 * 锚点（canvas CSS 像素）正上方居中。删除后引擎发 null 回调，工具栏随父级卸载消失；
 * 设置对话框打开时工具栏保持（TV 行为——对话框为模态浮层，不抢占选中态）。
 * 交互全部复用既有入口：画线设置走 drawingStore.settingsFor（DrawingSettingsDialog 自动开）、
 * 指标设置走 indicatorStore.settingsFor（IndicatorSettingsDialog 同源）、删除复用图例同款 store action。
 */
export function SelectionToolbar({ info, renderer }: { info: SelectionPopupInfo; renderer: ChartRenderer | null }) {
  // 指标 id 兼容解析：契约 id 以 store id 为准，引擎若传实例 uid 则回表换算，两条路径都落到 store id
  const indicatorId = (): string => {
    const hit = (renderer?.listIndicators() ?? []).find((l) => l.uid === info.id);
    return hit ? hit.id : info.id;
  };
  const openDrawingSettings = () => useDrawingStore.getState().setSettingsFor(info.id);
  const openIndicatorSettings = () => useIndicatorStore.getState().setSettingsFor(indicatorId());
  const cloneDrawing = () => renderer?.duplicateDrawing(info.id);
  const removeSelected = () => {
    if (info.kind === 'drawing') renderer?.removeSelectedDrawing();
    else useIndicatorStore.getState().remove(indicatorId());
  };

  return (
    <div
      role="toolbar"
      aria-label={info.kind === 'drawing' ? '画线工具栏' : '指标工具栏'}
      style={{
        position: 'absolute',
        left: info.x,
        top: info.y,
        transform: 'translate(-50%, -100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: radius.md,
        boxShadow: shadow.menu,
        zIndex: zIndex.dropdown,
      }}
    >
      {info.kind === 'drawing' ? (
        <>
          <ToolButton title="设置" onClick={openDrawingSettings}>
            <Settings size={icon.md} />
          </ToolButton>
          <ToolButton title="克隆" onClick={cloneDrawing}>
            <Copy size={icon.md} />
          </ToolButton>
        </>
      ) : (
        <ToolButton title="设置" onClick={openIndicatorSettings}>
          <Settings size={icon.md} />
        </ToolButton>
      )}
      <ToolButton title="删除" onClick={removeSelected}>
        <Trash2 size={icon.md} />
      </ToolButton>
    </div>
  );
}

/** TV 小工具栏按钮：24×24，悬停态复用全局 .tv-icon-btn（panel-2 底 + text 色） */
function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="tv-icon-btn"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        padding: 0,
        border: 'none',
        borderRadius: radius.sm,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
