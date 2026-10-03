import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useIndicatorStore } from '@/store/indicatorStore';
import { relativeTime, sortTemplates } from '@/store/indicatorTemplates';
import { fontSize, radius, space } from '@/ui/tokens';

/** 指标面板内嵌「模板」分区（TV 指标对话框 Templates 形态）：命名保存 / 应用 /
 *  行内重命名 / 删除（二次确认）。键盘导航只作用于指标搜索列表，本区不挂 ↑↓/Enter 劫持。 */
export function TemplateSection() {
  const templates = useIndicatorStore((s) => s.templates);
  const saveTemplate = useIndicatorStore((s) => s.saveTemplate);
  const loadTemplate = useIndicatorStore((s) => s.loadTemplate);
  const renameTemplate = useIndicatorStore((s) => s.renameTemplate);
  const deleteTemplate = useIndicatorStore((s) => s.deleteTemplate);
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const rows = sortTemplates(templates);
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    saveTemplate(name);
    setName('');
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setDraft(current);
  };

  const commitRename = () => {
    if (renamingId) renameTemplate(renamingId, draft);
    setRenamingId(null);
    setDraft('');
  };

  const remove = (id: string, label: string) => {
    if (window.confirm(`删除模板「${label}」？`)) deleteTemplate(id);
  };

  return (
    <section style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }} aria-label="指标模板">
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
        <button onClick={save} disabled={!canSave} title="保存当前指标组合为模板" style={saveBtnStyle(canSave)}>
          保存当前为模板
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={emptyStyle}>保存当前指标组合为模板，随时一键应用</div>
      ) : (
        <div
          className="tv-scroll"
          style={{ maxHeight: 132, overflowY: 'auto', padding: `0 ${space.xs}px ${space.xs}px` }}
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
                  <Check size={14} />
                </RowIcon>
                <RowIcon label="取消重命名" onClick={() => setRenamingId(null)}>
                  <X size={14} />
                </RowIcon>
              </div>
            ) : (
              <div
                key={t.id}
                className="tv-menu-item"
                style={rowStyle}
                data-testid="template-row"
                title={`应用模板「${t.name}」`}
                onClick={() => loadTemplate(t.id)}
              >
                <span style={nameStyle}>{t.name}</span>
                <span style={timeStyle}>{relativeTime(t.savedAt)}</span>
                <RowIcon label={`应用模板 ${t.name}`} onClick={() => loadTemplate(t.id)}>
                  <Check size={14} />
                </RowIcon>
                <RowIcon label={`重命名模板 ${t.name}`} onClick={() => startRename(t.id, t.name)}>
                  <Pencil size={14} />
                </RowIcon>
                <RowIcon label={`删除模板 ${t.name}`} onClick={() => remove(t.id, t.name)}>
                  <Trash2 size={14} />
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
