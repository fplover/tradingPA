import { useRef, useState } from 'react';
import { Plus, X, FileChartLine, FoldVertical, UnfoldVertical } from 'lucide-react';
import { useTradeStore } from './tradeStore';
import { useTradePanelStore } from '@/store/tradePanelStore';
import { Modal, Tab, TabList } from '@/ui/primitives';
import * as Tabs from '@radix-ui/react-tabs';
import { OrderDialog, ORDER_TYPE_LABELS } from './OrderDialog';
import { icon, radius } from '@/ui/tokens';

const fmtQty = (q: number) => String(Number(q.toFixed(8)));

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 挂单时间列：M/D HH:mm */
const fmtOrderTime = (t: number) => {
  if (!t) return '--';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

interface TradePanelProps {
  price: number;
  time: number;
  onReport: () => void;
}

/** 回放交易面板（底部）：高度可拖拽 + 权益/浮动 + 挂单入口 + 挂单/持仓/成交页签 */
export function TradePanel({ price, time, onReport }: TradePanelProps) {
  const version = useTradeStore((s) => s.version);
  const engine = useTradeStore((s) => s.engine);
  const place = useTradeStore((s) => s.place);
  const cancel = useTradeStore((s) => s.cancel);
  const panelOpen = useTradePanelStore((s) => s.open);
  const togglePanel = useTradePanelStore((s) => s.toggle);
  const panelHeight = useTradePanelStore((s) => s.height);
  const setPanelHeight = useTradePanelStore((s) => s.setHeight);

  const [tab, setTab] = useState<'pending' | 'position' | 'trades'>('pending');
  const [dialogOpen, setDialogOpen] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // 顶部拖拽调整高度
  const onHandleDown = (e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, startH: panelHeight };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // 向上拖增高
    setPanelHeight(dragRef.current.startH + (dragRef.current.startY - e.clientY));
  };
  const onHandleUp = () => {
    dragRef.current = null;
  };

  void version;
  const pending = engine.pendingOrders;
  const position = engine.position;
  const pnlColor = (v: number) => (v >= 0 ? 'var(--up)' : 'var(--down)');

  return (
    <div style={{ ...panelStyle, height: panelOpen ? panelHeight : 'auto' }}>
      {/* 顶部拖拽热区：调整面板高度（仅展开时） */}
      {panelOpen && (
        <div
          style={resizeHandleStyle}
          title="拖动调整高度"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
      )}
      {/* 头部：标题 + 权益 + 入口 */}
      <div style={headerStyle}>
        <strong style={{ color: 'var(--text)', fontSize: 12 }}>回放交易面板</strong>
        <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>
          权益 {engine.equity.toFixed(2)} · 浮动{' '}
          <b style={{ color: pnlColor(engine.unrealizedPnL) }}>
            {engine.unrealizedPnL >= 0 ? '+' : ''}
            {engine.unrealizedPnL.toFixed(2)}
          </b>
        </span>
        <div style={{ flex: 1 }} />
        <button style={iconBtn} title="限价 / 止损挂单" onClick={() => setDialogOpen(true)}>
          <Plus size={icon.md} />
        </button>
        <button style={iconBtn} title="交易报告" onClick={onReport}>
          <FileChartLine size={icon.md} />
        </button>
        <button style={iconBtn} title={panelOpen ? '收起面板' : '展开面板'} onClick={togglePanel}>
          {panelOpen ? <FoldVertical size={icon.md} /> : <UnfoldVertical size={icon.md} />}
        </button>
      </div>

      {/* 页签 + 列表（展开时显示） */}
      {panelOpen && (
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabList>
            {(
              [
                ['pending', `挂单 (${pending.length})`],
                ['position', position ? `持仓 (${fmtQty(position.qty)})` : '持仓'],
                ['trades', `成交 (${engine.trades.length})`],
              ] as const
            ).map(([key, label]) => (
              <Tab key={key} value={key} active={tab === key}>
                {label}
              </Tab>
            ))}
          </TabList>

          <div style={listStyle}>
            <Tabs.Content value="pending">
              {pending.length === 0 ? (
                <Empty text="无挂单" />
              ) : (
                pending.map((o) => (
                  <Row key={o.id}>
                    <span style={{ color: o.side === 'buy' ? 'var(--buy)' : 'var(--sell)' }}>
                      {o.side === 'buy' ? '买' : '卖'}
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>{ORDER_TYPE_LABELS[o.type]}</span>
                    <span style={{ color: 'var(--text)' }}>{fmtQty(o.qty)}</span>
                    <span style={{ color: 'var(--text-faint)' }}>
                      {o.limitPrice ? `限 ${o.limitPrice}` : ''} {o.stopPrice ? `止 ${o.stopPrice}` : ''}
                    </span>
                    <span style={{ color: 'var(--text-faint)' }}>{fmtOrderTime(o.createdAt)}</span>
                    <div style={{ flex: 1 }} />
                    <button style={iconBtn} title="撤单" onClick={() => cancel(o.id)}>
                      <X size={icon.sm} />
                    </button>
                  </Row>
                ))
              )}
            </Tabs.Content>

            <Tabs.Content value="position">
              {position ? (
                <Row>
                  <span style={{ color: position.side === 'long' ? 'var(--up)' : 'var(--down)' }}>
                    {position.side === 'long' ? '多' : '空'}
                  </span>
                  <span style={{ color: 'var(--text)' }}>{fmtQty(position.qty)}</span>
                  <span style={{ color: 'var(--text-dim)' }}>@ {position.avgPrice.toFixed(2)}</span>
                  <div style={{ flex: 1 }} />
                  <b style={{ color: pnlColor(engine.unrealizedPnL) }}>
                    {engine.unrealizedPnL >= 0 ? '+' : ''}
                    {engine.unrealizedPnL.toFixed(2)}
                  </b>
                </Row>
              ) : (
                <Empty text="无持仓" />
              )}
            </Tabs.Content>

            <Tabs.Content value="trades">
              {engine.trades.length === 0 ? (
                <Empty text="无成交" />
              ) : (
                engine.trades.slice(0, 20).map((t) => (
                  <Row key={t.id}>
                    <span style={{ color: t.side === 'long' ? 'var(--up)' : 'var(--down)' }}>
                      {t.side === 'long' ? '多' : '空'}
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>{fmtQty(t.qty)}</span>
                    <span style={{ color: 'var(--text-faint)' }}>
                      {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}
                    </span>
                    <div style={{ flex: 1 }} />
                    <b style={{ color: pnlColor(t.pnl) }}>
                      {t.pnl >= 0 ? '+' : ''}
                      {t.pnl.toFixed(2)}
                    </b>
                  </Row>
                ))
              )}
            </Tabs.Content>
          </div>
        </Tabs.Root>
      )}

      <Modal open={dialogOpen} onOpenChange={setDialogOpen} title="挂单" width={280}>
        <OrderDialog
          price={price}
          qtyNum={0.01}
          onSubmit={(spec) => {
            place(spec, price, time);
            setDialogOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 2px',
        fontSize: 11,
        borderBottom: '1px solid var(--border)',
      }}
    >
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: '10px 2px', textAlign: 'center' }}>{text}</div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
  background: 'var(--panel)',
  borderTop: '1px solid var(--border)',
  padding: '6px 10px 8px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const resizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 5,
  cursor: 'ns-resize',
  zIndex: 2,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
};

const iconBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  padding: 2,
  borderRadius: radius.sm,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
};
