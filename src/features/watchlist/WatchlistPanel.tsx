import { useEffect, useMemo, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  Flag,
  LineChart,
  Pencil,
  Plus,
  Settings2,
  X,
} from 'lucide-react';
import type { Instrument } from '@/types/instrument';
import { MARKETS } from '@/types/instrument';
import type { Quote } from '@/data/sources/types';
import { decimalsFor, directionOf, directionVar, formatCompact, formatPct, formatPrice, formatSigned } from '@/data/format';
import { COLUMNS, useWatchlistStore, type ColumnId, type SortKey } from '@/store/watchlistStore';
import { useQuoteStore } from '@/store/quoteStore';
import { useSymbolSearchStore } from './searchStore';
import { RenameListDialog } from './RenameListDialog';
import { control, fontSize, shadow, space, zIndex } from '@/ui/tokens';

/** 列 → Quote 字段。代码/名称列不走报价。 */
const QUOTE_FIELD: Record<ColumnId, keyof Quote> = {
  last: 'price',
  changePct: 'changePct',
  change: 'change',
  volume: 'volume',
  amount: 'amount',
  open: 'open',
  high: 'high',
  low: 'low',
  prevClose: 'prevClose',
};

const COLUMN_WIDTH: Record<ColumnId, number> = {
  last: 74,
  changePct: 66,
  change: 64,
  volume: 58,
  amount: 62,
  open: 64,
  high: 64,
  low: 64,
  prevClose: 64,
};

const ROW_H = 44;

function sortItems(items: Instrument[], key: SortKey, dir: 'asc' | 'desc', quotes: Record<string, Quote>): Instrument[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === 'symbol') return mul * a.symbol.localeCompare(b.symbol, 'zh-Hans-CN');
    if (key === 'name') return mul * a.name.localeCompare(b.name, 'zh-Hans-CN');
    const va = quotes[a.id]?.[QUOTE_FIELD[key]] as number | undefined;
    const vb = quotes[b.id]?.[QUOTE_FIELD[key]] as number | undefined;
    const na = Number.isFinite(va) ? (va as number) : -Infinity;
    const nb = Number.isFinite(vb) ? (vb as number) : -Infinity;
    return mul * (na - nb);
  });
}

/** 自选股面板：TradingView 右侧停靠面板的对齐实现 */
export function WatchlistPanel() {
  const lists = useWatchlistStore((s) => s.lists);
  const activeListId = useWatchlistStore((s) => s.activeListId);
  const activeId = useWatchlistStore((s) => s.activeId);
  const flagged = useWatchlistStore((s) => s.flagged);
  const columns = useWatchlistStore((s) => s.columns);
  const sort = useWatchlistStore((s) => s.sort);
  const quotes = useQuoteStore((s) => s.quotes);
  const quoteError = useQuoteStore((s) => s.lastError);
  const openSearch = useSymbolSearchStore((s) => s.openSearch);

  const { setActive, remove, toggleFlag, reorder, switchList, createList, duplicateList, deleteList, toggleColumn, cycleSort } =
    useWatchlistStore.getState();

  const list = lists.find((l) => l.id === activeListId) ?? lists[0];
  const items = list?.items ?? [];

  const [flagFilter, setFlagFilter] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; inst: Instrument } | null>(null);

  const visible = useMemo(() => {
    const base = flagFilter ? items.filter((i) => flagged.includes(i.id)) : items;
    if (sort.dir === 'manual') return base;
    return sortItems(base, sort.key, sort.dir, quotes);
  }, [items, flagFilter, flagged, sort, quotes]);

  // 排序或筛选状态下拖拽会打乱可见顺序与存储顺序的对应关系，禁用
  const draggable = sort.dir === 'manual' && !flagFilter;

  const exportCsv = () => {
    const header = ['代码', '名称', '市场', '交易所', ...columns.map((c) => COLUMNS.find((x) => x.id === c)?.label ?? c)];
    const lines = items.map((i) => {
      const q = quotes[i.id];
      const cells = columns.map((c) => (q ? String(q[QUOTE_FIELD[c]]) : ''));
      return [i.symbol, i.name, MARKETS[i.market].label, i.exchange, ...cells]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    const blob = new Blob([`\ufeff${[header.join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${list?.name ?? 'watchlist'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ---------- 头部：列表选择器 + 添加 + 标记筛选 + 设置 ---------- */}
      <div style={headerStyle}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="tv-icon-btn" style={{ ...listTriggerStyle, color: 'var(--text)' }} aria-label="切换自选股列表">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list?.name}</span>
              <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} style={menuStyle}>
              {lists.map((l) => (
                <DropdownMenu.Item key={l.id} className="tv-menu-item" style={menuItemStyle} onSelect={() => switchList(l.id)}>
                  <span style={leadingIconSlot}>{l.id === activeListId ? <Check size={13} /> : null}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <span style={{ color: 'var(--text-faint)', fontSize: fontSize.xs }}>{l.items.length}</span>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator style={sepStyle} />
              <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={() => createList()}>
                <span style={leadingIconSlot}>
                  <Plus size={13} />
                </span>
                新建列表
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <span style={{ flex: 1 }} />

        <HeaderButton label="添加品种" onClick={() => openSearch('add')}>
          <Plus size={15} />
        </HeaderButton>
        <HeaderButton label={flagFilter ? '显示全部品种' : '只看标记品种'} active={flagFilter} onClick={() => setFlagFilter((v) => !v)}>
          <Flag size={14} />
        </HeaderButton>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="tv-icon-btn" style={iconBtnStyle} aria-label="列表设置">
              <Settings2 size={15} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} style={menuStyle}>
              <DropdownMenu.Label style={menuLabelStyle}>显示列</DropdownMenu.Label>
              {COLUMNS.map((c) => (
                <DropdownMenu.CheckboxItem
                  key={c.id}
                  className="tv-menu-item"
                  style={menuItemStyle}
                  checked={columns.includes(c.id)}
                  // 勾选列不应关闭菜单，否则没法连续开多列
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleColumn(c.id)}
                >
                  <span style={leadingIconSlot}>{columns.includes(c.id) ? <Check size={13} /> : null}</span>
                  {c.label}
                </DropdownMenu.CheckboxItem>
              ))}
              <DropdownMenu.Separator style={sepStyle} />
              <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={() => setRenaming(true)}>
                <span style={leadingIconSlot}>
                  <Pencil size={13} />
                </span>
                重命名列表
              </DropdownMenu.Item>
              <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={() => duplicateList(activeListId)}>
                <span style={leadingIconSlot}>
                  <Copy size={13} />
                </span>
                复制列表
              </DropdownMenu.Item>
              <DropdownMenu.Item className="tv-menu-item" style={menuItemStyle} onSelect={exportCsv}>
                <span style={leadingIconSlot}>
                  <Download size={13} />
                </span>
                导出 CSV
              </DropdownMenu.Item>
              {lists.length > 1 && (
                <>
                  <DropdownMenu.Separator style={sepStyle} />
                  <DropdownMenu.Item className="tv-menu-item" style={{ ...menuItemStyle, color: 'var(--down)' }} onSelect={() => deleteList(activeListId)}>
                    <span style={leadingIconSlot}>
                      <X size={13} />
                    </span>
                    删除列表
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {quoteError && (
        <div style={{ padding: `${space.xs}px ${space.md}px`, fontSize: fontSize.sm, color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {quoteError}
        </div>
      )}

      {/* ---------- 行：列太多时整体横向滚动，绝不把代码列挤没 ---------- */}
      <div className="tv-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {visible.length === 0 ? (
          <div style={{ padding: `${space.xl}px ${space.lg}px`, textAlign: 'center', color: 'var(--text-faint)', fontSize: fontSize.md, lineHeight: 1.8 }}>
            {items.length === 0 ? (
              <>
                列表是空的
                <br />
                <button onClick={() => openSearch('add')} style={linkBtnStyle}>
                  添加品种
                </button>
                开始跟踪行情
              </>
            ) : (
              '没有已标记的品种'
            )}
          </div>
        ) : (
          <div style={{ width: 'max-content', minWidth: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 列头：横向随内容滚动，纵向吸顶 */}
            <div style={{ ...columnHeaderStyle, position: 'sticky', top: 0, zIndex: 1, background: 'var(--panel)' }}>
              <SortLabel label="代码" sortKey="symbol" sort={sort} onSort={() => cycleSort('symbol')} flex />
              {columns.map((c) => (
                <SortLabel
                  key={c}
                  label={COLUMNS.find((x) => x.id === c)?.label ?? c}
                  sortKey={c}
                  sort={sort}
                  onSort={() => cycleSort(c)}
                  width={COLUMN_WIDTH[c]}
                />
              ))}
              <span style={{ width: 18, flexShrink: 0 }} />
            </div>

            {visible.map((inst) => {
              const manualIndex = items.findIndex((i) => i.id === inst.id);
              return (
                <WatchlistRow
                  key={inst.id}
                  instrument={inst}
                  quote={quotes[inst.id]}
                  columns={columns}
                  isActive={inst.id === activeId}
                  isFlagged={flagged.includes(inst.id)}
                  draggable={draggable}
                  dropBefore={dropIndex === manualIndex && dragIndex !== manualIndex}
                  onDragStart={() => setDragIndex(manualIndex)}
                  onDragOver={() => setDropIndex(manualIndex)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== manualIndex) reorder(dragIndex, manualIndex);
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  onSelect={() => setActive(inst)}
                  onRemove={() => remove(inst.id, activeListId)}
                  onContextMenu={(x, y) => setMenu({ x, y, inst })}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 行右键菜单：触发器是光标处的 1px 占位元素，菜单就地弹出 */}
      <DropdownMenu.Root open={menu !== null} onOpenChange={(open) => !open && setMenu(null)}>
        <DropdownMenu.Trigger asChild>
          <span
            aria-hidden
            style={{ position: 'fixed', left: menu?.x ?? 0, top: menu?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={2} style={menuStyle}>
            <DropdownMenu.Label style={menuLabelStyle}>{menu?.inst.name}</DropdownMenu.Label>
            <DropdownMenu.Item
              className="tv-menu-item" style={menuItemStyle}
              onSelect={() => {
                if (menu) setActive(menu.inst);
              }}
            >
              <span style={leadingIconSlot}>
                <LineChart size={13} />
              </span>
              在图表中打开
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item" style={menuItemStyle}
              onSelect={() => {
                if (menu) toggleFlag(menu.inst.id);
              }}
            >
              <span style={leadingIconSlot}>
                <Flag size={13} />
              </span>
              {menu && flagged.includes(menu.inst.id) ? '取消标记' : '标记'}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item" style={{ ...menuItemStyle, color: 'var(--down)' }}
              onSelect={() => {
                if (menu) remove(menu.inst.id, activeListId);
              }}
            >
              <span style={leadingIconSlot}>
                <X size={13} />
              </span>
              从列表移除
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {renaming && list && <RenameListDialog listId={list.id} initialName={list.name} onClose={() => setRenaming(false)} />}
    </div>
  );
}

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

function WatchlistRow({
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
      {isActive && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--accent)' }} />}

      <div style={{ flex: 1, minWidth: 108, display: 'flex', alignItems: 'center', gap: 5 }}>
        {isFlagged && <Flag size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} aria-label="已标记" />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: fontSize.lg, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {instrument.symbol}
          </div>
          <div style={{ fontSize: fontSize.sm, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {instrument.name} · {instrument.exchange}
          </div>
        </div>
      </div>

      {columns.map((col) => (
        <Cell key={col} col={col} quote={quote} decimals={decimals} />
      ))}

      <span style={{ width: 18, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
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
          <X size={13} />
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
            borderRadius: 3,
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

function SortLabel({
  label,
  sortKey,
  sort,
  onSort,
  width,
  flex,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' | 'manual' };
  onSort: () => void;
  width?: number;
  flex?: boolean;
}) {
  const active = sort.key === sortKey && sort.dir !== 'manual';
  return (
    <button
      onClick={onSort}
      title={`按${label}排序（升序 → 降序 → 手动排列）`}
      style={{
        ...(flex ? { flex: 1, minWidth: 0 } : { width, flexShrink: 0 }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: flex ? 'flex-start' : 'flex-end',
        gap: 3,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontSize: fontSize.sm,
        color: active ? 'var(--text)' : 'var(--text-faint)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {active && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );
}

function HeaderButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label} aria-pressed={active} className="tv-icon-btn" data-active={active} style={iconBtnStyle}>
      {children}
    </button>
  );
}

// ---------- 样式 ----------

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: control.hLg + 4,
  padding: `0 ${space.xs}px 0 ${space.sm}px`,
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const columnHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 24,
  padding: `0 ${space.xs}px 0 ${space.md}px`,
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const listTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  maxWidth: 140,
  height: control.h,
  padding: `0 ${space.xs}px`,
  border: 'none',
  borderRadius: 4,
  fontSize: fontSize.lg,
  fontWeight: 600,
  cursor: 'pointer',
};

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  cursor: 'pointer',
  fontSize: fontSize.md,
  padding: 0,
  textDecoration: 'underline',
};

const menuStyle: React.CSSProperties = {
  minWidth: 180,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '4px 0',
  zIndex: zIndex.dropdown,
  boxShadow: shadow.menu,
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: '5px 8px',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
  outline: 'none',
};

const menuLabelStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

const leadingIconSlot: React.CSSProperties = { width: 14, flexShrink: 0, display: 'flex', alignItems: 'center' };

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: `${space.xs}px 0`,
};
