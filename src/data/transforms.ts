import type { Bar } from '@/types/market';

/** Heikin Ashi：平滑蜡烛，open=(前open+前close)/2, close=(o+h+l+c)/4 */
export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
    out.push({
      time: b.time,
      open,
      high: Math.max(b.high, open, close),
      low: Math.min(b.low, open, close),
      close,
      volume: b.volume,
    });
    prevOpen = open;
    prevClose = close;
  }
  return out;
}

export interface BrickOptions {
  /** 砖块大小（价格单位）；renko/pnf 用 */
  brickSize?: number;
  /** 反转幅度；kagi 用价格单位，line-break 用砖数 */
  reversal?: number;
  /** line-break 砖数（默认 3） */
  lineCount?: number;
}

/** Renko：价格每移动一个 brick 出一块砖（方向随价格翻转），时间取源 bar 时间 */
export function renko(bars: Bar[], brickSize: number): Bar[] {
  const out: Bar[] = [];
  if (bars.length === 0) return out;
  let lastClose = bars[0].close;
  for (const b of bars) {
    while (Math.abs(b.close - lastClose) >= brickSize) {
      const up = b.close > lastClose;
      const newClose = up ? lastClose + brickSize : lastClose - brickSize;
      out.push({
        time: b.time,
        open: lastClose,
        high: Math.max(lastClose, newClose),
        low: Math.min(lastClose, newClose),
        close: newClose,
        volume: b.volume,
      });
      lastClose = newClose;
    }
  }
  return out;
}

/** Kagi：反转超过 reversal 才换向，连成 yang/yin 线 */
export function kagi(bars: Bar[], reversal: number): Bar[] {
  const out: Bar[] = [];
  if (bars.length === 0) return out;
  let dir: 0 | 1 | -1 = 0;
  let extremum = bars[0].close;
  for (const b of bars) {
    if (dir === 0) {
      dir = b.close >= extremum ? 1 : -1;
      out.push({
        time: b.time,
        open: extremum,
        high: Math.max(extremum, b.close),
        low: Math.min(extremum, b.close),
        close: b.close,
        volume: b.volume,
      });
      extremum = b.close;
      continue;
    }
    if (dir === 1) {
      if (b.close > extremum) {
        extremum = b.close;
        out.push({ time: b.time, open: extremum, high: b.close, low: b.close, close: b.close, volume: b.volume });
      } else if (b.close <= extremum - reversal) {
        dir = -1;
        extremum = b.close;
        out.push({ time: b.time, open: extremum, high: b.close, low: b.close, close: b.close, volume: b.volume });
      }
    } else {
      if (b.close < extremum) {
        extremum = b.close;
        out.push({ time: b.time, open: extremum, high: b.close, low: b.close, close: b.close, volume: b.volume });
      } else if (b.close >= extremum + reversal) {
        dir = 1;
        extremum = b.close;
        out.push({ time: b.time, open: extremum, high: b.close, low: b.close, close: b.close, volume: b.volume });
      }
    }
  }
  return out;
}

/** Line Break（N 新价）：最近 N 根收盘全部高于/低于上一块砖才换向出砖 */
export function lineBreak(bars: Bar[], lineCount = 3): Bar[] {
  const out: Bar[] = [];
  if (bars.length === 0) return out;
  let last = bars[0].close;
  for (let i = lineCount; i < bars.length; i++) {
    const window: number[] = [];
    for (let k = i - lineCount; k < i; k++) window.push(bars[k].close);
    const allHigher = window.every((c) => c > last);
    const allLower = window.every((c) => c < last);
    if (allHigher || allLower) {
      const c = bars[i].close;
      out.push({
        time: bars[i].time,
        open: last,
        high: Math.max(last, c),
        low: Math.min(last, c),
        close: c,
        volume: bars[i].volume,
      });
      last = c;
    }
  }
  return out;
}

/** Point & Figure：box 内波动忽略，突破 box 记一格，反转 reversal 格换向 */
export function pointAndFigure(bars: Bar[], boxSize: number, reversalBoxes = 3): Bar[] {
  const out: Bar[] = [];
  if (bars.length === 0) return out;
  const reversal = boxSize * reversalBoxes;
  let dir: 0 | 1 | -1 = 0;
  let col = bars[0].close;
  const push = (time: number, close: number, volume: number) => {
    out.push({ time, open: col, high: Math.max(col, close), low: Math.min(col, close), close, volume });
    col = close;
  };
  for (const b of bars) {
    if (dir === 0) {
      if (b.close >= col + boxSize) {
        dir = 1;
        while (col + boxSize <= b.close) push(b.time, col + boxSize, b.volume);
      } else if (b.close <= col - boxSize) {
        dir = -1;
        while (col - boxSize >= b.close) push(b.time, col - boxSize, b.volume);
      }
      continue;
    }
    if (dir === 1) {
      if (b.close >= col + boxSize) {
        while (col + boxSize <= b.close) push(b.time, col + boxSize, b.volume);
      } else if (b.close <= col - reversal) {
        dir = -1;
        while (col - boxSize >= b.close) push(b.time, col - boxSize, b.volume);
      }
    } else {
      if (b.close <= col - boxSize) {
        while (col - boxSize >= b.close) push(b.time, col - boxSize, b.volume);
      } else if (b.close >= col + reversal) {
        dir = 1;
        while (col + boxSize <= b.close) push(b.time, col + boxSize, b.volume);
      }
    }
  }
  return out;
}

/** Range：固定价格区间成 bar（日内区间突破） */
export function rangeBars(bars: Bar[], rangeSize: number): Bar[] {
  const out: Bar[] = [];
  if (bars.length === 0) return out;
  let cur: Bar | null = null;
  for (const b of bars) {
    if (!cur) {
      cur = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      continue;
    }
    cur.high = Math.max(cur.high, b.high);
    cur.low = Math.min(cur.low, b.low);
    cur.close = b.close;
    cur.volume += b.volume;
    if (cur.high - cur.low >= rangeSize) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 常用技术参数：ATR(14)，作为砖块/箱体默认尺寸 */
export function atr(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev));
    sum += tr;
    count++;
    if (count >= period) break;
  }
  return sum / Math.max(1, count);
}
