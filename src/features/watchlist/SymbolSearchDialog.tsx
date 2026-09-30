import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LoaderCircle, Search, Star, X } from 'lucide-react';
import type { AssetClass, Instrument, MarketId } from '@/types/instrument';
import { MARKETS } from '@/types/instrument';
import type { SearchHit } from '@/data/sources/types';
import { dataRegistry } from '@/data/sources/registry';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useSymbolSearchStore } from './searchStore';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

/** 顶部分类。按市场而非纯资产类别切分，A股/美股/国内外期货才能各自成组。 */
interface TabDef {
  id: string;
  label: string;
  /** 传给搜索接口的资产类别，用于让期货走合约全集 */
  asset?: AssetClass;
  markets?: MarketId[];
}

const TABS: TabDef[] = [
  { id: 'all', label: '全部' },
  { id: 'cn', label: 'A股', markets: ['cn-sh', 'cn-sz', 'cn-bj'] },
  { id: 'hk', label: '港股', markets: ['hk'] },
  { id: 'us', label: '美股', markets: ['us-nasdaq', 'us-nyse', 'us-amex'] },
  { id: 'cnfut', label: '国内期货', asset: 'futures', markets: ['cn-fut'] },
  { id: 'globalfut', label: '外盘期货', asset: 'futures', markets: ['global-fut'] },
  { id: 'index', label: '指数', asset: 'index', markets: ['cn-index'] },
  { id: 'crypto', label: '加密', asset: 'crypto', markets: ['crypto'] },
];

const DEBOUNCE_MS = 250;
const RESULT_MAX = 40;

/** 结果分组：label = 分组标题（null = 搜索结果无分组）；items 展平后即键盘导航的行序列 */
interface ResultSection {
  label: string | null;
  items: SearchHit[];
}

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
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** 请求序号：只接受最后一次查询的结果，避免慢响应覆盖新结果 */
  const reqId = useRef(0);

  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  // 每次打开重置，避免上次的查询残留；字母键直开时预填触发字母；并把焦点交给输入框
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setHits([]);
    setSelected(0);
    reqId.current += 1;
    inputRef.current?.focus();
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      dataRegistry
        .search(q, tab.asset)
        .then((result) => {
          if (id !== reqId.current) return;
          setHits(filterByTab(result, tab).slice(0, RESULT_MAX));
          setSelected(0);
          setLoading(false);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setHits([]);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, tabId, open, tab.asset]);

  const showingRecent = query.trim() === '';
  // 分组行：空查询 = 收藏置顶 + 最近访问；有查询 = 搜索结果。展平后的 rows 是键盘
  // 导航（↑/↓/Enter）的唯一行序列，分组标题不占行索引（rowLabels 与 rows 对齐）。
  const sections: ResultSection[] = useMemo(() => {
    if (!showingRecent) return hits.length > 0 ? [{ label: null, items: hits }] : [];
    const inTab = (i: Instrument) => (!tab.markets || tab.markets.includes(i.market)) && (!tab.asset || i.asset === tab.asset);
    // 收藏（flagged 存 id）：经全部列表 + 最近访问解析回品种；被移除的 id 静默跳过
    const byId = new Map<string, Instrument>();
    for (const l of lists) for (const i of l.items) byId.set(i.id, i);
    for (const i of recent) byId.set(i.id, i);
    const fav = flagged.map((id) => byId.get(id)).filter((i): i is Instrument => !!i).filter(inTab);
    const favIds = new Set(fav.map((i) => i.id));
    // 最近访问剔除已在收藏分组的品种，避免同一行在两个分组重复出现
    const rec = recent.filter(inTab).filter((i) => !favIds.has(i.id));
    const out: ResultSection[] = [];
    if (fav.length > 0) out.push({ label: '收藏', items: fav.map((i): SearchHit => ({ instrument: i, source: '收藏' })) });
    if (rec.length > 0) out.push({ label: '最近访问', items: rec.map((i): SearchHit => ({ instrument: i, source: '最近访问' })) });
    return out;
  }, [showingRecent, hits, recent, flagged, lists, tab]);
  const rows: SearchHit[] = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  /** 每个行索引上方的分组标题（null = 无标题；搜索结果分组整段无标题） */
  const rowLabels = useMemo(() => sections.flatMap((s) => [s.label, ...s.items.map(() => null)]), [sections]);

  useEffect(() => {
    setSelected(0);
    rowRefs.current = [];
  }, [tabId, showingRecent]);

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
          <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            搜索品种
          </Dialog.Title>

          {/* 搜索输入 */}
          <div style={inputRowStyle}>
            <Search size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索"
              aria-label="搜索品种"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            {loading && <LoaderCircle size={16} className="spin" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
            {query && !loading && (
              <button onClick={() => setQuery('')} aria-label="清空搜索" style={clearBtnStyle}>
                <X size={16} />
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
                    {rowLabels[i] === '收藏' && <Star size={12} style={{ marginRight: 3, verticalAlign: -2 }} />}
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

function filterByTab(hits: SearchHit[], tab: TabDef): SearchHit[] {
  return hits.filter((h) => {
    if (tab.markets && !tab.markets.includes(h.instrument.market)) return false;
    if (tab.asset && h.instrument.asset !== tab.asset) return false;
    return true;
  });
}

interface ResultRowProps {
  hit: SearchHit;
  query: string;
  selected: boolean;
  addMode: boolean;
  onHover: () => void;
  onChoose: () => void;
  /** React 18 函数组件不能直接收 ref，用具名 prop 传回调 */
  rowRef: (el: HTMLDivElement | null) => void;
}

function ResultRow({ hit, query, selected, addMode, onHover, onChoose, rowRef }: ResultRowProps) {
  const inst = hit.instrument;
  const market = MARKETS[inst.market];
  return (
    <div
      ref={rowRef}
      role="option"
      aria-selected={selected}
      onClick={onChoose}
      onMouseEnter={onHover}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        minHeight: 46,
        padding: `6px ${space.md}px`,
        cursor: 'pointer',
        background: selected ? 'var(--panel-2)' : 'transparent',
      }}
    >
      {selected && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--accent)' }} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Highlight text={inst.symbol} query={query} />
        </div>
        <div style={{ fontSize: fontSize.sm, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Highlight text={inst.name} query={query} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexShrink: 0 }}>
        {market.label !== inst.exchange && <span style={{ fontSize: fontSize.sm, color: 'var(--text-faint)' }}>{inst.exchange}</span>}
        <span style={badgeStyle}>{market.label}</span>
      </div>

      <span style={{ width: 20, textAlign: 'center', color: 'var(--accent)', fontSize: 16, flexShrink: 0 }}>{addMode ? '+' : ''}</span>
    </div>
  );
}

/** 命中片段高亮：让扫读时能立刻定位匹配的是代码还是名称 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const at = lower.indexOf(query.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ color: 'var(--accent)' }}>{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-block',
        minWidth: 17,
        padding: '0 4px',
        marginRight: 3,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        borderRadius: 3,
        fontSize: fontSize.xs,
        lineHeight: '16px',
        textAlign: 'center',
        color: 'var(--text-dim)',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </kbd>
  );
}

// ---------- 样式 ----------

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay)',
  zIndex: zIndex.modal,
};

/** 顶部锚定而非垂直居中：结果向下生长，视线不用来回跳 */
const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: 72,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(820px, 92vw)',
  maxHeight: 'min(620px, calc(100vh - 120px))',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.lg,
  boxShadow: shadow.modal,
  zIndex: zIndex.modal,
  overflow: 'hidden',
  outline: 'none',
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.md,
  height: 56,
  padding: `0 ${space.md}px`,
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
  fontSize: 19,
  fontWeight: 400,
};

const clearBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'var(--text-faint)',
  cursor: 'pointer',
  flexShrink: 0,
};

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 2,
  padding: `0 ${space.sm}px`,
  borderBottom: '1px solid var(--border)',
  overflowX: 'auto',
  flexShrink: 0,
};

const tabStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: `0 ${space.md}px`,
  height: 36,
  fontSize: fontSize.md,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const listStyle: React.CSSProperties = {
  overflowY: 'auto',
  padding: `${space.xs}px 0`,
};

const sectionLabelStyle: React.CSSProperties = {
  padding: `${space.xs}px ${space.md}px`,
  fontSize: fontSize.sm,
  color: 'var(--text-faint)',
};

const emptyStyle: React.CSSProperties = {
  padding: `${space.xl}px ${space.md}px`,
  textAlign: 'center',
  color: 'var(--text-faint)',
  fontSize: fontSize.md,
  lineHeight: 1.9,
};

const badgeStyle: React.CSSProperties = {
  padding: '1px 6px',
  borderRadius: 3,
  background: 'var(--panel-2)',
  color: 'var(--text-faint)',
  fontSize: fontSize.xs,
  whiteSpace: 'nowrap',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.lg,
  height: 30,
  padding: `0 ${space.md}px`,
  borderTop: '1px solid var(--border)',
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  flexShrink: 0,
};
