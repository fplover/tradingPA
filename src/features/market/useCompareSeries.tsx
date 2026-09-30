import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bar, TimeframeId } from '@/types/market';
import type { Instrument } from '@/types/instrument';
import type { SearchHit } from '@/data/sources/types';
import { dataRegistry } from '@/data/sources/registry';
import { klineCache } from '@/data/cache/klineCache';
import { useChartConfigStore } from '@/store/chartConfigStore';
import type { CompareLegendInfo } from '@/engine/renderer/legendTypes';
import { Modal } from '@/ui/primitives';
import { fontSize, radius, space } from '@/ui/tokens';

/**
 * 对比序列数据层（P2-D①，AC-D1）：
 * - useCompareSeries：按对比品种独立订阅历史（走 dataRegistry 既有路由，不依赖主
 *   series 的 WS 通道；一次性拉取 + 30s 轮询刷新末柱——轮询语义：刷新间隔内的
 *   实时跳动不追踪，末端短缺由下次轮询愈合，与主序列 WS 推送级实时有差距）。
 *   主图左缘懒加载时经 loadMore 同步向左翻页（dataRegistry.barsBefore），合并
 *   去重保持升序，alignByTime 随主序列增长重新对齐、断线愈合；源不支持翻页
 *   （连续两次空页）时停止请求、保持断线且静默，不报错刷 UI。
 * - createCompareFeed：上述编排的纯 TS 内核（自钩子拆出，node 环境可单测）：
 *   三重守卫——无对比零开销（不起定时器不发请求）/ dispose 即停（卸载、换品种、
 *   换周期）/ 迟到响应按实例作废；翻页另带 inflight 与无更多守卫。
 * - alignByTime / buildCompareLegend：对齐与图例数据组装纯函数（单测金样）。
 * - CompareSymbolPicker：顶栏 Compare 按钮弹出的品种选择浮层（与 SymbolSearchDialog
 *   同款 debounce 直搜 dataRegistry；searchStore 无 compare 模式且不在本批次白名单，
 *   选择态在本组件内自持，命中即写 chartConfigStore.compareSymbol）。
 *
 * 文件为 .tsx：CompareSymbolPicker 是 React 组件（JSX），.ts 无法编译；
 * 模块导入路径 '@/features/market/useCompareSeries' 不变。
 */

const COMPARE_LIMIT = 500;
const COMPARE_POLL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MAX = 20;

export interface CompareSeries {
  status: 'idle' | 'loading' | 'live' | 'error';
  /** 与主 series 按 time 对齐的收盘价（index = 主 bar index；null = 无对应 bar） */
  aligned: Array<number | null>;
  /** 主图左缘懒加载联动：对比序列同步向左翻页补齐更早数据（无对比时零开销空转） */
  loadMore: () => void;
}

/** 按 time 对齐：主 series 每根 bar 取同时间戳的对比收盘价（精确匹配，缺失给 null 断线） */
export function alignByTime(mainBars: readonly Bar[], compareBars: readonly Bar[]): Array<number | null> {
  const byTime = new Map<number, number>();
  for (const b of compareBars) byTime.set(b.time, b.close);
  return mainBars.map((b) => byTime.get(b.time) ?? null);
}

/** 图例第二行数据组装：基准 = 首个有效对比收盘（首根），末点读数 = 最后一个有效值相对基准的涨跌幅 */
export function buildCompareLegend(symbol: string, aligned: ReadonlyArray<number | null>): CompareLegendInfo | null {
  let base: number | null = null;
  let last: number | null = null;
  for (const v of aligned) {
    if (v === null || !Number.isFinite(v) || v <= 0) continue;
    if (base === null) base = v;
    last = v;
  }
  if (base === null || last === null) return null;
  return { symbol, base, lastPct: (last / base - 1) * 100, aligned };
}

/** 对比序列编排内核（纯 TS，node 环境可单测）：一次性拉取 + 30s 轮询刷新末柱 +
 *  左翻页补齐更早历史。翻页语义与 useChartSeries.loadMore 对齐：barsBefore 取当前
 *  首柱（不含）之前的更早数据，klineCache.merge 合并去重保持升序（同时戳以旧页
 *  为准）；轮询同为合并语义——刷新末柱窗口的同时保住左翻页补齐的更早柱。 */
export function createCompareFeed(
  instrument: Instrument | null,
  timeframe: TimeframeId,
  on: { onBars: (bars: Bar[]) => void; onStatus: (status: CompareSeries['status']) => void },
  /** 主序列首柱时间提供者（null = 主序列尚无数据）：对比首柱已严格早于它时左缘无缺口 */
  mainFirstTime: () => number | null,
): { start(): void; loadMore(): void; dispose(): void } {
  let disposed = false;
  let bars: Bar[] = [];
  let paging = false, noMore = false, pageFails = 0, retryAt = 0, ready = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** 翻页空页/失败：3s 退避，连续两次判定源无更多（单次抖动仍重试） */
  const fail = () => {
    pageFails += 1;
    retryAt = Date.now() + 3000;
    if (pageFails >= 2) noMore = true;
  };

  const load = () => {
    if (!instrument || disposed) return;
    dataRegistry
      .bars(instrument, timeframe, COMPARE_LIMIT)
      .then((fresh) => {
        if (disposed) return;
        if (fresh.length === 0) {
          on.onStatus('error');
          return;
        }
        ready = true;
        bars = klineCache.merge(bars, fresh);
        on.onBars(bars);
        on.onStatus('live');
      })
      .catch(() => {
        if (!disposed) on.onStatus('error');
      });
  };

  return {
    start() {
      if (!instrument) {
        on.onBars([]);
        on.onStatus('idle');
        return;
      }
      on.onBars([]); // 换品种/周期：先清空，避免轮询合并把两个品种的柱并在一起
      on.onStatus('loading');
      load();
      // 轮询刷新：对比序列不建 WS 通道（通道归主 series 所有），按固定间隔重拉对齐末柱
      timer = setInterval(load, COMPARE_POLL_MS);
    },
    loadMore() {
      if (!instrument || paging || noMore || bars.length === 0) return;
      const mainFirst = mainFirstTime(); // null = 主序列尚无数据，无从对齐
      if (mainFirst === null || bars[0].time < mainFirst) return; // 左缘无缺口：补齐即止
      if (Date.now() < retryAt) return;
      if (!ready) return; // 首批历史在途时不翻页：避免把上个品种的数据混进新品种
      paging = true;
      dataRegistry
        .barsBefore(instrument, timeframe, bars[0].time, COMPARE_LIMIT)
        .then((older) => {
          if (disposed) return;
          if (older.length === 0) {
            fail();
            return;
          }
          pageFails = 0;
          bars = klineCache.merge(older, bars);
          on.onBars(bars);
        })
        .catch(() => {
          if (!disposed) fail();
        })
        .finally(() => {
          if (!disposed) paging = false; // 迟到 finally 不得误放行已 dispose 实例的翻页
        });
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearInterval(timer);
    },
  };
}

export function useCompareSeries(instrument: Instrument | null, timeframe: TimeframeId, mainBars: readonly Bar[]): CompareSeries {
  const [bars, setBars] = useState<Bar[]>([]);
  const [status, setStatus] = useState<CompareSeries['status']>('idle');
  const feedRef = useRef<ReturnType<typeof createCompareFeed> | null>(null);
  const mainBarsRef = useRef(mainBars);
  mainBarsRef.current = mainBars;

  // 换品种/周期：旧 feed 就地 dispose（迟到响应作废、轮询即停），新 feed 重新订阅
  useEffect(() => {
    const feed = createCompareFeed(instrument, timeframe, { onBars: setBars, onStatus: setStatus }, () => mainBarsRef.current[0]?.time ?? null);
    feedRef.current = feed;
    feed.start();
    return () => {
      feed.dispose();
      feedRef.current = null;
    };
  }, [instrument, timeframe]);

  // 主序列翻页增长 → 按 time 重新对齐（对比柱补齐后左缘断线自然愈合）
  const aligned = useMemo(() => alignByTime(mainBars, bars), [mainBars, bars]);

  /** 主图左缘懒加载联动（ChartWorkspace onNeedsMoreHistory）：同步向左翻页 */
  const loadMore = useCallback(() => feedRef.current?.loadMore(), []);

  return { status, aligned, loadMore };
}

/** 对比品种选择浮层：顶栏 Compare 按钮打开；选择 / 移除后自行关闭 */
export function CompareSymbolPicker() {
  const open = useChartConfigStore((s) => s.comparePickerOpen);
  const setOpen = useChartConfigStore((s) => s.setComparePickerOpen);
  const compare = useChartConfigStore((s) => s.compareSymbol);
  const setCompare = useChartConfigStore((s) => s.setCompareSymbol);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      dataRegistry
        .search(q)
        .then((result) => setHits(result.slice(0, SEARCH_MAX)))
        .catch(() => setHits([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  return (
    <Modal open={open} onOpenChange={(o) => !o && setOpen(false)} title="叠加对比品种" width={320}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索代码或名称"
        aria-label="搜索对比品种"
        autoComplete="off"
        spellCheck={false}
        style={{ ...inputStyle, width: '100%', marginBottom: space.sm }}
      />
      {compare && (
        <button
          style={{ ...btnStyle, width: '100%', marginBottom: space.sm, color: 'var(--warn)' }}
          onClick={() => {
            setCompare(null);
            setOpen(false);
          }}
        >
          移除当前对比（{compare.symbol}）
        </button>
      )}
      <div className="tv-scroll" style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {hits.map((hit) => (
          <button
            key={hit.instrument.id}
            style={{ ...rowStyle, width: '100%' }}
            onClick={() => {
              setCompare(hit.instrument);
              setOpen(false);
            }}
            aria-label={`对比 ${hit.instrument.symbol}`}
          >
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{hit.instrument.symbol}</span>
            <span style={{ color: 'var(--text-faint)', marginLeft: space.sm }}>{hit.instrument.name}</span>
          </button>
        ))}
        {query.trim() !== '' && hits.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: fontSize.sm, textAlign: 'center', padding: `${space.md}px 0` }}>未找到相关品种</div>
        )}
      </div>
    </Modal>
  );
}

// ---------- 样式（DOM 层只用 CSS token，禁裸 hex） ----------

const inputStyle: React.CSSProperties = {
  height: 28,
  padding: `0 ${space.sm}px`,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  fontSize: fontSize.md,
  outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: `3px ${space.sm}px`,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  fontSize: fontSize.sm,
  cursor: 'pointer',
  textAlign: 'left',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  minHeight: 30,
  padding: `2px ${space.sm}px`,
  background: 'transparent',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: fontSize.md,
  cursor: 'pointer',
  textAlign: 'left',
};
