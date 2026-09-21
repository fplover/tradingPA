/** 指标计算公共数学工具（输出数组与输入等长，前 period-1 项为 undefined） */

export function sma(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : undefined);
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  const k = 2 / (period + 1);
  let prev: number | undefined;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i < period - 1) {
      out.push(undefined);
      continue;
    }
    if (prev === undefined) {
      prev = sum / period; // 以 SMA 种子启动
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function wma(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(undefined);
      continue;
    }
    let sum = 0;
    for (let k = i - period + 1; k <= i; k++) sum += values[k] * (k - i + period); // 权重 1..period
    out.push(sum / denom);
  }
  return out;
}

export function stdev(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(undefined);
      continue;
    }
    let mean = 0;
    for (let k = i - period + 1; k <= i; k++) mean += values[k];
    mean /= period;
    let variance = 0;
    for (let k = i - period + 1; k <= i; k++) variance += (values[k] - mean) ** 2;
    out.push(Math.sqrt(variance / period));
  }
  return out;
}

export function highest(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(undefined);
      continue;
    }
    let m = -Infinity;
    for (let k = i - period + 1; k <= i; k++) if (values[k] > m) m = values[k];
    out.push(m);
  }
  return out;
}

export function lowest(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(undefined);
      continue;
    }
    let m = Infinity;
    for (let k = i - period + 1; k <= i; k++) if (values[k] < m) m = values[k];
    out.push(m);
  }
  return out;
}

/** Wilder 平滑（RSI/ATR/ADX 用） */
export function wilder(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  let prev: number | undefined;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(undefined);
      continue;
    }
    if (prev === undefined) {
      let sum = 0;
      for (let k = 0; k <= i; k++) sum += values[k];
      prev = sum / period;
    } else {
      prev = (prev * (period - 1) + values[i]) / period;
    }
    out.push(prev);
  }
  return out;
}

export function closes(bars: readonly { close: number }[]): number[] {
  return bars.map((b) => b.close);
}

export function typical(bars: readonly { high: number; low: number; close: number }[]): number[] {
  return bars.map((b) => (b.high + b.low + b.close) / 3);
}

/** 数值数组逐点运算 */
export function mapValues(
  a: Array<number | undefined>,
  fn: (v: number) => number,
): Array<number | undefined> {
  return a.map((v) => (v === undefined ? undefined : fn(v)));
}

export function combine(
  a: Array<number | undefined>,
  b: Array<number | undefined>,
  fn: (x: number, y: number) => number,
): Array<number | undefined> {
  return a.map((v, i) => {
    const w = b[i];
    return v === undefined || w === undefined ? undefined : fn(v, w);
  });
}
