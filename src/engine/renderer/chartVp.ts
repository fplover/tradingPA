import type { Viewport } from '../viewport/Viewport';
import { VolumeProfileModel, type VolumeProfileParams } from '../profile/volumeProfile';

/** Volume Profile 运行态（P1-F）：状态挂 ChartState 实例，多图表布局互不干扰 */
export interface VolumeProfileRuntime {
  on: boolean;
  params: VolumeProfileParams;
  /** 数据纪元：applyData/updateBar 路径自增，进入 VP 缓存签名（蓝图 §2） */
  dataEpoch: number;
  model: VolumeProfileModel;
}

/** 渲染层取数：PaneRenderer 仅持 viewport getter，按 viewport 键取同图表的 VP 运行态 */
const vpRuntimeByViewport = new WeakMap<Viewport, VolumeProfileRuntime>();

export function vpRuntimeOf(viewport: Viewport): VolumeProfileRuntime | undefined {
  return vpRuntimeByViewport.get(viewport);
}

/** 图表构造期登记运行态（模块级 WeakMap 单例，按 viewport 隔离多图表 VP 状态） */
export function bindVpRuntime(viewport: Viewport, runtime: VolumeProfileRuntime): void {
  vpRuntimeByViewport.set(viewport, runtime);
}
