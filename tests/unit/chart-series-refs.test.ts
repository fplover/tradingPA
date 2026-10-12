// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, Timeframe, TimeframeId } from '@/types/market';
import type { Instrument } from '@/types/instrument';
import type { Quote } from '@/data/sources/types';
import { calendarTzOffsetMinutes } from '@/data/tz';
import { useQuoteStore } from '@/store/quoteStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 三期-H 改造（useChartSeries 门禁盲区清偿）的行为中性护栏：
 *  该 hook 原先在渲染期直接写三个 latest-ref、并在嵌套分支里补第二次 setStatusDetail。
 *  改为 effect 内同步 + 状态写入同批下发后，以下三条必须逐条钉住。
 *  本文件不得依赖被测源码里的 eslint-disable 指令——指令已随该批删除。 */

const barsCall = vi.hoisted(() => vi.fn());
const aggConstructed = vi.hoisted(() => [] as { baseInterval: string; ratio: number }[]);
const applyQuoteCall = vi.hoisted(() => vi.fn());

vi.mock('@/data/sources/registry', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/sources/registry')>();
  return {
    ...real,
    dataRegistry: {
      sourceName: () => '测试源',
      bars: (inst: Instrument) => {
        barsCall(inst);
        return Promise.resolve(aggConstructed.length > 0 ? [] : HISTORY);
      },
      barsBefore: () => Promise.resolve([]),
    },
  };
});

vi.mock('@/data/cache/klineCache', () => ({
  klineCache: {
    get: () => Promise.resolve([] as Bar[]),
    put: () => Promise.resolve(),
    merge: (a: Bar[], b: Bar[]) => [...a, ...b],
  },
}));

vi.mock('@/data/aggregatePath', () => ({
  AggregateFeedPath: class {
    constructor(opts: { baseInterval: string; ratio: number }) {
      aggConstructed.push(opts);
    }
    start() {
      return Promise.resolve();
    }
    dispose() {}
    loadMore() {
      return Promise.resolve(0);
    }
  },
}));

vi.mock('@/data/feed/LiveDataFeed', () => ({
  toBinanceInterval: (id: string) => id,
  LiveDataFeed: class {
    start() {
      return Promise.resolve();
    }
    stop() {}
    loadMore() {
      return Promise.resolve(0);
    }
  },
}));

vi.mock('@/features/market/mockFallback', () => ({
  createMockFallback: () => vi.fn(),
}));

vi.mock('@/data/liveBar', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/liveBar')>();
  return {
    ...real,
    applyQuote: (history: Bar[], quote: Quote, tf: Timeframe, tz: number) => {
      applyQuoteCall(tz);
      return real.applyQuote(history, quote, tf, tz);
    },
  };
});

import { useChartSeries } from '@/features/market/useChartSeries';

const HISTORY: Bar[] = [
  { time: Date.UTC(2024, 0, 1), open: 10, high: 11, low: 9, close: 10.5, volume: 3 },
  { time: Date.UTC(2024, 0, 1) + 86_400_000, open: 10.5, high: 12, low: 10, close: 11, volume: 4 },
];

const QUOTE: Quote = {
  id: 'cn-sh:600519',
  price: 11.5,
  change: 0.5,
  changePct: 4.5,
  prevClose: 11,
  open: 10.8,
  high: 11.8,
  low: 10.6,
  volume: 9,
  amount: 100,
  time: Date.UTC(2024, 0, 1) + 86_400_000,
};

function instrument(id: string, market: Instrument['market']): Instrument {
  return {
    id,
    code: id.toUpperCase(),
    symbol: id,
    name: id,
    market,
    asset: market === 'crypto' ? 'crypto' : 'stock',
    exchange: 'TEST',
    decimals: 2,
  };
}

/** hook 结果落到 DOM 数据集：渲染期给外部变量赋值本身就是 react(globals) 拦的副作用，
 *  本批次的退出判据正是「不用 disable 指令也 0 警告」，测试自己必须先守规矩。 */
function Harness(props: { inst: Instrument; timeframe: TimeframeId }) {
  const series = useChartSeries(props.inst, props.timeframe);
  return createElement('div', {
    'data-testid': 'series',
    'data-mode': series.mode,
    'data-status': series.status,
    'data-detail': series.statusDetail,
    'data-bars': String(series.bars.length),
  });
}

interface View {
  mode: string;
  status: string;
  detail: string;
  bars: number;
}

async function mount(inst: Instrument, timeframe: TimeframeId = '1D') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: ReturnType<typeof createRoot> | null = null;
  const render = (i: Instrument, t: TimeframeId) => {
    act(() => {
      if (!root) root = createRoot(container);
      root.render(createElement(Harness, { inst: i, timeframe: t }));
    });
  };
  render(inst, timeframe);
  await act(async () => {});
  return {
    cleanup: () => {
      act(() => root?.unmount());
      container.remove();
    },
    rerender: (nextInst: Instrument, nextTf?: TimeframeId) => {
      render(nextInst, nextTf ?? timeframe);
    },
    flush: async () => {
      await act(async () => {});
    },
    read: (): View => {
      const el = container.querySelector('[data-testid="series"]') as HTMLElement;
      return {
        mode: el.dataset['mode']!,
        status: el.dataset['status']!,
        detail: el.dataset['detail']!,
        bars: Number(el.dataset['bars']),
      };
    },
  };
}

beforeEach(() => {
  barsCall.mockClear();
  aggConstructed.length = 0;
  applyQuoteCall.mockClear();
  useQuoteStore.setState({ quotes: {} });
});

describe('useChartSeries 三期-H 改造（refs 同步时序 / 状态文案同批 / tz 派生自 props）', () => {
  it('切品种后的首个历史拉取用新 instrument——latest-ref 由 effect 同步仍先于消费方', async () => {
    const h = await mount(instrument('a', 'forex'));
    expect(barsCall.mock.calls.at(-1)?.[0].id).toBe('a');
    h.rerender(instrument('b', 'forex'));
    await h.flush();
    expect(barsCall.mock.calls.at(-1)?.[0].id).toBe('b');
    h.cleanup();
  });

  it('聚合路径的状态文案与其余状态写入同批下发，不再在嵌套分支里补第二次 setState', async () => {
    const h = await mount(instrument('btc', 'crypto'), '2m' as TimeframeId);
    await h.flush();
    expect(aggConstructed).toHaveLength(1);
    expect(aggConstructed[0].baseInterval).toBe('1m');
    expect(h.read().status).toBe('loading');
    // 改造前该文案由分支内第二处同步 setState 覆盖；同批下发后终值必须逐字一致
    expect(h.read().detail).toBe('拉取 1m 基期 K 线并聚合');
    h.cleanup();
  });

  it('原生周期不误进聚合路径，文案维持「读取本地缓存」', async () => {
    const h = await mount(instrument('btc', 'crypto'), '1m' as TimeframeId);
    await h.flush();
    expect(aggConstructed).toHaveLength(0);
    expect(h.read().detail).toBe('读取本地缓存');
    h.cleanup();
  });

  it('日历桶时区按 props market 派生（渲染期不再读 ref），CN 源取本地偏移', async () => {
    useQuoteStore.setState({ quotes: { 'cn-sh:600519': QUOTE } });
    const h = await mount(instrument('cn-sh:600519', 'cn-sh'));
    await h.flush();
    expect(applyQuoteCall).toHaveBeenCalled();
    expect(applyQuoteCall.mock.calls.at(-1)?.[0]).toBe(calendarTzOffsetMinutes('cn-sh'));
    h.cleanup();
  });
});
