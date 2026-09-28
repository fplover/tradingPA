import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { setTheme, type ThemeName } from '@/engine/theme';
import type { Bar, ChartTypeId } from '@/types/market';
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
  { symbol: 'BTC/USDT', interval: '1m', decimals: 2, exchange: 'Binance' },
  { symbol: 'ETH/USDT', interval: '1m', decimals: 2, exchange: 'Binance' },
];

const grid = document.getElementById('grid')!;
const renderers: ChartRenderer[] = [];

function mountCell(index: number): ChartRenderer {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.id = `cell-${index}`;
  grid.appendChild(cell);
  const canvas = document.createElement('canvas');
  cell.appendChild(canvas);
  const cfg = CELLS[index];
  const r = new ChartRenderer(canvas, seededBars(cfg.symbol), cfg);
  r.start();
  renderers[index] = r;
  return r;
}

function unmountCell(index: number): void {
  renderers[index]?.dispose();
  renderers.splice(index, 1);
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
