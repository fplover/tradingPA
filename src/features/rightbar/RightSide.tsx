import { Bell, Layers, List } from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { useAlertStore } from '@/store/alertStore';
import { useRightDockStore, type RightPanelId } from './rightPanelStore';
import { WatchlistPanel } from '@/features/watchlist/WatchlistPanel';
import { ObjectTree } from '@/features/drawings/ObjectTree';
import { AlertPanel } from '@/features/alerts/AlertPanel';
import { zIndex } from '@/ui/tokens';

/** 右侧图标轨的条目。顺序对齐 TradingView：自选股在最上。 */
const RAIL: { id: RightPanelId; label: string; icon: typeof List }[] = [
  { id: 'watchlist', label: '自选股', icon: List },
  { id: 'objectTree', label: '对象树', icon: Layers },
  { id: 'alerts', label: '价格警报', icon: Bell },
];

interface RightSideProps {
  renderer: ChartRenderer | null;
  alertSymbol: string;
  alertPrice: number;
}

/** 右侧区域 = 停靠面板 + 图标轨。面板挤压图表宽度，不覆盖图表。 */
export function RightSide({ renderer, alertSymbol, alertPrice }: RightSideProps) {
  const panel = useRightDockStore((s) => s.panel);
  const width = useRightDockStore((s) => s.width);
  const setWidth = useRightDockStore((s) => s.setWidth);
  const toggle = useRightDockStore((s) => s.toggle);
  const close = useRightDockStore((s) => s.close);
  const alertCount = useAlertStore((s) => s.alerts.length);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.classList.add('resizing');
    const onMove = (ev: PointerEvent) => setWidth(startWidth + (startX - ev.clientX));
    const onUp = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{ display: 'flex', flexShrink: 0, height: '100%' }}>
      {panel && (
        <div style={{ position: 'relative', width, flexShrink: 0, height: '100%' }}>
          {/* 左边缘拖拽调宽热区 */}
          <div
            onPointerDown={startResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="拖拽调整面板宽度"
            style={{ position: 'absolute', left: -2, top: 0, width: 5, height: '100%', cursor: 'col-resize', zIndex: 2 }}
          />
          <div
            className="tv-scroll"
            style={{
              width: '100%',
              height: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              background: 'var(--panel)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {panel === 'watchlist' && <WatchlistPanel />}
            {panel === 'objectTree' && <ObjectTree renderer={renderer} onClose={close} />}
            {panel === 'alerts' && <AlertPanel symbol={alertSymbol} currentPrice={alertPrice} />}
          </div>
        </div>
      )}

      <nav
        aria-label="右侧面板"
        style={{
          width: 38,
          flexShrink: 0,
          height: '100%',
          background: 'var(--panel)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 6,
          gap: 2,
          zIndex: zIndex.toolbar,
        }}
      >
        {RAIL.map(({ id, label, icon: Icon }) => {
          const active = panel === id;
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              title={label}
              aria-label={label}
              aria-pressed={active}
              className="rail-btn"
              data-active={active}
            >
              {/* 选中态左侧强调条：仅凭底色区分选中/悬停不够明确 */}
              {active && (
                <span
                  style={{
                    position: 'absolute',
                    left: -4,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    borderRadius: 1,
                    background: 'var(--accent)',
                  }}
                />
              )}
              <Icon size={18} />
              {id === 'alerts' && alertCount > 0 && <span style={badgeStyle}>{alertCount}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** 未读警报计数：面板收起时也要能看到有警报在 */
const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 1,
  right: 1,
  minWidth: 13,
  height: 13,
  padding: '0 3px',
  borderRadius: 7,
  background: 'var(--down)',
  color: 'var(--on-updown)',
  fontSize: 9,
  lineHeight: '13px',
  fontWeight: 600,
  textAlign: 'center',
};
