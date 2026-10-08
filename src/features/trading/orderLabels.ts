import type { OrderType } from './paperEngine';

/** 订单类型中文标签（挂单对话框类型切换 + 挂单列表类型列共用） */
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  market: '市价',
  limit: '限价',
  stop: '止损',
  'stop-limit': '止损限价',
};
