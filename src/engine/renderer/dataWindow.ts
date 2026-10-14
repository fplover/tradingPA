/**
 * 数据窗口快照（三期-C2）：把「光标所在 bar」的 OHLCV + 全部可见指标值 + 画线读数一次出引擎。
 *
 * 两条口径是本文件的全部难点：
 * ① **index 空间封在这里**——`crosshair.barIndex` 是**显示序列**空间（HoverController 由
 *    `viewport.xToIndex` 取整、`displaySeries.barAt` 取 bar），而公开 `getBars()` 返回 base 序列，
 *    HA / 砖块 / K 线棍下两者根本不等长。故快照直接带 bar 对象，调用方拿不到「裸 index + 裸序列」
 *    这种能错配的组合。
 * ② **回放态钳到游标**——光标落在游标之右就是未来 bar（图例同处注释见 `ChartState.currentIndex`）。
 *
 * 引擎只给裸数，格式化留在 UI 侧（`src/data/format.ts` 三件套），避免同一个价格两处两套口径。
 */
import type { Bar } from '@/types/market';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { Crosshair } from '../crosshair/Crosshair';
import type { Drawing, DrawingTypeId } from '../drawing/types';
import { getToolDef } from '../drawing/types';
import { drawingReadingsAt, type DrawingReading } from '../drawing/drawingValues';
import type { DrawContext } from '../drawing/coords';
import { indicatorValuesAt } from './drawIndicator';

/** 一个数值读数：label = 档位 / plot 名（单值时为空串），value = 裸数 */
export interface DataWindowValue {
  label: string;
  value: number;
}

export interface DataWindowStudy {
  uid: string;
  name: string;
  precision?: number;
  values: DataWindowValue[];
}

export interface DataWindowDrawing {
  id: string;
  name: string;
  type: DrawingTypeId;
  /** 空数组 = 该 bar 上无确定读数（画线族里的乙/丙/丁/戊档，以及甲档在该 x 之外） */
  readings: DrawingReading[];
}

export interface DataWindowSnapshot {
  /** 光标所在面板（无效 id 由调用链回落主面板，与绘制层同口径） */
  paneId: string;
  /** 显示序列 index；-1 = 无 bar（空序列 / 越界） */
  index: number;
  /** 该 index 的 OHLCV（显示序列）；无 bar 时 null */
  bar: Bar | null;
  /** 光标 y 在所属面板 priceScale 上的价格读数；未吸附时 null */
  cursorPrice: number | null;
  /** true = 跟随十字光标；false = 光标不在图上，回落最新可见 bar（回放态为游标） */
  fromCrosshair: boolean;
  studies: DataWindowStudy[];
  drawings: DataWindowDrawing[];
}

/** 快照只需面板的这两个字段（PaneState 结构化满足） */
export interface DataWindowPane {
  id: string;
  indicators: IndicatorInstance[];
}

export interface DataWindowInput {
  crosshair: Crosshair;
  hoveredPaneId: string;
  panes: readonly DataWindowPane[];
  /** 显示序列（与 crosshair.barIndex 同空间） */
  bars: readonly Bar[];
  /** `ChartState.currentIndex`：光标不在图上时的回落位（已含回放游标钳制） */
  currentIndex: number;
  /** 回放游标；null = 非回放 */
  replayIndex: number | null;
  hideStudies: boolean;
  timeframeId?: string;
  drawings: readonly Drawing[];
  /** 主面板绘制上下文（画线只在主面板，价格换算用它的面板与 priceScale） */
  dctx: DrawContext;
}

/** 指标读数窗口：与图例同一 50 根回看（`RenderPipeline` 同式），复用实例的窗口脏缓存 */
const INDICATOR_LOOKBACK = 50;

export function buildDataWindowSnapshot(i: DataWindowInput): DataWindowSnapshot {
  const following = i.crosshair.visible && i.crosshair.barIndex >= 0;
  const raw = following ? i.crosshair.barIndex : i.currentIndex;
  // 未来 bar 钳制：回放中游标之后不可读；非回放时 replayIndex 为 null，原样通过
  const index = i.replayIndex === null ? raw : Math.min(raw, i.replayIndex);
  const bar = index >= 0 && index < i.bars.length ? i.bars[index] : null;
  const pane = i.panes.find((p) => p.id === i.hoveredPaneId) ?? i.panes[0];

  const studies: DataWindowStudy[] = [];
  if (!i.hideStudies) {
    for (const p of i.panes) {
      for (const inst of p.indicators) {
        if (!inst.isVisibleOn(i.timeframeId)) continue;
        studies.push({
          uid: inst.uid,
          name: inst.name,
          precision: inst.precision,
          values: bar ? indicatorValuesAt(inst, i.bars, Math.max(0, index - INDICATOR_LOOKBACK), index) : [],
        });
      }
    }
  }

  // 不可见的画线不进表；锁定线进（锁定只禁改，不改可读性）
  const drawings = i.drawings
    .filter((d) => d.visible)
    .map((d) => ({
      id: d.id,
      name: getToolDef(d.type).label,
      type: d.type,
      readings: drawingReadingsAt(d, i.crosshair.x, i.dctx),
    }));

  return {
    paneId: pane.id,
    index,
    bar: bar ? { ...bar } : null,
    cursorPrice: following ? i.crosshair.price : null,
    fromCrosshair: following,
    studies,
    drawings,
  };
}
