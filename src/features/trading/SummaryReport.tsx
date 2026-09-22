import { X } from 'lucide-react';
import { useTradeStore } from './tradeStore';

const fmtQty = (q: number) => String(Number(q.toFixed(8)));

/** 交易总结报告模态框 */
export function SummaryReport({ onClose }: { onClose: () => void }) {
  const version = useTradeStore((s) => s.version);
  const engine = useTradeStore((s) => s.engine);
  void version;
  const s = engine.summary();
  const pnlColor = (v: number) => (v >= 0 ? '#26a69a' : '#ef5350');

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ color: 'var(--text)', fontSize: 14 }}>交易总结报告</strong>
          <div style={{ flex: 1 }} />
          <button style={iconBtnStyle} onClick={onClose} title="关闭">
            <X size={15} />
          </button>
        </div>

        {/* 核心指标 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <Stat label="初始资金" value={s.initialBalance.toFixed(2)} />
          <Stat label="最终权益" value={s.finalEquity.toFixed(2)} />
          <Stat label="净盈亏" value={`${s.netPnL >= 0 ? '+' : ''}${s.netPnL.toFixed(2)}`} color={pnlColor(s.netPnL)} />
          <Stat label="收益率" value={`${s.returnPct >= 0 ? '+' : ''}${s.returnPct.toFixed(2)}%`} color={pnlColor(s.returnPct)} />
          <Stat label="交易次数" value={String(s.totalTrades)} />
          <Stat label="胜率" value={`${s.winRate.toFixed(1)}%`} hint={`胜 ${s.winTrades} / 负 ${s.loseTrades}`} />
          <Stat
            label="盈亏比"
            value={s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)}
          />
          <Stat label="最大回撤" value={`${s.maxDrawdownPct.toFixed(2)}%`} color="#ef5350" />
          <Stat label="平均盈利" value={s.avgWin.toFixed(2)} color="#26a69a" />
          <Stat label="平均亏损" value={s.avgLoss.toFixed(2)} color="#ef5350" />
        </div>

        {/* 未平状态 */}
        {(s.openPosition || s.pendingOrders > 0) && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>
            {s.openPosition && (
              <span>
                未平仓：{s.openPosition.side === 'long' ? '多' : '空'} {fmtQty(s.openPosition.qty)} @ {s.openPosition.avgPrice.toFixed(2)}
                （浮动 {s.unrealizedPnL >= 0 ? '+' : ''}{s.unrealizedPnL.toFixed(2)}）
              </span>
            )}
            {s.openPosition && s.pendingOrders > 0 && ' · '}
            {s.pendingOrders > 0 && <span>挂单 {s.pendingOrders} 笔</span>}
          </div>
        )}

        {/* 成交明细 */}
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>成交明细</div>
        <div style={tableWrap}>
          {engine.trades.length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: 8, textAlign: 'center' }}>暂无成交</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={{ color: 'var(--text-faint)' }}>
                  <th style={thStyle}>方向</th>
                  <th style={thStyle}>数量</th>
                  <th style={thStyle}>开仓价</th>
                  <th style={thStyle}>平仓价</th>
                  <th style={thStyle}>盈亏</th>
                </tr>
              </thead>
              <tbody>
                {engine.trades.map((t) => (
                  <tr key={t.id} style={{ color: 'var(--text)' }}>
                    <td style={{ ...tdStyle, color: t.side === 'long' ? '#26a69a' : '#ef5350' }}>{t.side === 'long' ? '多' : '空'}</td>
                    <td style={tdStyle}>{fmtQty(t.qty)}</td>
                    <td style={tdStyle}>{t.entryPrice.toFixed(2)}</td>
                    <td style={tdStyle}>{t.exitPrice.toFixed(2)}</td>
                    <td style={{ ...tdStyle, color: pnlColor(t.pnl) }}>{t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '6px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--text)' }}>{value}</div>
      {hint && <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>{hint}</div>}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 70,
};

const dialogStyle: React.CSSProperties = {
  width: 460,
  maxHeight: '80vh',
  overflowY: 'auto',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
};

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
};

const tableWrap: React.CSSProperties = {
  maxHeight: 220,
  overflowY: 'auto',
  border: '1px solid var(--border)',
  borderRadius: 6,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 400,
};

const tdStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderBottom: '1px solid var(--border)',
};
