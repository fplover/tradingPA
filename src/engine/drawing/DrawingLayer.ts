import type { Drawing, DrawingPoint, DrawingTypeId } from './types';
import { getToolDef } from './types';

let seq = 0;

/**
 * 画线图层：持有全部画线 + 撤销/重做命令栈。
 * 只存世界坐标，渲染与命中测试由渲染层执行。
 * 选中态为多选集合（B7）：最后一个为主锚，兼容旧单选语义。
 */
export class DrawingLayer {
  private drawings: Drawing[] = [];
  private selectedIds: string[] = [];
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

  /** 主锚选中对象（多选集合的最后一个；无选中为 null） */
  get selected(): Drawing | null {
    const id = this.selectedIds[this.selectedIds.length - 1];
    return this.drawings.find((d) => d.id === id) ?? null;
  }

  /** 单选（替换整个多选集合；null = 清空） */
  select(id: string | null): void {
    this.selectedIds = id ? [id] : [];
  }

  /** 多选集合（副本，末尾为主锚） */
  get selectedIdList(): string[] {
    return [...this.selectedIds];
  }

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  /** Ctrl+点击：加入/移出多选集合（TV 行为） */
  toggleSelect(id: string): void {
    this.selectedIds = this.selectedIds.includes(id)
      ? this.selectedIds.filter((x) => x !== id)
      : [...this.selectedIds, id];
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
    this.selectedIds = [drawing.id];
    return drawing;
  }

  /** Ctrl+拖动克隆（B7）：同位置复制一份并选中克隆体，原对象坐标不动。
   *  调用方应先 beginHistory() 保证「克隆 + 拖拽」为单步撤销。 */
  cloneDrawing(id: string): Drawing | null {
    const src = this.drawings.find((d) => d.id === id);
    if (!src) return null;
    const clone = this.add(
      src.type,
      src.points.map((p) => ({ ...p })),
      { ...src.style },
    );
    if (src.levels) clone.levels = [...src.levels]; // 自定义档位随克隆复制
    return clone;
  }

  remove(id: string): void {
    this.snapshot();
    this.drawings = this.drawings.filter((d) => d.id !== id);
    this.selectedIds = this.selectedIds.filter((x) => x !== id);
  }

  /** 删除全部选中（多选；单步历史） */
  removeSelected(): void {
    if (this.selectedIds.length === 0) return;
    this.snapshot();
    const drop = new Set(this.selectedIds);
    this.drawings = this.drawings.filter((d) => !drop.has(d.id));
    this.selectedIds = [];
  }

  clear(): void {
    this.snapshot();
    this.drawings = [];
    this.selectedIds = [];
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

  /** 平移全部选中对象（方向键微调 / 多选整体拖拽用；跳过锁定对象）。
   *  历史快照由调用方按交互粒度管理（一次手势一步）。 */
  translateSelected(dt: number, dp: number): boolean {
    let moved = false;
    for (const d of this.drawings) {
      if (d.locked || !this.selectedIds.includes(d.id)) continue;
      d.points = d.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
      moved = true;
    }
    return moved;
  }

  updateStyle(id: string, style: Partial<Drawing['style']>): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    this.snapshot();
    d.style = { ...d.style, ...style };
  }

  /** 更新自定义分割档位（百分比小数；调用方（设置对话框）已去重且保证非空）。
   *  单步历史：与 updateStyle 同范式，快照后整组替换（旧数组不被原地修改，撤销可回退）。 */
  updateLevels(id: string, levels: number[]): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    this.snapshot();
    d.levels = [...levels];
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
    this.selectedIds = [];
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.drawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) })));
    this.drawings = next;
    this.selectedIds = [];
  }

  replaceAll(drawings: Drawing[]): void {
    this.snapshot();
    this.drawings = drawings;
    this.selectedIds = [];
  }
}
