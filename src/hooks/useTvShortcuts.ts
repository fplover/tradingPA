import { useEffect, useRef } from 'react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { TimeframeId } from '@/types/market';
import { useDrawingStore } from '@/store/drawingStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useUiStore } from '@/store/uiStore';
import { useSymbolSearchStore } from '@/features/watchlist/searchStore';
import { useRightDockStore } from '@/features/rightbar/rightPanelStore';

// ---------- 图表渲染器注册表 ----------

/** 已挂载的图表渲染器集合。多图表布局下同一按键需作用到每个单元格（与原 Chart.tsx
 *  逐实例 window 监听等效）；单图布局下仅主图一个实例。App 不直接持有单元格
 *  renderer，图表级快捷键统一经此收敛（B1 的落地）。 */
const chartRenderers = new Set<ChartRenderer>();

export function registerChartRenderer(r: ChartRenderer): void {
  chartRenderers.add(r);
}

export function unregisterChartRenderer(r: ChartRenderer): void {
  chartRenderers.delete(r);
}

/** 对全部已挂载渲染器执行动作（单图 = 主图；多图表 = 所有单元格） */
export function eachChartRenderer(fn: (r: ChartRenderer) => void): void {
  for (const r of chartRenderers) fn(r);
}

export interface TvShortcutsOptions {
  /** 主图 renderer（截图用；多图表布局下为 null） */
  rendererRef: { current: ChartRenderer | null };
  onAddToWatchlist: () => void;
  onToggleHideDrawings: () => void;
  onToggleLog: () => void;
  onTogglePercent: () => void;
  onScreenshot: () => void;
  onOpenShortcuts: () => void;
  onOpenIndicators: () => void;
  onOpenGoToDate: () => void;
  /** 单图布局下应用周期（多图表下作用于聚焦单元格，由 hook 内部路由） */
  onApplyInterval: (tf: TimeframeId) => void;
  onToggleFullscreen: () => void;
  onOpenCommandPalette: () => void;
}

/** TV 默认快捷键统一注册（图表级）。输入框 / 菜单 / 对话框内不劫持。
 *  覆盖：缩放 / 平移 / 首尾 K 线 / 最大化 / 单元格切换 / 周期 / 品种 / 布局存取 /
 *  警报 / 自选 / 前往日期等（映射均经 tradingview.com 官方快捷键页核实）。
 *  Shift+滚轮平移在 Chart.tsx（wheel 捕获阶段）处理，不在此列。
 *  P2-C：周期浮层开合状态从本地 useState 收敛到 uiStore（对话框开关统一收口）；
 *  Alt+Enter 在多图表布局下 = 最大化/还原聚焦单元格（TV 行为），单图保持全屏切换。 */
export function useTvShortcuts(options: TvShortcutsOptions) {
  const optsRef = useRef(options);
  // latest-value 同步：keydown 处理器与 applyInterval 在事件期读 optsRef.current，
  // 必须在 effect 内更新（渲染期写 ref 会触发 react-hooks/refs）
  useEffect(() => {
    optsRef.current = options;
  });
  /** 打开周期浮层时暂存的焦点图表（多图表下周期作用于聚焦单元格） */
  const chartFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      )
        return;
      if (el && el.closest('[role="menu"], [role="dialog"], [role="listbox"]')) return;
      const k = e.key;
      const lower = k.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const o = optsRef.current;

      // ---- Ctrl/⌘ + Alt ----
      if (mod && e.altKey) {
        if (lower === 'h') {
          e.preventDefault();
          o.onToggleHideDrawings();
        } else if (lower === 'w') {
          e.preventDefault();
          useSymbolSearchStore.getState().openSearch('add');
        }
        return;
      }
      // ---- Ctrl/⌘ ----
      if (mod) {
        if (lower === 'k') {
          e.preventDefault();
          useSymbolSearchStore.getState().openSearch('switch');
        } else if (lower === 'p' && !e.shiftKey) {
          // P1-E：命令面板（TV Ctrl+P 命令搜索；浏览器默认打印被 preventDefault 抑制）
          e.preventDefault();
          o.onOpenCommandPalette();
        } else if (lower === 's' && !e.shiftKey) {
          e.preventDefault();
          useLayoutStore.getState().saveCurrentLayout();
        } else if (lower === 'z' && !e.shiftKey) {
          e.preventDefault();
          eachChartRenderer((r) => r.undoDrawing());
        } else if (lower === 'y' || (lower === 'z' && e.shiftKey)) {
          e.preventDefault();
          eachChartRenderer((r) => r.redoDrawing());
        } else if (k === 'ArrowUp') {
          e.preventDefault();
          eachChartRenderer((r) => r.zoom(1.2));
        } else if (k === 'ArrowDown') {
          e.preventDefault();
          eachChartRenderer((r) => r.zoom(1 / 1.2));
        } else if (k === 'ArrowLeft') {
          e.preventDefault();
          eachChartRenderer((r) => r.pan(-30));
        } else if (k === 'ArrowRight') {
          e.preventDefault();
          eachChartRenderer((r) => r.pan(30));
        }
        return;
      }
      // ---- Alt ----
      if (e.altKey) {
        if (lower === 'a') {
          e.preventDefault();
          useRightDockStore.getState().open('alerts');
        } else if (lower === 'w') {
          e.preventDefault();
          o.onAddToWatchlist();
        } else if (lower === 'n') {
          e.preventDefault();
          useDrawingStore.getState().setActiveTool('text');
        } else if (lower === 'r') {
          e.preventDefault();
          eachChartRenderer((r) => r.resetView());
        } else if (lower === 'l') {
          e.preventDefault();
          o.onToggleLog();
        } else if (lower === 'p') {
          e.preventDefault();
          o.onTogglePercent();
        } else if (lower === 's') {
          e.preventDefault();
          o.onScreenshot();
        } else if (lower === 'd') {
          e.preventDefault();
          o.onOpenIndicators();
        } else if (lower === 'g') {
          e.preventDefault();
          o.onOpenGoToDate();
        } else if (k === 'Enter') {
          e.preventDefault();
          // 多图表：Alt+Enter 最大化聚焦单元格 / 还原（TV 行为）；单图布局保持全屏切换
          const st = useLayoutStore.getState();
          if (st.layout > 1) {
            if (st.maximizedCell !== null) {
              st.exitMaximize();
            } else {
              const list = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-tv-chart]')];
              const i = document.activeElement instanceof HTMLCanvasElement ? list.indexOf(document.activeElement) : -1;
              st.toggleMaximizeCell(i >= 0 ? i : 0);
            }
          } else {
            optsRef.current.onToggleFullscreen();
          }
        } else if (e.shiftKey && k === 'ArrowLeft') {
          e.preventDefault();
          eachChartRenderer((r) => r.showRange(0));
        } else if (e.shiftKey && k === 'ArrowRight') {
          e.preventDefault();
          eachChartRenderer((r) => r.scrollToRealtime());
        }
        return;
      }
      // ---- 无 Ctrl / Alt ----
      if (k === 'Tab') {
        // 多图表：焦点已在图表画布上时 Tab/Shift+Tab 切换单元格（TV 行为）；
        // 其余位置保留原生 Tab 导航（可访问性）
        const active = document.activeElement;
        if (
          useLayoutStore.getState().layout > 1 &&
          active instanceof HTMLCanvasElement &&
          active.dataset.tvChart !== undefined
        ) {
          const list = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-tv-chart]')];
          if (list.length > 1) {
            e.preventDefault();
            const i = list.indexOf(active);
            list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus();
          }
        }
        return;
      }
      if (k === '?') {
        e.preventDefault();
        o.onOpenShortcuts();
      } else if (k === '/') {
        e.preventDefault();
        useSymbolSearchStore.getState().openSearch('switch');
      } else if (k === '.') {
        e.preventDefault();
        useLayoutStore.getState().setSaveMenuOpen(true);
      } else if (k === '+' || k === '=') {
        e.preventDefault();
        eachChartRenderer((r) => r.zoom(1.2));
      } else if (k === '-' || k === '_') {
        e.preventDefault();
        eachChartRenderer((r) => r.zoom(1 / 1.2));
      } else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        // B7：有选中画线时方向键 = 像素步长微调（Shift = 大步长 10px，TV 肌肉记忆）；
        // 无选中时保留 TV 默认：左右方向键平移视口（3 格）
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        let nudged = false;
        eachChartRenderer((r) => {
          if (r.nudgeSelectedDrawing(dx, dy)) nudged = true;
        });
        if (!nudged && dx !== 0) eachChartRenderer((r) => r.pan(dx > 0 ? 3 : -3));
      } else if (k === 'Escape') {
        eachChartRenderer((r) => r.cancelPlacing());
        useDrawingStore.getState().setActiveTool(null);
      } else if (k === 'Delete' || k === 'Backspace') {
        eachChartRenderer((r) => r.removeSelectedDrawing());
      } else if (k === 'Enter') {
        eachChartRenderer((r) => r.finishPlacing());
      } else if (e.shiftKey && lower === 'f') {
        e.preventDefault();
        o.onToggleFullscreen();
      } else if (/^[0-9]$/.test(k) || k === ',') {
        e.preventDefault();
        chartFocusRef.current = document.activeElement;
        useUiStore.getState().openInterval(k === ',' ? '' : k);
      } else if (/^[a-zA-Z]$/.test(k) && !e.repeat) {
        e.preventDefault();
        useSymbolSearchStore.getState().openSearch('switch', lower);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** 周期应用：单图走 App state；多图表作用于聚焦单元格（无聚焦记录时落第一个） */
  const applyInterval = (tf: TimeframeId) => {
    if (useLayoutStore.getState().layout === 1) {
      optsRef.current.onApplyInterval(tf);
      return;
    }
    const list = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-tv-chart]')];
    const i = chartFocusRef.current instanceof HTMLCanvasElement ? list.indexOf(chartFocusRef.current) : -1;
    useLayoutStore.getState().setCell(i >= 0 ? i : 0, { timeframe: tf });
  };

  // 周期浮层开合/预填状态收敛在 uiStore（对话框开关统一收口），此处只返回应用逻辑
  return { applyInterval };
}
