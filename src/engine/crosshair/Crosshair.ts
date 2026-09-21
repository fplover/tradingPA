import type { Bar } from '@/types/market';

/**
 * 十字光标状态：位置 + 吸附到的 K 线信息。
 * 由 ChartRenderer 在 pointermove 时更新，drawCrosshair 消费。
 */
export class Crosshair {
  x = 0;
  y = 0;
  visible = false;
  /** 吸附到的 bar index（-1 表示无） */
  barIndex = -1;
  time = 0;
  price = 0;

  set(x: number, y: number, barIndex: number, time: number, price: number): void {
    this.x = x;
    this.y = y;
    this.barIndex = barIndex;
    this.time = time;
    this.price = price;
    this.visible = true;
  }

  clear(): void {
    this.visible = false;
    this.barIndex = -1;
  }

  /** 光标下的 K 线（可能 undefined） */
  bar(series: { barAt(i: number): Bar | undefined }): Bar | undefined {
    return this.barIndex >= 0 ? series.barAt(this.barIndex) : undefined;
  }
}
