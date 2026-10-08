import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LoaderCircle, Search, Star, X } from 'lucide-react';
import type { SearchHit } from '@/data/sources/types';
import { dataRegistry } from '@/data/sources/registry';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useSymbolSearchStore } from './searchStore';
import { TABS, buildResultSections, filterByTab, type ResultSection } from './symbolSearchFilter';
import { ResultRow, Kbd } from './SymbolSearchRows';
import {
  clearBtnStyle,
  contentStyle,
  emptyStyle,
  footerStyle,
  inputRowStyle,
  inputStyle,
  listStyle,
  overlayStyle,
  sectionLabelStyle,
  tabRowStyle,
  tabStyle,
} from './symbolSearchStyles';
import { fontSize, icon } from '@/ui/tokens';

const DEBOUNCE_MS = 250;
const RESULT_MAX = 40;

/** 品种搜索弹窗：TradingView 的顶部锚定样式，不是垂直居中的普通模态 */
export function SymbolSearchDialog() {
  const open = useSymbolSearchStore((s) => s.open);
  const mode = useSymbolSearchStore((s) => s.mode);
  const initialQuery = useSymbolSearchStore((s) => s.initialQuery);
  const close = useSymbolSearchStore((s) => s.close);
  const recent = useWatchlistStore((s) => s.recent);
  const flagged = useWatchlistStore((s) => s.flagged);
  const lists = useWatchlistStore((s) => s.lists);
  const { setActive, add, activeListId } = useWatchlistStore.getState();

  const [query, setQuery] = useState('');
  const [tabId, setTabId] = useState('all');
  const [hits, setHits] = useState<SearchHit[]>([]);
  /** 进行中的查询词（防抖等待 + 网络在途），null = 空闲。由输入 / 开屏事件维护，
   *  loading 渲染期派生——避免在 effect 里同步 setState 触发级联渲染 */
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** 请求序号：只接受最后一次查询的结果，避免慢响应覆盖新结果 */
  const reqId = useRef(0);

  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  // 每次打开重置，避免上次的查询残留；字母键直开时预填触发字母（initialQuery 只随
  // open false→true 一并变化：快捷键对对话框内输入/role=dialog 区域有 early-return 守卫）
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setQuery(initialQuery);
      setHits([]);
      setSelected(0);
      setPending(initialQuery.trim() || null);
    }
  }

  // 开屏：作废上一次会话遗留的慢响应（序号前移，落后结果不会覆盖新会话）并把焦点交给
  // 输入框。reqId 写入与 focus 是命令式副作用，留 effect（渲染期写 ref 会触发 react(refs)）
  useEffect(() => {
    if (!open) return;
    reqId.current += 1;
    inputRef.current?.focus();
  }, [open]);

  // 防抖搜索：与外部数据源的同步 effect——同步阶段零 setState（loading 由 pending 派生，
  //  空查询的清空在输入事件侧完成），异步回调里按请求序号只接受最后一次结果
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) return;
    const id = ++reqId.current;
    const timer = window.setTimeout(() => {
      dataRegistry
        .search(q, tab.asset)
        .then((result) => {
          if (id !== reqId.current) return;
          setHits(filterByTab(result, tab).slice(0, RESULT_MAX));
          setSelected(0);
          setPending(null);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setHits([]);
          setPending(null);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, open, tab]);

  const showingRecent = query.trim() === '';
  const loading = pending !== null;
  // 行序列切换（换 tab / 查询模式翻转）时选中回落首行：渲染期按 prev 值调整状态，
  // 对应原 [tabId, showingRecent] effect 的 setSelected(0)。原实现的 rowRefs.current = []
  // 一并移除——行 ref 是内联回调，每次渲染都会随新闭包重写、行卸载时 React 也会置 null，
  // 显式清空只会让 ref 缓存滞后一次渲染
  const [lastTabId, setLastTabId] = useState(tabId);
  if (tabId !== lastTabId) {
    setLastTabId(tabId);
    setSelected(0);
  }
  const [lastShowingRecent, setLastShowingRecent] = useState(showingRecent);
  if (showingRecent !== lastShowingRecent) {
    setLastShowingRecent(showingRecent);
    setSelected(0);
  }
  // 分组行：空查询 = 收藏置顶 + 最近访问；有查询 = 搜索结果。展平后的 rows 是键盘
  // 导航（↑/↓/Enter）的唯一行序列，分组标题不占行索引（rowLabels 与 rows 对齐）。
  const sections: ResultSection[] = useMemo(
    () => buildResultSections(showingRecent, hits, recent, flagged, lists, tab),
    [showingRecent, hits, recent, flagged, lists, tab],
  );
  const rows: SearchHit[] = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  /** 每个行索引上方的分组标题（null = 无标题；搜索结果分组整段无标题） */
  const rowLabels = useMemo(() => sections.flatMap((s) => [s.label, ...s.items.map(() => null)]), [sections]);

  const choose = (hit: SearchHit | undefined) => {
    if (!hit) return;
    if (mode === 'add') add(hit.instrument, activeListId);
    else setActive(hit.instrument);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length === 0) return;
      const next = e.key === 'ArrowDown' ? (selected + 1) % rows.length : (selected - 1 + rows.length) % rows.length;
      setSelected(next);
      rowRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(rows[selected]);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} aria-describedby={undefined} onKeyDown={onKeyDown}>
          <Dialog.Title
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
          >
            搜索品种
          </Dialog.Title>

          {/* 搜索输入 */}
          <div style={inputRowStyle}>
            <Search size={icon.lg} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                // 查询词变化即事件侧维护 pending / 清空：空查询立刻收起结果，
                // 非空查询进入防抖（loading 由 pending 派生）
                const t = v.trim();
                setPending(t || null);
                if (!t) setHits([]);
              }}
              placeholder="搜索"
              aria-label="搜索品种"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            {loading && (
              <LoaderCircle size={icon.lg} className="spin" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            )}
            {query && !loading && (
              <button
                onClick={() => {
                  setQuery('');
                  setPending(null);
                  setHits([]);
                }}
                aria-label="清空搜索"
                style={clearBtnStyle}
              >
                <X size={icon.lg} />
              </button>
            )}
          </div>

          {/* 市场分类 */}
          <div className="tv-scroll" style={tabRowStyle}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTabId(t.id)}
                aria-pressed={t.id === tabId}
                style={{
                  ...tabStyle,
                  color: t.id === tabId ? 'var(--text)' : 'var(--text-faint)',
                  boxShadow: t.id === tabId ? 'inset 0 -2px 0 var(--accent)' : undefined,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 结果：高度随结果数生长并封顶，避免弹窗在输入时反复跳尺寸 */}
          <div
            className="tv-scroll"
            style={{ ...listStyle, height: Math.min(420, Math.max(150, rows.length * 46 + 16)) }}
            role="listbox"
            aria-label="搜索结果"
          >
            {rows.map((hit, i) => (
              <Fragment key={hit.instrument.id}>
                {rowLabels[i] && (
                  <div style={sectionLabelStyle}>
                    {rowLabels[i] === '收藏' && <Star size={icon.sm} style={{ marginRight: 3, verticalAlign: -2 }} />}
                    {rowLabels[i]}
                  </div>
                )}
                <ResultRow
                  hit={hit}
                  query={showingRecent ? '' : query.trim()}
                  selected={i === selected}
                  addMode={mode === 'add'}
                  rowRef={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  onHover={() => setSelected(i)}
                  onChoose={() => choose(hit)}
                />
              </Fragment>
            ))}

            {!showingRecent && !loading && rows.length === 0 && (
              <div style={emptyStyle}>
                未找到 “{query.trim()}” 相关品种
                <br />
                <span style={{ fontSize: fontSize.sm }}>试试代码、名称或拼音首字母，如 600519 / 茅台 / gzmt</span>
              </div>
            )}
            {showingRecent && rows.length === 0 && (
              <div style={emptyStyle}>
                输入代码或名称开始搜索
                <br />
                <span style={{ fontSize: fontSize.sm }}>支持 A股、港股、美股、国内外期货与指数</span>
              </div>
            )}
          </div>

          <div style={footerStyle}>
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> 选择
            </span>
            <span>
              <Kbd>Enter</Kbd> {mode === 'add' ? '加入自选股' : '在图表中打开'}
            </span>
            <span>
              <Kbd>Esc</Kbd> 关闭
            </span>
            {rows.length > 0 && <span style={{ marginLeft: 'auto' }}>{rows.length} 个结果</span>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
