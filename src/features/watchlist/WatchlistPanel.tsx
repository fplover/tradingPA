import { useMemo, useState } from 'react';
import { Flag, Plus } from 'lucide-react';
import type { Instrument } from '@/types/instrument';
import { MARKETS } from '@/types/instrument';
import type { Quote } from '@/data/sources/types';
import { COLUMNS, useWatchlistStore, type SortKey } from '@/store/watchlistStore';
import { useQuoteStore } from '@/store/quoteStore';
import { useSymbolSearchStore } from './searchStore';
import { RenameListDialog } from './RenameListDialog';
import { ColumnHeader } from './WatchlistColumnHeader';
import { WatchlistListMenu } from './WatchlistListMenu';
import { WatchlistRow } from './WatchlistRow';
import { WatchlistRowMenu, type WatchlistRowMenuState } from './WatchlistRowMenu';
import { WatchlistSettingsMenu } from './WatchlistSettingsMenu';
import { QUOTE_FIELD, iconBtnStyle } from './watchlistShared';
import { control, fontSize, icon, space } from '@/ui/tokens';

function sortItems(
  items: Instrument[],
  key: SortKey,
  dir: 'asc' | 'desc',
  quotes: Record<string, Quote>,
): Instrument[] {
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

  const {
    setActive,
    remove,
    toggleFlag,
    reorder,
    switchList,
    createList,
    duplicateList,
    deleteList,
    toggleColumn,
    cycleSort,
  } = useWatchlistStore.getState();

  const list = lists.find((l) => l.id === activeListId) ?? lists[0];
  const items = list?.items ?? [];

  const [flagFilter, setFlagFilter] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<WatchlistRowMenuState | null>(null);

  const visible = useMemo(() => {
    const base = flagFilter ? items.filter((i) => flagged.includes(i.id)) : items;
    if (sort.dir === 'manual') return base;
    return sortItems(base, sort.key, sort.dir, quotes);
  }, [items, flagFilter, flagged, sort, quotes]);

  // 排序或筛选状态下拖拽会打乱可见顺序与存储顺序的对应关系，禁用
  const draggable = sort.dir === 'manual' && !flagFilter;

  const exportCsv = () => {
    const header = [
      '代码',
      '名称',
      '市场',
      '交易所',
      ...columns.map((c) => COLUMNS.find((x) => x.id === c)?.label ?? c),
    ];
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
        <WatchlistListMenu
          lists={lists}
          activeListId={activeListId}
          activeName={list?.name}
          onSwitch={switchList}
          onCreate={() => createList()}
        />

        <span style={{ flex: 1 }} />

        <HeaderButton label="添加品种" onClick={() => openSearch('add')}>
          <Plus size={icon.lg} />
        </HeaderButton>
        <HeaderButton
          label={flagFilter ? '显示全部品种' : '只看标记品种'}
          active={flagFilter}
          onClick={() => setFlagFilter((v) => !v)}
        >
          <Flag size={icon.md} />
        </HeaderButton>

        <WatchlistSettingsMenu
          columns={columns}
          canDelete={lists.length > 1}
          onToggleColumn={toggleColumn}
          onRename={() => setRenaming(true)}
          onDuplicate={() => duplicateList(activeListId)}
          onExport={exportCsv}
          onDelete={() => deleteList(activeListId)}
        />
      </div>

      {quoteError && (
        <div
          style={{
            padding: `${space.xs}px ${space.md}px`,
            fontSize: fontSize.sm,
            color: 'var(--text-faint)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          {quoteError}
        </div>
      )}

      {/* ---------- 行：列太多时整体横向滚动，绝不把代码列挤没 ---------- */}
      <div className="tv-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {visible.length === 0 ? (
          <div
            style={{
              padding: `${space.xl}px ${space.lg}px`,
              textAlign: 'center',
              color: 'var(--text-faint)',
              fontSize: fontSize.md,
              lineHeight: 1.8,
            }}
          >
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
            <ColumnHeader columns={columns} sort={sort} onCycleSort={cycleSort} />

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

      <WatchlistRowMenu
        state={menu}
        isFlagged={menu !== null && flagged.includes(menu.inst.id)}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
        onOpenInChart={setActive}
        onToggleFlag={toggleFlag}
        onRemove={(id) => remove(id, activeListId)}
      />

      {renaming && list && (
        <RenameListDialog listId={list.id} initialName={list.name} onClose={() => setRenaming(false)} />
      )}
    </div>
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
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="tv-icon-btn"
      data-active={active}
      style={iconBtnStyle}
    >
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

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  cursor: 'pointer',
  fontSize: fontSize.md,
  padding: 0,
  textDecoration: 'underline',
};
