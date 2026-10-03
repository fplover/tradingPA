/** 挂单触价判定 + 下单校验（纯函数，无框架依赖）：被 paperEngine 每根 K 线调用 */

import type { Order, OrderSpec } from './paperEngine';

/** 触价判定输入：含开盘价（gap 语义需要） */
export interface TriggerBar {
  open: number;
  high: number;
  low: number;
}

export interface TriggerResult {
  /** 成交价；null = 本根未成交 */
  fillPrice: number | null;
  /** stop-limit 触发段完成（此后按限价单等待） */
  activated: boolean;
}

const notActivated: TriggerResult = { fillPrice: null, activated: false };

/**
 * 单根 K 线挂单触价判定（TV 语义）：
 * - limit 买：开盘低于限价（gap 更优）按开盘成交；否则 low 触及限价按限价成交。卖反之
 * - stop：开盘跳过触发价按开盘成交（转市价）；否则 high/low 触及按触发价成交
 * - stop-limit 两段：先触发（gap 开盘跳过或盘中触及）激活限价段，此后按限价单判定
 */
export function checkOrderTrigger(order: Order, bar: TriggerBar): TriggerResult {
  const limit = order.limitPrice;
  const stop = order.stopPrice;
  switch (order.type) {
    case 'limit': {
      if (limit === undefined) return notActivated;
      if (order.side === 'buy') {
        if (bar.open <= limit) return { fillPrice: bar.open, activated: false };
        if (bar.low <= limit) return { fillPrice: limit, activated: false };
      } else {
        if (bar.open >= limit) return { fillPrice: bar.open, activated: false };
        if (bar.high >= limit) return { fillPrice: limit, activated: false };
      }
      return notActivated;
    }
    case 'stop': {
      if (stop === undefined) return notActivated;
      if (order.side === 'buy') {
        if (bar.open >= stop) return { fillPrice: bar.open, activated: false };
        if (bar.high >= stop) return { fillPrice: stop, activated: false };
      } else {
        if (bar.open <= stop) return { fillPrice: bar.open, activated: false };
        if (bar.low <= stop) return { fillPrice: stop, activated: false };
      }
      return notActivated;
    }
    case 'stop-limit': {
      if (limit === undefined || stop === undefined) return notActivated;
      const buy = order.side === 'buy';
      // 限价段在开盘即生效的两种情形：此前已激活，或本根开盘跳穿触发价
      const preActive = order.triggered === true || (buy ? bar.open >= stop : bar.open <= stop);
      if (preActive) {
        if (buy) {
          if (bar.open <= limit) return { fillPrice: bar.open, activated: true };
          if (bar.low <= limit) return { fillPrice: limit, activated: true };
        } else {
          if (bar.open >= limit) return { fillPrice: bar.open, activated: true };
          if (bar.high >= limit) return { fillPrice: limit, activated: true };
        }
        return { fillPrice: null, activated: true };
      }
      // 盘中触发：触发瞬间限价可达则按限价成交，否则激活后继续等待
      const hit = buy ? bar.high >= stop : bar.low <= stop;
      if (!hit) return notActivated;
      const reachable = buy ? bar.low <= limit : bar.high >= limit;
      return { fillPrice: reachable ? limit : null, activated: true };
    }
    default:
      return notActivated;
  }
}

/**
 * 下单校验：返回错误文案；null = 合法。
 * 规则：数量 > 0；limit 必须有限价；stop 必须有触发价；stop-limit 两者都必须，且价格有限。
 */
export function validateOrderSpec(spec: OrderSpec): string | null {
  if (!Number.isFinite(spec.qty) || spec.qty <= 0) return '数量必须为正数';
  const hasLimit = spec.limitPrice !== undefined && Number.isFinite(spec.limitPrice) && spec.limitPrice > 0;
  const hasStop = spec.stopPrice !== undefined && Number.isFinite(spec.stopPrice) && spec.stopPrice > 0;
  if (spec.type === 'limit' && !hasLimit) return '限价单必须填写有效限价';
  if (spec.type === 'stop' && !hasStop) return '止损单必须填写有效触发价';
  if (spec.type === 'stop-limit') {
    if (!hasStop) return '止损限价单必须填写有效触发价';
    if (!hasLimit) return '止损限价单必须填写有效限价';
  }
  return null;
}
