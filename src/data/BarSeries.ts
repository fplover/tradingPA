import type { Bar } from '@/types/market';

/**
 * K 线数据容器：时间升序、支持增量更新。
 * 与渲染层解耦：渲染只读，数据通过 append/update 流入。
 */
export class BarSeries {
  private bars: Bar[] = [];
  private lastTime = -Infinity;

  get length(): number {
    return this.bars.length;
  }

  get first(): Bar | undefined {
    return this.bars[0];
  }

  get last(): Bar | undefined {
    return this.bars[this.bars.length - 1];
  }

  barAt(index: number): Bar | undefined {
    return this.bars[index];
  }

  /** 可见区间切片 [from, to]（含端点，自动钳制） */
  slice(from: number, to: number): Bar[] {
    return this.bars.slice(Math.max(0, from), Math.min(this.bars.length - 1, to) + 1);
  }

  replace(bars: Bar[]): void {
    this.bars = bars;
    this.lastTime = bars.length > 0 ? bars[bars.length - 1].time : -Infinity;
  }

  /** 实时推送：同时间戳更新最后一根，新时间戳追加 */
  update(bar: Bar): void {
    if (this.bars.length === 0 || bar.time > this.lastTime) {
      this.bars.push(bar);
      this.lastTime = bar.time;
    } else if (bar.time === this.lastTime) {
      this.bars[this.bars.length - 1] = bar;
    }
    // 早于 lastTime 的乱序包直接丢弃
  }

  /** 二分查找 time 对应的 index，不存在返回 -1 */
  indexOfTime(time: number): number {
    let lo = 0;
    let hi = this.bars.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = this.bars[mid].time;
      if (t === time) return mid;
      if (t < time) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }
}
