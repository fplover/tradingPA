import type { IndicatorDef } from '../core/types';
import { theme } from '@/engine/theme';

/**
 * Volume Profile（P1-F，ADR-001 kline 近似）：主图右缘横置直方图 + POC/VAH/VAL。
 * profile 标记：无逐 bar 序列输出，compute 为空实现；IndicatorManager 按标记
 * 走专用分支（切 ChartState 状态 + 挂参数，不建实例/面板），计算与绘制在
 * engine/profile + engine/renderer/drawVolumeProfile。
 * 颜色参数默认值引用主题 token 同源色（运行期渲染始终实时读 token）。
 */
export const VOLUME_PROFILE: IndicatorDef = {
  id: 'volume-profile',
  name: 'Volume Profile 成交量分布',
  category: '成交量',
  overlay: true,
  profile: true,
  lookback: 1,
  params: [
    { key: 'rowCount', label: '行数', type: 'number', default: 24, min: 10, max: 100, step: 1 },
    { key: 'vaPercent', label: '价值区域 %', type: 'number', default: 70, min: 50, max: 95, step: 1 },
    {
      key: 'source',
      label: '数据源',
      type: 'select',
      default: 'volume',
      options: [
        { label: '成交量', value: 'volume' },
        { label: '买卖量差', value: 'delta' },
      ],
    },
    { key: 'upColor', label: '涨方颜色', type: 'color', default: theme.profileUp },
    { key: 'downColor', label: '跌方颜色', type: 'color', default: theme.profileDown },
    { key: 'pocColor', label: 'POC 颜色', type: 'color', default: theme.profilePoc },
  ],
  plots: [],
  compute: () => ({}),
};

export const profileIndicators = [VOLUME_PROFILE];
