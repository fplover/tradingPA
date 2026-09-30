/** AVWAP 锚定落点编排（P2-B 红线拆分）：ChartController 的 AVWAP 接线整体迁入——
 *  添加进入选 bar 模式、移除/切工具/Esc 放弃、改色锚点保持，落点把 bar 时间写回实例。
 *  状态迁移复用 AnchorDropState（drawing/anchorDrop.ts），宿主依赖经窄契约注入，
 *  与 PaneRenderHost 同范式：本类不碰 canvas/视图 port，可单测。 */
import type { IndicatorInstance, IndicatorOptions } from '@/indicators/core/instance';
import { AnchorDropState } from '../drawing/anchorDrop';

/** AvwapAnchorDrop 宿主契约（ChartController 提供；箭头函数引用 this，随图表状态变化） */
export interface AvwapAnchorHost {
  /** 按 uid 找指标实例（锚点保持合并用；不建索引，面板数量极小） */
  lookupIndicator(uid: string): IndicatorInstance | undefined;
  /** 选 bar 模式开关（on + 落点点击回调；false = 退出） */
  setBarSelectMode(on: boolean, cb: ((index: number) => void) | null): void;
  /** 落点解析：视口 index → bar 时间（纪元毫秒）；无 bar 返回 null */
  barTimeAt(index: number): number | null;
  /** 落点写回：把 bar 时间写为实例锚点（host 侧经 updateIndicator 保持链路），
   *  并经 indicatorParamsCallback 同帧写回 indicatorStore（P2-D③ 持久化） */
  onAnchored(uid: string, barTime: number): void;
  /** 请求重绘（进入选 bar 模式后刷新界面） */
  invalidate(): void;
}

export class AvwapAnchorDrop {
  /** 锚定落点状态机：active = 选 bar 模式由 AVWAP 持有 */
  private drop = new AnchorDropState();

  constructor(private host: AvwapAnchorHost) {}

  /** addIndicator 接线：avwap 且无 anchorTime 参数 → 进入选 bar 模式，
   *  图表点击落点即为锚定 bar（复用画线锚定落点交互：与 fib-auto 同款的
   *  「单击图表解析 bar」模式）；已带锚点添加不劫持点击。 */
  maybeBegin(id: string, uid: string | null, options?: IndicatorOptions): void {
    if (id !== 'avwap' || !uid || options?.params?.anchorTime !== undefined) return;
    this.drop.begin(uid, (u, barTime) => this.host.onAnchored(u, barTime));
    this.host.setBarSelectMode(true, (idx) => {
      const barTime = this.host.barTimeAt(idx);
      if (barTime !== null) this.drop.drop(barTime);
    });
    this.host.invalidate();
  }

  /** removeIndicator 接线：被锚定的实例被移除 → 退出选 bar 模式（回调目标已不存在） */
  maybeCancel(uid: string): void {
    if (this.drop.target !== uid) return;
    this.drop.cancel();
    this.host.setBarSelectMode(false, null);
  }

  /** updateIndicator 接线：avwap 锚点保持——store 侧参数不含 anchorTime 时
   *  沿用实例当前值（UI 改色不丢锚）；非 avwap 或缺 params 原样返回。 */
  mergeAnchorParam(uid: string, options: IndicatorOptions): IndicatorOptions {
    const inst = this.host.lookupIndicator(uid);
    if (inst?.id === 'avwap' && options.params && options.params.anchorTime === undefined) {
      return { ...options, params: { ...options.params, anchorTime: inst.params.anchorTime } };
    }
    return options;
  }

  /** setActiveTool / cancelPlacing（Esc）接线：锚定落点进行中 = 放弃锚定，
   *  退出选 bar 模式且不写锚点。 */
  cancelIfActive(): void {
    if (!this.drop.active) return;
    this.drop.cancel();
    this.host.setBarSelectMode(false, null);
  }
}
