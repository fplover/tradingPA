import type { Drawing, DrawingPoint, DrawingTypeId } from './types';
import { getToolDef } from './types';

let seq = 0;

/**
 * 画线图层：持有全部画线 + 撤销/重做命令栈。
 * 只存世界坐标，渲染与命中测试由渲染层执行。
 */
export class DrawingLayer {
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private undoStack: Drawing[][] = [];
  private redoStack: Drawing[][] = [];
  private magnet = false;
  private magnetMode: 'weak' | 'strong' = 'weak';

  /** 是否开启磁吸（锚点吸附到 OHLC） */
  get magnetEnabled(): boolean {
    return this.magnet;
  }

  setMagnet(on: boolean): void {
    this.magnet = on;
  }

  /** 磁吸档位：weak 仅 50px 内吸附，strong 始终吸附（TV 默认 weak） */
  get mode(): 'weak' | 'strong' {
    return this.magnetMode;
  }

  setMagnetMode(mode: 'weak' | 'strong'): void {
    this.magnetMode = mode;
  }

  /** 供绘制的磁吸模式（未开启时 off） */
  get magnetModeForDraw(): 'off' | 'weak' | 'strong' {
    return this.magnet ? this.magnetMode : 'off';
  }

  list(): readonly Drawing[] {
    return this.drawings;
  }

  get selected(): Drawing | null {
    return this.drawings.find((d) => d.id === this.selectedId) ?? null;
  }

  select(id: string | null): void {
    this.selectedId = id;
  }

  private snapshot(): void {
    this.undoStack.push(this.drawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) })));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  add(type: DrawingTypeId, points: DrawingPoint[], styleOverride?: Partial<Drawing['style']>): Drawing {
    this.snapshot();
    const def = getToolDef(type);
    const drawing: Drawing = {
      id: `dw_${++seq}`,
      type,
      points,
      style: { ...def.defaultStyle, ...styleOverride },
      locked: false,
      visible: true,
    };
    this.drawings.push(drawing);
    this.selectedId = drawing.id;
    return drawing;
  }

  remove(id: string): void {
    this.snapshot();
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.selectedId === id) this.selectedId = null;
  }

  removeSelected(): void {
    if (this.selectedId) this.remove(this.selectedId);
  }

  clear(): void {
    this.snapshot();
    this.drawings = [];
    this.selectedId = null;
  }

  /** 一次交互前的历史快照（拖拽开始/放置前调用，避免中间态污染撤销栈） */
  beginHistory(): void {
    this.snapshot();
  }

  updatePoints(id: string, points: DrawingPoint[]): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d || d.locked) return;
    d.points = points;
  }

  updateStyle(id: string, style: Partial<Drawing['style']>): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    this.snapshot();
    d.style = { ...d.style, ...style };
  }

  setVisible(id: string, visible: boolean): void {
    const d = this.drawings.find((x) => x.id === id);
    if (d) d.visible = visible;
  }

  setLocked(id: string, locked: boolean): void {
    const d = this.drawings.find((x) => x.id === id);
    if (d) d.locked = locked;
  }

  /** 视觉顺序（TV 图例「更多」→ 视觉顺序）：数组末尾 = 最顶层 */
  setOrder(id: string, action: 'front' | 'forward' | 'backward' | 'back'): void {
    const from = this.drawings.findIndex((d) => d.id === id);
    if (from < 0) return;
    const drawings = [...this.drawings];
    const [moved] = drawings.splice(from, 1);
    let to: number;
    switch (action) {
      case 'front':
        to = drawings.length;
        break;
      case 'forward':
        to = Math.min(drawings.length, from + 1);
        break;
      case 'backward':
        to = Math.max(0, from - 1);
        break;
      default:
        to = 0;
    }
    drawings.splice(to, 0, moved);
    if (drawings.every((d, i) => d === this.drawings[i])) return;
    this.snapshot();
    this.drawings = drawings;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.drawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) })));
    this.drawings = prev;
    this.selectedId = null;
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.drawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) })));
    this.drawings = next;
    this.selectedId = null;
  }

  replaceAll(drawings: Drawing[]): void {
    this.snapshot();
    this.drawings = drawings;
    this.selectedId = null;
  }
}
