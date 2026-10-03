import { describe, expect, it } from 'vitest';
import { legendFieldsFor } from '@/engine/renderer/drawCrosshair';
import type { ChartTypeId } from '@/types/market';

/** 图例 OHLCV 字段按图表类型收窄（TV 规格） */

const ALL = { open: true, high: true, low: true, close: true, volumeWidthHint: false };

describe('legendFieldsFor', () => {
  it('蜡烛/竹线/空心/平均K/基线/面积/砖块族：O H L C 全显', () => {
    for (const t of [
      'candles',
      'ohlc',
      'hollow',
      'heikin-ashi',
      'baseline',
      'area',
      'renko',
      'kagi',
      'line-break',
      'point-figure',
      'range',
    ] as ChartTypeId[]) {
      expect(legendFieldsFor(t)).toEqual(ALL);
    }
  });

  it('高低图：H L C（无 O）', () => {
    expect(legendFieldsFor('high-low')).toEqual({ ...ALL, open: false });
  });

  it('柱状图：O C', () => {
    expect(legendFieldsFor('columns')).toEqual({
      open: true,
      high: false,
      low: false,
      close: true,
      volumeWidthHint: false,
    });
  });

  it('线族（线形/阶梯/带标记/HLC面积）：仅 C', () => {
    for (const t of ['line', 'step-line', 'line-markers', 'hlc-area'] as ChartTypeId[]) {
      expect(legendFieldsFor(t)).toEqual({ open: false, high: false, low: false, close: true, volumeWidthHint: false });
    }
  });

  it('成交量蜡烛：O H L C + 量宽语义提示', () => {
    expect(legendFieldsFor('volume-candles')).toEqual({ ...ALL, volumeWidthHint: true });
  });
});
