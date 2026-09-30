/** 锚定落点状态机（P2-B AVWAP）：持有待锚定目标 uid 与放置/取消迁移。
 *  宿主（ChartController）负责把 begin/cancel 接到选 bar 模式路由上，
 *  本类只做状态迁移与放置分发——与 DrawingGesture 的放置态同范式，
 *  但不依赖 canvas/视图port，可单测。 */

/** 放置回调：uid + 落点 bar 时间（纪元毫秒） */
type PlaceFn = (uid: string, barTime: number) => void;

export class AnchorDropState {
  private uid: string | null = null;
  private place: PlaceFn | null = null;

  /** 是否有待锚定目标（选 bar 模式守卫用） */
  get active(): boolean {
    return this.uid !== null;
  }

  /** 当前待锚定目标 uid（无目标 null） */
  get target(): string | null {
    return this.uid;
  }

  /** 进入锚定落点：登记目标与放置回调（重复 begin 覆盖旧目标） */
  begin(uid: string, place: PlaceFn): void {
    this.uid = uid;
    this.place = place;
  }

  /** 落点：把 bar 时间写入目标并清空状态；无目标时返回 false（不消费） */
  drop(barTime: number): boolean {
    const uid = this.uid;
    const place = this.place;
    this.uid = null;
    this.place = null;
    if (uid === null || place === null) return false;
    place(uid, barTime);
    return true;
  }

  /** 取消锚定（Esc / 切换工具）：清空状态不放置 */
  cancel(): void {
    this.uid = null;
    this.place = null;
  }
}
