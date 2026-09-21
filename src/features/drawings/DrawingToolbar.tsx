import { DRAWING_TOOLS } from '@/engine/drawing/types';
import { useDrawingStore } from '@/store/drawingStore';

/** 左侧画线工具栏：光标 + 12 工具 + 磁吸 */
export function DrawingToolbar() {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const magnet = useDrawingStore((s) => s.magnet);
  const setMagnet = useDrawingStore((s) => s.setMagnet);

  return (
    <div
      style={{
        position: 'absolute',
        left: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: '#1e222d',
        border: '1px solid #2a2e39',
        borderRadius: 6,
        padding: 6,
        zIndex: 15,
      }}
    >
      <ToolButton active={activeTool === null} onClick={() => setActiveTool(null)} title="光标">
        ⌖
      </ToolButton>
      {DRAWING_TOOLS.map((t) => (
        <ToolButton key={t.id} active={activeTool === t.id} onClick={() => setActiveTool(t.id)} title={t.label}>
          {iconFor(t.id)}
        </ToolButton>
      ))}
      <div style={{ height: 1, background: '#2a2e39', margin: '4px 2px' }} />
      <ToolButton active={magnet} onClick={() => setMagnet(!magnet)} title="磁吸（吸附OHLC）">
        ⌸
      </ToolButton>
    </div>
  );
}

function ToolButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? '#2962ff' : 'transparent',
        color: active ? '#fff' : '#b2b5be',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
}

function iconFor(id: string): string {
  switch (id) {
    case 'trendline': return '╱';
    case 'ray': return '⟋';
    case 'hline': return '─';
    case 'vline': return '│';
    case 'arrow': return '→';
    case 'info-line': return 'ℹ';
    case 'channel': return '≣';
    case 'rect': return '▭';
    case 'ellipse': return '◯';
    case 'path': return '✎';
    case 'text': return 'T';
    case 'fib': return 'Ϝ';
    default: return '•';
  }
}
