import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { setTheme, theme, type ThemeName } from '@/engine/theme';
import { aggregateBars } from '@/data/aggregate';
import { getTimeframe, type Bar, type ChartTypeId, type TimeframeId } from '@/types/market';
import { nextCloseTime } from '@/engine/countdown';
import type { DrawingTypeId } from '@/engine/drawing/types';

/**
 * 视觉回归 harness（A3-1）：以确定性数据直接挂载真实 ChartRenderer，
 * 经 window.__vh 暴露状态开关，供 tests/e2e/visual-regression.spec.ts 截图。
 *
 * 不走 React 与网络：数据 = 固定基准时间 + 符号种子 LCG（与 mockData.generateSeededMockBars
 * 同构，但基准时间写死、无 Math.random/Date.now）→ 跨运行像素级稳定。
 * harness 只做"挂载 + 开关"，交互（光标/画线）由 spec 用真实鼠标事件驱动。
 */

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BASE_TIME = Date.UTC(2024, 0, 8, 0, 0, 0); // 固定基准（标签按本地时区渲染，同机一致）

/**
 * 冻结时钟（B3 收盘倒计时护栏）：ChartRenderer 会在最新价徽章旁渲染实时 mm:ss 倒计时
 * （CloseCountdown.sample(Date.now())，inWindow = now ∈ [lastBarTime, closeTime)）。
 * 不冻结 → 黄金截图随真实时钟每秒变化 → flaky。默认冻结点取「末 bar 收盘之后」：
 * 窗口判定为 false，倒计时不绘制，基线保持纯数据驱动；
 * __vh.setFrozenNow 可把冻结点改到窗口内（收盘前 N 秒），供 countdown-badge
 * 表面做「窗口内/外双态差分」的行为断言（该表面时变语义，禁像素基线）。
 * 若未来窗口语义/数据时点变化，按 spec 头部说明走 UPDATE_SNAPSHOTS=1 重产基线。
 */
const FROZEN_NOW_DEFAULT = BASE_TIME + 600 * 60_000 + 60_000; // 末 bar（09:59）收盘后 1 分钟
let frozenNow = FROZEN_NOW_DEFAULT;
Date.now = () => frozenNow;

/** 当前档位秒数（setTimeframe 切换；countdownProbe 的收盘时刻按它重算） */
let intervalSeconds = 60;

function seededBars(symbol: string, count = 600, intervalMs = 60_000): Bar[] {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = lcg(h >>> 0);
  const bars: Bar[] = [];
  let price = 30_000;
  for (let i = 0; i < count; i++) {
    const time = BASE_TIME + i * intervalMs;
    const open = price;
    const drift = (rand() - 0.5) * price * 0.004;
    const close = Math.max(0.01, open + drift);
    const high = Math.max(open, close) + rand() * price * 0.003;
    const low = Math.min(open, close) - rand() * price * 0.003;
    bars.push({ time, open, high, low, close, volume: 100 + rand() * 900 });
    price = close;
  }
  return bars;
}

const CELLS = [
  // timeframeId 必传：ChartRenderer.resolveTimeframe 靠它解析倒计时周期（缺失 = 停用），
  // 与 App 运行环境一致（Chart.tsx 构造/setLegend 均传 timeframeId）。
  // market 必传：图例开/闭市圆点（Wave5 项4）。crypto 在 isMarketOpen 首行短路
  // （7×24 恒开市）——不读时钟，基线确定性不受采集时点影响；若将来引入
  // 时段依赖市场的种子符号，需同步冻结 new Date() 而非仅 Date.now。
  { symbol: 'BTC/USDT', interval: '1m', timeframeId: '1m', market: 'crypto' as const, decimals: 2, exchange: 'Binance' },
  { symbol: 'ETH/USDT', interval: '1m', timeframeId: '1m', market: 'crypto' as const, decimals: 2, exchange: 'Binance' },
];

const grid = document.getElementById('grid')!;
const renderers: ChartRenderer[] = [];
/** 每格的基础 1m 种子（setTimeframe 聚合源；与 renderers 同索引，splice 同步） */
const baseBars: Bar[][] = [];

function mountCell(index: number): ChartRenderer {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.id = `cell-${index}`;
  grid.appendChild(cell);
  const canvas = document.createElement('canvas');
  cell.appendChild(canvas);
  const cfg = CELLS[index];
  const bars = seededBars(cfg.symbol);
  baseBars[index] = bars;
  // CELLS.market 经构造函数 spread 进 legend（单一数据源，b0a2579 起渲染处
  // 直读 this.legend.market）→ 图例开/闭市圆点；crypto 恒开市，确定性。
  const r = new ChartRenderer(canvas, bars, cfg);
  r.start();
  renderers[index] = r;
  return r;
}

function unmountCell(index: number): void {
  renderers[index]?.dispose();
  renderers.splice(index, 1);
  baseBars.splice(index, 1);
  document.getElementById(`cell-${index}`)?.remove();
}

mountCell(0);

/**
 * 帧计数：注册于 renderer.start() 之后 → 同一帧内先执行渲染循环再计数，
 * 因此 frames 递增即保证该帧已发生过绘制（dirty 时）。
 */
let frames = 0;
requestAnimationFrame(function tick() {
  frames++;
  requestAnimationFrame(tick);
});

const main = (): ChartRenderer => renderers[0];

(window as unknown as { __vh: unknown }).__vh = {
  get frames(): number {
    return frames;
  },
  setTheme(name: ThemeName): void {
    setTheme(name);
    for (const r of renderers) r?.redraw();
  },
  setChartType(t: ChartTypeId): void {
    for (const r of renderers) r?.setChartType(t);
  },
  /**
   * 周期切换（B5 新档位 2m/45m/3H）：与 App 数据层同路径——
   * useChartSeries/ChartCell 用 aggregateBars 把 1m 基础数据聚合成目标档位后 setData，
   * ChartRenderer 引擎本身不做聚合（只渲染传入的 bars）。harness 复刻该路径。
   */
  setTimeframe(id: TimeframeId): void {
    const tf = getTimeframe(id);
    intervalSeconds = tf.seconds;
    renderers.forEach((r, i) => {
      const base = baseBars[i];
      if (!base || !r) return;
      const bars = tf.seconds > 60 ? aggregateBars(base, tf) : base;
      r.setData(bars);
      r.setLegend({ timeframeId: id, interval: id });
    });
  },
  /** 倒计时调试探针：末 bar 开盘时刻 + 当前档位的收盘时刻（引擎 nextCloseTime 同公式） */
  countdownProbe(): { lastBarTime: number; closeTime: number } {
    const last = main().lastBarTime;
    return { lastBarTime: last, closeTime: nextCloseTime(intervalSeconds * 1000, last) };
  },
  /** 主题轴文字色（canvas 文本像素比对用，单例当前值） */
  axisTextRgb(): [number, number, number] {
    const h = theme.axisText;
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  },
  /** 主图当前 bar 数（B5 聚合断言：600 根 1m → 2m 300 根 / 45m 14 根） */
  barCount(): number {
    return main().getBars().length;
  },
  /** 改写冻结时钟（B3 countdown-badge 表面：窗口内/外双态差分） */
  setFrozenNow(ts: number): void {
    frozenNow = ts;
  },
  addIndicator(id: string): string | null {
    return main().addIndicator(id);
  },
  clearIndicators(): void {
    for (const l of main().listIndicators()) main().removeIndicator(l.uid);
  },
  setLayout(n: number): void {
    if (n >= 2 && !renderers[1]) mountCell(1);
    if (n < 2 && renderers[1]) unmountCell(1);
  },
  setTool(t: DrawingTypeId | null): void {
    main().setActiveTool(t);
  },
  clearDrawings(): void {
    main().clearDrawings();
  },
};
