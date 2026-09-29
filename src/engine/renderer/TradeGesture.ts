import type { PriceScale } from '../scale/PriceScale';
import { hitTestTrading, type TradeHit, type TradeVisual } from './drawTrading';

/**
 * 交易可视化手势（D 批次拆分③ + 架构师 #7 交易侵入剥离；架构映射：ChartRenderer 的
 * tradeVisual/tradeDrag/tradeHoverCursor/tradeCbs、updateTradeDrag 与按下分发分支）。
 * 交互侧收敛于此：绘制保留 drawTrading 纯函数（框架无关），逻辑层 paperEngine 不动。
 */

/** 面板最小形状（交易命中/拖拽换算只触碰价格轴与几何） */
export interface TradePane {
  y: number;
  height: number;
  priceScale: PriceScale;
}

/** 交易交互回调（挂单改价/撤单/TP-SL/平仓；UI 层经 setTradeCallbacks 注册） */
export interface TradeCallbacks {
  onOrderMove?: (id: string, price: number) => void;
  onOrderCancel?: (id: string) => void;
  onPositionTpSl?: (tp: number | null, sl: number | null) => void;
  onPositionClose?: () => void;
}

/** TradeGesture 宿主契约（ChartRenderer 实现；结构子集避免反向依赖） */
export interface TradeHost {
  /** y → 所在面板（按下命中用当前面板） */
  paneAt(y: number): TradePane;
  /** 主面板（拖拽改价固定换算主面板价格轴，与既有行为一致） */
  mainPane(): TradePane;
  /** 图表区宽（getter：随画布尺寸变化） */
  chartW(): number;
  invalidate(): void;
}

export class TradeGesture {
  private visual: TradeVisual = { orders: [], position: null, entries: [], exits: [] };
  private drag: TradeHit = null;
  /** 悬停交易可视化元素时的 pointer 光标意图（避免每帧写样式） */
  private hover = false;
  private cbs: TradeCallbacks = {};

  constructor(private host: TradeHost) {}

  // ---------- 可视化数据（setTradeVisual / draw() 读取） ----------

  get tradeVisual(): TradeVisual {
    return this.visual;
  }

  setVisual(visual: TradeVisual): void {
    this.visual = visual;
    this.host.invalidate();
  }

  setCallbacks(cbs: TradeCallbacks): void {
    this.cbs = cbs;
  }

  // ---------- 悬停光标与路由判据 ----------

  get hoverCursor(): boolean {
    return this.hover;
  }

  setHoverCursor(on: boolean): void {
    this.hover = on;
  }

  /** 是否正在拖拽交易元素（move 路由判据） */
  get dragging(): boolean {
    return this.drag !== null;
  }

  /** 命中测试（悬停/右键守卫/按下分发共用） */
  hitAt(x: number, y: number, pane: TradePane): TradeHit {
    return hitTestTrading(this.visual, x, y - pane.y, pane.priceScale, { chartW: this.host.chartW(), chartH: pane.height });
  }

  /**
   * 按下路由：撤单/平仓/TP-SL 关闭按钮直接触发回调；挂单/持仓/TP/SL 线进入拖拽。
   * 返回是否消费了本次按下（未命中交还画布进入平移）。
   */
  onPointerDown(x: number, y: number, pane: TradePane): boolean {
    const hit = this.hitAt(x, y, pane);
    if (!hit) return false;
    if (hit.kind === 'order-cancel') {
      this.cbs.onOrderCancel?.(hit.id);
      return true;
    }
    if (hit.kind === 'position-close') {
      this.cbs.onPositionClose?.();
      return true;
    }
    if (hit.kind === 'tp-close') {
      this.cbs.onPositionTpSl?.(null, this.visual.position?.stopLoss ?? null);
      return true;
    }
    if (hit.kind === 'sl-close') {
      this.cbs.onPositionTpSl?.(this.visual.position?.takeProfit ?? null, null);
      return true;
    }
    this.drag = hit;
    return true;
  }

  /** 拖拽改价：挂单价 / 持仓详情块按方向设 TP-SL / TP-SL 线直接改价 */
  dragTo(y: number): void {
    const drag = this.drag;
    if (!drag) return;
    const pane = this.host.mainPane();
    const price = pane.priceScale.yToPrice(y - pane.y);
    const pos = this.visual.position;
    if (drag.kind === 'order') {
      this.cbs.onOrderMove?.(drag.id, price);
    } else if (drag.kind === 'position') {
      // 拖动持仓详情块：按拖动方向与订单类型设置止盈/止损
      if (pos) {
        const above = price > pos.avgPrice;
        const isTp = pos.side === 'long' ? above : !above;
        if (isTp) this.cbs.onPositionTpSl?.(price, pos.stopLoss ?? null);
        else this.cbs.onPositionTpSl?.(pos.takeProfit ?? null, price);
      }
    } else if (drag.kind === 'tp') {
      // 直接拖动止盈线改价
      this.cbs.onPositionTpSl?.(price, pos?.stopLoss ?? null);
    } else if (drag.kind === 'sl') {
      // 直接拖动止损线改价
      this.cbs.onPositionTpSl?.(pos?.takeProfit ?? null, price);
    }
    this.host.invalidate();
  }

  /** 松柄：结束拖拽 */
  end(): void {
    this.drag = null;
  }
}
