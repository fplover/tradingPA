/**
 * 画布管理器：封装 canvas 元素、2D 上下文与 devicePixelRatio 适配。
 * 所有绘制坐标使用 CSS 像素，内部自动放大到物理像素。
 */
export class CanvasManager {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private observer: ResizeObserver | null = null;
  private onResizeCb: ((width: number, height: number) => void) | null = null;

  width = 0;
  height = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  onResize(cb: (width: number, height: number) => void): void {
    this.onResizeCb = cb;
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.onResizeCb?.(this.width, this.height);
  }

  /** 每帧绘制前调用：重置变换到 CSS 像素坐标系 */
  beginFrame(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.onResizeCb = null;
  }
}
