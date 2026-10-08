import { useEffect, useState } from 'react';
import type { SearchHit } from '@/data/sources/types';
import { dataRegistry } from '@/data/sources/registry';
import { useChartConfigStore } from '@/store/chartConfigStore';
import { Modal } from '@/ui/primitives';
import { fontSize, radius, space } from '@/ui/tokens';

/**
 * 对比序列数据层（P2-D①，AC-D1）：
 * - 数据层（useCompareSeries / createCompareFeed / alignByTime / buildCompareLegend）
 *   已拆至同级 compareModel.ts——本文件只导出 React 组件（fast refresh 约束），
 *   import 路径 '@/features/market/useCompareSeries' 不变，组件消费者无感。
 * - CompareSymbolPicker：顶栏 Compare 按钮弹出的品种选择浮层（与 SymbolSearchDialog
 *   同款 debounce 直搜 dataRegistry；searchStore 无 compare 模式且不在本批次白名单，
 *   选择态在本组件内自持，命中即写 chartConfigStore.compareSymbol）。
 *
 * 文件为 .tsx：CompareSymbolPicker 是 React 组件（JSX），.ts 无法编译。
 */

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MAX = 20;

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
    if (!q) return; // 空查询不发请求：命中列表渲染期按空查询派生为空（见 visibleHits）
    const timer = window.setTimeout(() => {
      dataRegistry
        .search(q)
        .then((result) => setHits(result.slice(0, SEARCH_MAX)))
        .catch(() => setHits([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  // 空查询时不展示命中：渲染期派生，替代原 effect 内的同步 setHits([])（会触发
  // set-state-in-effect 告警）。迟到的 debounce 结果仍会落进 hits state，但查询已空 /
  // 浮层已关时不可见，与原先「清空即不展示」的对外行为一致。
  const visibleHits = open && query.trim() !== '' ? hits : [];

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
      <div
        className="tv-scroll"
        style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {visibleHits.map((hit) => (
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
        {query.trim() !== '' && visibleHits.length === 0 && (
          <div
            style={{
              color: 'var(--text-faint)',
              fontSize: fontSize.sm,
              textAlign: 'center',
              padding: `${space.md}px 0`,
            }}
          >
            未找到相关品种
          </div>
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
