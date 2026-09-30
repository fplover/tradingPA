import { ChevronRight, Eye, EyeOff, Lock, Magnet, MousePointer2, Trash2, Unlock } from 'lucide-react';
import type { HoverTarget } from './drawingToolGroups';
import { bottomBtnStyle, caretStyle, cellStyle, controlStyle, mainBtnStyle } from './drawingToolbarStyles';
import type { BottomMenuState } from './DrawingToolbarMenus';

interface BottomControlsProps {
  magnet: boolean;
  magnetMode: 'weak' | 'strong';
  stayMode: boolean;
  locked: boolean;
  hideDrawings: boolean;
  hovered: HoverTarget | null;
  bottomMenu: BottomMenuState | null;
  setMagnet: (v: boolean) => void;
  setStayMode: (v: boolean) => void;
  onToggleLock: () => void;
  onToggleHide: () => void;
  onRemoveAll: (scope: 'drawings' | 'studies' | 'all') => void;
  onHover: (h: HoverTarget | null) => void;
  onBottomMenu: (m: BottomMenuState | null) => void;
}

/** 底部控件：磁吸（caret 切强弱档）/ 保持 / 锁定 / 隐藏 / 清空（caret 选范围） */
export function BottomControls({
  magnet,
  magnetMode,
  stayMode,
  locked,
  hideDrawings,
  hovered,
  bottomMenu,
  setMagnet,
  setStayMode,
  onToggleLock,
  onToggleHide,
  onRemoveAll,
  onHover,
  onBottomMenu,
}: BottomControlsProps) {
  return (
    <>
      {/* 磁吸：主按钮开关，caret 切强弱档（TV 默认弱磁铁） */}
      <div style={controlStyle} onMouseEnter={() => onHover('magnet')} onMouseLeave={() => onHover(null)}>
        <button
          style={mainBtnStyle}
          title={magnet ? `磁吸（${magnetMode === 'strong' ? '强磁铁' : '弱磁铁'}）` : '磁吸（吸附 OHLC）'}
          aria-label="磁吸"
          aria-pressed={magnet}
          onClick={() => setMagnet(!magnet)}
        >
          <span style={{ ...cellStyle, background: magnet ? 'var(--accent)' : hovered === 'magnet' ? 'var(--panel-2)' : 'transparent' }}>
            <Magnet size={18} strokeWidth={1.5} style={{ color: magnet ? 'var(--text-on-accent)' : undefined }} />
          </span>
        </button>
        <button
          style={{ ...caretStyle, opacity: hovered === 'magnet' || bottomMenu?.kind === 'magnet' ? 1 : 0 }}
          title="磁吸模式"
          aria-label="磁吸模式"
          aria-haspopup="menu"
          aria-expanded={bottomMenu?.kind === 'magnet'}
          data-role="menu-handle"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onBottomMenu(bottomMenu?.kind === 'magnet' ? null : { kind: 'magnet', x: r.right + 1, y: r.top - 6 });
          }}
        >
          <ChevronRight size={12} style={{ transform: bottomMenu?.kind === 'magnet' ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      <button
        className="rail-btn"
        data-active={stayMode}
        title={stayMode ? '保持绘图模式：开' : '保持绘图模式：关（完成后退出工具）'}
        aria-label="保持绘图模式"
        aria-pressed={stayMode}
        onClick={() => setStayMode(!stayMode)}
        style={bottomBtnStyle}
      >
        <MousePointer2 size={18} strokeWidth={1.5} />
      </button>
      <button
        className="rail-btn"
        data-active={locked}
        title={locked ? '解锁所有绘图' : '锁定所有绘图'}
        aria-label={locked ? '解锁所有绘图' : '锁定所有绘图'}
        aria-pressed={locked}
        onClick={onToggleLock}
        style={bottomBtnStyle}
      >
        {locked ? <Lock size={18} /> : <Unlock size={18} />}
      </button>
      <button
        className="rail-btn"
        data-active={hideDrawings}
        title={hideDrawings ? '显示所有绘图' : '隐藏所有绘图'}
        aria-label={hideDrawings ? '显示所有绘图' : '隐藏所有绘图'}
        aria-pressed={hideDrawings}
        onClick={onToggleHide}
        style={bottomBtnStyle}
      >
        {hideDrawings ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
      {/* 清空全部：caret 展开 移除画线/移除指标/移除画线和指标（TV removeAllDrawingTools） */}
      <div style={{ ...controlStyle, marginTop: 'auto' }} onMouseEnter={() => onHover('remove')} onMouseLeave={() => onHover(null)}>
        <button
          style={mainBtnStyle}
          title="清空全部"
          aria-label="清空全部"
          onClick={() => onRemoveAll('drawings')}
        >
          <span style={{ ...cellStyle, background: hovered === 'remove' ? 'var(--panel-2)' : 'transparent' }}>
            <Trash2 size={18} strokeWidth={1.5} />
          </span>
        </button>
        <button
          style={{ ...caretStyle, opacity: hovered === 'remove' || bottomMenu?.kind === 'remove' ? 1 : 0 }}
          title="清空选项"
          aria-label="清空选项"
          aria-haspopup="menu"
          aria-expanded={bottomMenu?.kind === 'remove'}
          data-role="menu-handle"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onBottomMenu(bottomMenu?.kind === 'remove' ? null : { kind: 'remove', x: r.right + 1, y: r.top - 6 });
          }}
        >
          <ChevronRight size={12} style={{ transform: bottomMenu?.kind === 'remove' ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
    </>
  );
}
