/**
 * Pine alertcondition 编译期注册表（P2-A③）：def id → 条件元数据。
 *
 * 职责边界：注册表只存编译期可确定的元数据（key/title/message/line），供警报
 * 面板列源。条件序列本身不走注册表——随 computeExtra 旁路按窗暴露（与
 * paint/shapes 同批次装配，见 program.ts lastRun 槽位）：警报 watcher 经
 * IndicatorInstance.computeWindow 取数，窗口脏缓存保证图例窗/绘制窗交替下
 * 不串窗（全局槽位在此场景会读到错窗数据）。
 */

/** 注册条件元数据（key 为 def 内稳定条件键，a0/a1/...） */
export interface PineAlertMeta {
  key: string;
  title: string;
  message: string;
  line: number;
}

const registry = new Map<string, PineAlertMeta[]>();

/** 编译期登记（dry-run 前调用；无条件脚本传空数组以清除陈旧登记） */
export function registerPineAlerts(defId: string, metas: PineAlertMeta[]): void {
  registry.set(defId, metas);
}

/** 编译失败时撤销登记（与 program.ts 的 metaMap 清理同步） */
export function clearPineAlerts(defId: string): void {
  registry.delete(defId);
}

/** 读取某自定义指标注册的 alertcondition 条件（警报面板列源用） */
export function pineAlertsOf(defId: string): PineAlertMeta[] {
  return registry.get(defId) ?? [];
}
