import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { fontSize, icon, radius, space } from '@/ui/tokens';

/**
 * 命名模板分区的共用呈现层（TV 的 Templates 形态）：命名保存 / 应用 / 行内重命名 /
 * 删除（二次确认）。两个调用方——指标对话框内嵌区（indicatorStore 的模板）与图表设置
 * 「模板」页（三期-B1，chartTemplateStore）——快照单元不同（指标列表 vs 偏好切片），
 * 行呈现完全同构，故条目与动作全部由 props 注入，本组件不读任何 store。
 * 键盘导航（↑↓/Enter 劫持）留给各调用方的外层列表，本区只处理自身输入框的 Enter/Esc。
 */

/** 模板行：id + 名称 + 行尾次要信息（相对时间，由调用方算好传入） */
export interface TemplateRow {
  id: string;
  name: string;
  meta: string;
}

export interface NamedTemplateSectionProps {
  /** 分区无障碍名（如「指标模板」「图表模板」） */
  ariaLabel: string;
  rows: TemplateRow[];
  /** 保存按钮 title */
  saveTitle: string;
  /** 空态文案 */
  emptyText: string;
  /** 列表滚动高度上限（指标面板窄、模板列表压 132；对话框整页用放宽） */
  listMaxHeight?: number;
  /** 顶部分隔线：嵌在面板分区之间时需要，作为对话框页签内容时不需要 */
  topDivider?: boolean;
  onSave: (name: string) => void;
  onApply: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function NamedTemplateSection({
  ariaLabel,
  rows,
  saveTitle,
  emptyText,
  listMaxHeight = 240,
  topDivider = false,
  onSave,
  onApply,
  onRename,
  onDelete,
}: NamedTemplateSectionProps) {
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onSave(name);
    setName('');
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setDraft(current);
  };

  const commitRename = () => {
    if (renamingId) onRename(renamingId, draft);
    setRenamingId(null);
    setDraft('');
  };

  const remove = (id: string, label: string) => {
    if (window.confirm(`删除模板「${label}」？`)) onDelete(id);
  };

  return (
    <section
      style={{ borderTop: topDivider ? '1px solid var(--border)' : undefined, flexShrink: 0 }}
      aria-label={ariaLabel}
    >
      <div style={{ color: 'var(--text-dim)', fontSize: fontSize.sm, padding: `${space.xs}px ${space.sm}px 0` }}>
        模板
      </div>

      <div style={{ display: 'flex', gap: space.xs, padding: `${space.xs}px ${space.sm}px` }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          placeholder="模板名称"
          aria-label="模板名称"
          style={inputStyle}
        />
        <button onClick={save} disabled={!canSave} title={saveTitle} style={saveBtnStyle(canSave)}>
          保存当前为模板
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={emptyStyle}>{emptyText}</div>
      ) : (
        <div
          className="tv-scroll"
          style={{ maxHeight: listMaxHeight, overflowY: 'auto', padding: `0 ${space.xs}px ${space.xs}px` }}
        >
          {rows.map((t) =>
            renamingId === t.id ? (
              <div key={t.id} className="tv-menu-item" style={rowStyle} data-testid="template-row">
                <input
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setRenamingId(null);
                    }
                  }}
                  aria-label={`重命名模板 ${t.name}`}
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                />
                <RowIcon label={`确认重命名 ${t.name}`} onClick={commitRename}>
                  <Check size={icon.md} />
                </RowIcon>
                <RowIcon label="取消重命名" onClick={() => setRenamingId(null)}>
                  <X size={icon.md} />
                </RowIcon>
              </div>
            ) : (
              <div
                key={t.id}
                className="tv-menu-item"
                style={rowStyle}
                data-testid="template-row"
                title={`应用模板「${t.name}」`}
                onClick={() => onApply(t.id)}
              >
                <span style={nameStyle}>{t.name}</span>
                <span style={timeStyle}>{t.meta}</span>
                <RowIcon label={`应用模板 ${t.name}`} onClick={() => onApply(t.id)}>
                  <Check size={icon.md} />
                </RowIcon>
                <RowIcon label={`重命名模板 ${t.name}`} onClick={() => startRename(t.id, t.name)}>
                  <Pencil size={icon.md} />
                </RowIcon>
                <RowIcon label={`删除模板 ${t.name}`} onClick={() => remove(t.id, t.name)}>
                  <Trash2 size={icon.md} />
                </RowIcon>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** 行内小图标按钮：14px 图标 + 22px 热区；行背景悬停由外层 tv-menu-item 提供，图标变色在按钮自身处理 */
function RowIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        flexShrink: 0,
        background: 'none',
        border: 'none',
        borderRadius: radius.sm,
        color: 'var(--text-faint)',
        cursor: 'pointer',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-faint)';
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: fontSize.md,
};

const saveBtnStyle = (enabled: boolean): React.CSSProperties => ({
  flexShrink: 0,
  background: enabled ? 'var(--accent)' : 'var(--panel-2)',
  color: enabled ? 'var(--text-on-accent)' : 'var(--text-faint)',
  border: 'none',
  borderRadius: radius.sm,
  cursor: enabled ? 'pointer' : 'default',
  fontSize: fontSize.sm,
  padding: '4px 8px',
  whiteSpace: 'nowrap',
});

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.xs,
  padding: `4px ${space.xs}px`,
  cursor: 'pointer',
  color: 'var(--text)',
  fontSize: fontSize.md,
};

const nameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const timeStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  flexShrink: 0,
};

const emptyStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  padding: `${space.xs}px ${space.sm}px ${space.sm}px`,
};
