import { useState } from 'react';
import { ChevronDown, ChevronUp, Play, Save, Plus, X } from 'lucide-react';
import { usePineStore } from '@/store/pineStore';
import { fontSize, space } from '@/ui/tokens';

/** Pine 编辑器：TV 底部 dock 形态——编辑区 + 控制台，实时编译注册为指标 */
export function PineEditorPanel() {
  const source = usePineStore((s) => s.editorSource);
  const errors = usePineStore((s) => s.errors);
  const scripts = usePineStore((s) => s.scripts);
  const draftName = usePineStore((s) => s.draftName);
  const setEditorSource = usePineStore((s) => s.setEditorSource);
  const run = usePineStore((s) => s.run);
  const save = usePineStore((s) => s.save);
  const addDraftToChart = usePineStore((s) => s.addDraftToChart);
  const remove = usePineStore((s) => s.remove);
  const loadIntoEditor = usePineStore((s) => s.loadIntoEditor);
  const setPanelOpen = usePineStore((s) => s.setPanelOpen);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel)',
        borderTop: '1px solid var(--border)',
        height: collapsed ? 34 : 240,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, height: 34, padding: `0 ${space.sm}px`, flexShrink: 0 }}>
        <span style={{ color: 'var(--text)', fontSize: fontSize.md, fontWeight: 600 }}>Pine 编辑器</span>
        {draftName && <span style={{ color: 'var(--text-faint)', fontSize: fontSize.sm }}>· {draftName}</span>}
        <span style={{ flex: 1 }} />
        {scripts.length > 0 && (
          <select
            style={selectStyle}
            value=""
            aria-label="已保存脚本"
            onChange={(e) => {
              if (e.target.value) loadIntoEditor(e.target.value);
            }}
          >
            <option value="">已保存（{scripts.length}）…</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {scripts.length > 0 && (
          <select
            style={selectStyle}
            value=""
            aria-label="删除脚本"
            onChange={(e) => {
              if (e.target.value) remove(e.target.value);
            }}
          >
            <option value="">删除…</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button style={btnStyle} onClick={() => run()} title="运行（编译草稿）">
          <Play size={13} /> 运行
        </button>
        <button style={btnStyle} onClick={() => save()} title="保存脚本">
          <Save size={13} /> 保存
        </button>
        <button style={{ ...btnStyle, background: 'var(--accent)', color: 'var(--text-on-accent)' }} onClick={() => addDraftToChart()} title="添加到图表">
          <Plus size={13} /> 添加到图表
        </button>
        <button style={iconBtnStyle} onClick={() => setCollapsed(!collapsed)} title={collapsed ? '展开编辑器' : '收起编辑器'} aria-label={collapsed ? '展开编辑器' : '收起编辑器'}>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button style={iconBtnStyle} onClick={() => setPanelOpen(false)} title="关闭" aria-label="关闭 Pine 编辑器">
          <X size={14} />
        </button>
      </div>

      {!collapsed && (
        <>
          <textarea
            value={source}
            onChange={(e) => setEditorSource(e.target.value)}
            spellCheck={false}
            aria-label="Pine 脚本源码"
            style={{
              flex: 1,
              minHeight: 0,
              resize: 'none',
              background: 'var(--bg)',
              color: 'var(--text)',
              border: 'none',
              borderTop: '1px solid var(--border)',
              outline: 'none',
              padding: space.sm,
              fontSize: fontSize.md,
              lineHeight: 1.6,
              fontFamily: 'Consolas, Menlo, monospace',
              whiteSpace: 'pre',
              overflow: 'auto',
            }}
          />
          {errors.length > 0 && (
            <div className="tv-scroll" style={{ maxHeight: 96, overflowY: 'auto', borderTop: '1px solid var(--border)', padding: `${space.xs}px ${space.sm}px` }}>
              {errors.map((e, i) => (
                <div key={i} style={{ color: 'var(--down)', fontSize: fontSize.sm, lineHeight: 1.7 }}>
                  第 {e.line} 行：{e.message}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 24,
  padding: `0 ${space.sm}px`,
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  fontSize: fontSize.sm,
  cursor: 'pointer',
  flexShrink: 0,
};

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  background: 'transparent',
  color: 'var(--text-dim)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  height: 24,
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  fontSize: fontSize.sm,
  padding: `0 ${space.xs}px`,
  maxWidth: 140,
};
