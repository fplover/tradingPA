import type { IndicatorDef } from '../core/types';
import { sma } from '../core/math';

const num = (v: unknown) => Number(v);

/** OBV 能量潮 */
export const OBV: IndicatorDef = {
  id: 'obv',
  name: 'OBV 能量潮',
  category: '成交量',
  overlay: false,
  lookback: 1,
  params: [{ key: 'color', label: '颜色', type: 'color', default: '#2962ff' }],
  plots: [{ key: 'obv', label: 'OBV', style: { kind: 'line', color: '#2962ff', lineWidth: 2 } }],
  compute: (bars) => {
    const out: number[] = [];
    let obv = 0;
    for (let i = 0; i < bars.length; i++) {
      if (i > 0) {
        if (bars[i].close > bars[i - 1].close) obv += bars[i].volume;
        else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
      }
      out.push(obv);
    }
    return { obv: out };
  },
};

/** VWAP（overlay，自数据起点累计） */
export const VWAP: IndicatorDef = {
  id: 'vwap',
  name: 'VWAP 成交量加权均价',
  category: '成交量',
  overlay: true,
  lookback: 1,
  params: [{ key: 'color', label: '颜色', type: 'color', default: '#ff9800' }],
  plots: [{ key: 'vwap', label: 'VWAP', style: { kind: 'line', color: '#ff9800', lineWidth: 1.5 } }],
  compute: (bars) => {
    let pv = 0;
    let v = 0;
    return {
      vwap: bars.map((b) => {
        const tp = (b.high + b.low + b.close) / 3;
        pv += tp * b.volume;
        v += b.volume;
        return v > 0 ? pv / v : undefined;
      }),
    };
  },
};

/** CVD 累计成交量差 */
export const CVD: IndicatorDef = {
  id: 'cvd',
  name: 'CVD 累计量差',
  category: '成交量',
  overlay: false,
  lookback: 1,
  params: [{ key: 'color', label: '颜色', type: 'color', default: '#7e57c2' }],
  plots: [{ key: 'cvd', label: 'CVD', style: { kind: 'line', color: '#7e57c2', lineWidth: 2 } }],
  compute: (bars) => {
    let cvd = 0;
    return {
      cvd: bars.map((b) => {
        const range = b.high - b.low;
        const buyRatio = range === 0 ? 0.5 : (b.close - b.low) / range;
        cvd += b.volume * (2 * buyRatio - 1);
        return cvd;
      }),
    };
  },
};

/** 成交量 SMA（副图） */
export const VolumeMA: IndicatorDef = {
  id: 'volume-ma',
  name: '成交量均线',
  category: '成交量',
  overlay: false,
  lookback: 100,
  params: [
    { key: 'length', label: '周期', type: 'number', default: 20, min: 1, max: 200 },
    { key: 'color', label: '颜色', type: 'color', default: '#ffc107' },
  ],
  plots: [{ key: 'ma', label: 'VOL MA', style: { kind: 'line', color: '#ffc107', lineWidth: 1.5 } }],
  compute: (bars, params) => ({
    ma: sma(bars.map((b) => b.volume), num(params.length)),
  }),
};

export const volumeIndicators = [OBV, VWAP, CVD, VolumeMA];
