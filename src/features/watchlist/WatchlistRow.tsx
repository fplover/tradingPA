import { useEffect, useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';
import type { Instrument } from '@/types/instrument';
import type { Quote } from '@/data/sources/types';
import {
  decimalsFor,
  directionOf,
  directionVar,
  formatCompact,
  formatPct,
  formatPrice,
  formatSigned,
} from '@/data/format';
import type { ColumnId } from '@/store/watchlistStore';
import { COLUMN_WIDTH, QUOTE_FIELD } from './watchlistShared';
import { fontSize, icon, radius, space } from '@/ui/tokens';

const ROW_H = 44;

interface RowProps {
  instrument: Instrument;
  quote?: Quote;
  columns: ColumnId[];
  isActive: boolean;
  isFlagged: boolean;
  draggable: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onSelect: () => void;
  onRemove: () => void;
  onContextMenu: (x: number, y: number) => void;
}

/** 自选股单行：代码/名称 + 数值列 + 悬停出现的移除按钮 */
export function WatchlistRow({
  instrument,
  quote,
  columns,
  isActive,
  isFlagged,
  draggable,
  dropBefore,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onSelect,
  onRemove,
  onContextMenu,
}: RowProps) {
  const [hover, setHover] = useState(false);
  const decimals = decimalsFor(quote?.price ?? 0, instrument.decimals);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="watchlist-row"
      aria-label={`${instrument.symbol} ${instrument.name}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDrop();
      }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: space.sm,
        height: ROW_H,
        padding: `0 ${space.xs}px 0 ${space.md}px`,
        cursor: 'pointer',
        background: isActive ? 'var(--panel-2)' : hover ? 'var(--row-hover)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        boxShadow: dropBefore ? 'inset 0 2px 0 var(--accent)' : undefined,
      }}
    >
      {/* 当前图表品种的左侧强调条 */}
      {isActive && (
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--accent)' }} />
      )}

      <div style={{ flex: 1, minWidth: 108, display: 'flex', alignItems: 'center', gap: 5 }}>
        {isFlagged && <Flag size={icon.sm} style={{ color: 'var(--accent)', flexShrink: 0 }} aria-label="已标记" />}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: fontSize.lg,
              fontWeight: 600,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {instrument.symbol}
          </div>
          <div
            style={{
              fontSize: fontSize.sm,
              color: 'var(--text-faint)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {instrument.name} · {instrument.exchange}
          </div>
        </div>
      </div>

      {columns.map((col) => (
        <Cell key={col} col={col} quote={quote} decimals={decimals} />
      ))}

      <span style={{ width: icon.xl, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={`从列表移除 ${instrument.symbol}`}
          aria-label={`从列表移除 ${instrument.symbol}`}
          style={{
            visibility: hover ? 'visible' : 'hidden',
            display: 'flex',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            color: 'var(--text-faint)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <X size={icon.md} />
        </button>
      </span>
    </div>
  );
}

function Cell({ col, quote, decimals }: { col: ColumnId; quote?: Quote; decimals: number }) {
  const value = quote ? (quote[QUOTE_FIELD[col]] as number) : undefined;
  const width = COLUMN_WIDTH[col];

  // 涨跌幅是这块面板的视觉主角：实心色块 + 白字，整列看下来就是当日涨跌的条形图
  if (col === 'changePct') {
    const dir = directionOf(value ?? 0);
    return (
      <span style={{ width, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <span
          style={{
            minWidth: 56,
            textAlign: 'center',
            padding: '2px 5px',
            borderRadius: radius.xs,
            fontSize: fontSize.sm,
            fontWeight: 500,
            color: quote ? 'var(--on-updown)' : 'var(--text-faint)',
            background: quote
              ? dir === 'up'
                ? 'var(--up)'
                : dir === 'down'
                  ? 'var(--down)'
                  : 'var(--elevated)'
              : 'transparent',
          }}
        >
          {quote ? formatPct(value ?? 0) : '—'}
        </span>
      </span>
    );
  }

  if (col === 'volume' || col === 'amount') {
    return (
      <span style={{ width, flexShrink: 0, textAlign: 'right', fontSize: fontSize.md, color: 'var(--text-dim)' }}>
        {quote && value ? formatCompact(value) : '—'}
      </span>
    );
  }

  const dir = col === 'change' ? directionOf(value ?? 0) : null;
  return (
    <PriceCell
      width={width}
      value={value}
      decimals={decimals}
      signed={col === 'change'}
      color={dir ? directionVar(dir) : col === 'last' ? 'var(--text)' : 'var(--text-dim)'}
      strong={col === 'last'}
    />
  );
}

/** 价格单元格：报价变动时闪一下底色，密集列表里能一眼看到哪几只在动 */
function PriceCell({
  width,
  value,
  decimals,
  signed,
  color,
  strong,
}: {
  width: number;
  value?: number;
  decimals: number;
  signed?: boolean;
  color: string;
  strong?: boolean;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === undefined || value === undefined || before === value) return;
    setFlash(value > before ? 'up' : 'down');
    const id = window.setTimeout(() => setFlash(null), 500);
    return () => window.clearTimeout(id);
  }, [value]);

  return (
    <span
      className={flash ? `tick-${flash}` : undefined}
      style={{
        width,
        flexShrink: 0,
        textAlign: 'right',
        fontSize: fontSize.md,
        fontWeight: strong ? 500 : 400,
        color,
        borderRadius: 2,
      }}
    >
      {value === undefined ? '—' : signed ? formatSigned(value, decimals) : formatPrice(value, decimals)}
    </span>
  );
}
