import { useEffect, useState } from 'react';
import type { Drawing } from '@/engine/drawing/types';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';

interface ObjectTreeProps {
  renderer: ChartRenderer | null;
  onClose: () => void;
}

/** 对象树：画线列表的显示/锁定/删除/选中 */
export function ObjectTree({ renderer, onClose }: ObjectTreeProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  useEffect(() => {
    if (!renderer) return;
    const sync = () => setDrawings(renderer.listDrawings());
    sync();
    return renderer.onDrawingsChanged(sync);
  }, [renderer]);

  if (!renderer) return null;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: '#d1d4dc', fontSize: 12 }}>对象树（{drawings.length}）</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btn} onClick={() => renderer.undoDrawing()} title="撤销 (Ctrl+Z)">
            ↶
          </button>
          <button style={btn} onClick={() => renderer.redoDrawing()} title="重做 (Ctrl+Y)">
            ↷
          </button>
          <button style={btn} onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      {drawings.length === 0 && <div style={{ color: '#787b86', fontSize: 11 }}>暂无画线。左侧选择工具后在图表上点击放置。</div>}
      {drawings.map((d) => (
        <div
          key={d.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 6px',
            borderRadius: 4,
            fontSize: 11,
            color: '#d1d4dc',
            background: renderer.selectedDrawingId === d.id ? '#2a2e39' : 'transparent',
          }}
        >
          <span style={{ width: 10, height: 10, background: d.style.color, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {labelOf(d)}
          </span>
          <button style={miniBtn} onClick={() => renderer.setDrawingVisible(d.id, !d.visible)} title="显示/隐藏">
            {d.visible ? '👁' : '🚫'}
          </button>
          <button style={miniBtn} onClick={() => renderer.setDrawingLocked(d.id, !d.locked)} title="锁定">
            {d.locked ? '🔒' : '🔓'}
          </button>
          <button style={miniBtn} onClick={() => renderer.removeDrawing(d.id)} title="删除">
            ×
          </button>
        </div>
      ))}
      {drawings.length > 0 && (
        <button style={{ ...btn, width: '100%', marginTop: 8 }} onClick={() => renderer.clearDrawings()}>
          清空全部
        </button>
      )}
    </div>
  );
}

function labelOf(d: Drawing): string {
  const names: Record<string, string> = {
    trendline: '趋势线', ray: '射线', hline: '水平线', vline: '垂直线', arrow: '箭头',
    'info-line': '信息线', channel: '平行通道', rect: '矩形', ellipse: '椭圆', path: '路径',
    text: `文本「${d.style.text ?? ''}」`, fib: '斐波那契回撤',
  };
  return names[d.type] ?? d.type;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 76,
  top: 8,
  width: 220,
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
  background: '#1e222d',
  border: '1px solid #2a2e39',
  borderRadius: 6,
  padding: 10,
  zIndex: 15,
};

const btn: React.CSSProperties = {
  background: '#2a2e39',
  color: '#d1d4dc',
  border: 'none',
  borderRadius: 4,
  padding: '3px 8px',
  fontSize: 11,
  cursor: 'pointer',
};

const miniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#787b86',
  cursor: 'pointer',
  fontSize: 11,
  padding: '0 2px',
};
