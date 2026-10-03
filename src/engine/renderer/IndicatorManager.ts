import { IndicatorInstance, type IndicatorOptions } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import { createPane, type PaneState } from './ChartState';

/**
 * 指标管理（D 批次拆分④；架构映射：ChartRenderer 指标区，蓝图独立行 L296-358）。
 * 只做 pane 数组上的指标生命周期；面板数组经访问器注入（增删会整体替换，
 * 不能快照），选中面板回落与重绘请求经同一宿主上送。
 */

/** 激活指标摘要（供 UI 列表与模板持久化） */
export interface IndicatorInfo {
  uid: string;
  id: string;
  name: string;
  overlay: boolean;
  params: Record<string, string | number | boolean>;
}

/** 指标管理宿主契约（ChartState 提供同构实现） */
export interface IndicatorHost {
  /** 面板数组访问器（get 每次读最新；set 用于过滤移除后的整体替换） */
  panes: { get(): PaneState[]; set(panes: PaneState[]): void };
  /** 选中面板 id 访问器（面板被移除时回落主面板） */
  selectedPaneId: { get(): string; set(id: string): void };
  invalidate(): void;
  /** Volume Profile（profile 标记 def）专用通路：状态挂图表级，不建实例/面板 */
  vp: {
    getState(): { on: boolean; params: Record<string, string | number | boolean> };
    setVolumeProfile(on: boolean, params?: Record<string, string | number | boolean>): void;
  };
}

/** Volume Profile 固定 uid（单图表实例至多一份，add/remove/update/list 由此路由） */
const VP_UID = 'vp';

export class IndicatorManager {
  constructor(private host: IndicatorHost) {}

  /** 添加指标：overlay 进主面板，否则新建独立副图面板。返回实例 uid */
  add(id: string, options?: IndicatorOptions): string | null {
    const def = getIndicatorDef(id);
    if (!def) return null;
    // profile 标记（Volume Profile）：不建实例不建面板，切图表级状态 + 挂参数（P1-F §4）
    if (def.profile) {
      this.host.vp.setVolumeProfile(true, options?.params);
      this.host.invalidate();
      return VP_UID;
    }
    const instance = new IndicatorInstance(def, options);
    const panes = this.host.panes.get();
    if (def.overlay) {
      panes[0].indicators.push(instance);
    } else {
      panes.push(createPane(`pane_${instance.uid}`, 'indicator', 1));
      panes[panes.length - 1].indicators.push(instance);
    }
    this.host.invalidate();
    return instance.uid;
  }

  remove(uid: string): void {
    if (uid === VP_UID) {
      if (this.host.vp.getState().on) this.host.vp.setVolumeProfile(false);
      this.host.invalidate();
      return;
    }
    const panes = this.host.panes.get();
    for (const pane of panes) {
      const idx = pane.indicators.findIndex((i) => i.uid === uid);
      if (idx >= 0) pane.indicators.splice(idx, 1);
    }
    // 指标面板空了就移除
    this.host.panes.set(panes.filter((p) => !(p.kind === 'indicator' && p.indicators.length === 0)));
    // 选中面板被移除时回落主面板
    if (!this.host.panes.get().some((p) => p.id === this.host.selectedPaneId.get())) {
      this.host.selectedPaneId.set(this.host.panes.get()[0]?.id ?? 'main');
    }
    this.host.invalidate();
  }

  update(uid: string, options: IndicatorOptions): void {
    if (uid === VP_UID) {
      this.host.vp.setVolumeProfile(true, options.params);
      this.host.invalidate();
      return;
    }
    for (const pane of this.host.panes.get()) {
      const inst = pane.indicators.find((i) => i.uid === uid);
      if (inst) {
        inst.applyOptions(options);
        this.host.invalidate();
        return;
      }
    }
  }

  /** 全部激活指标（供 UI 列表；VP 开启时以固定 uid 追加，模板持久化同通路） */
  list(): IndicatorInfo[] {
    const out: IndicatorInfo[] = [];
    for (const pane of this.host.panes.get()) {
      for (const inst of pane.indicators) {
        out.push({ uid: inst.uid, id: inst.id, name: inst.name, overlay: inst.overlay, params: inst.params });
      }
    }
    const vp = this.host.vp.getState();
    if (vp.on) {
      const def = getIndicatorDef('volume-profile');
      out.push({
        uid: VP_UID,
        id: 'volume-profile',
        name: def?.name ?? 'Volume Profile',
        overlay: true,
        params: vp.params,
      });
    }
    return out;
  }

  /** 默认指标组合模板（localStorage 由 UI 层持久化） */
  exportTemplate(): Array<{ id: string; params: Record<string, string | number | boolean> }> {
    return this.list().map(({ id, params }) => ({ id, params }));
  }

  importTemplate(list: Array<{ id: string; params?: Record<string, string | number | boolean> }>): void {
    this.host.vp.setVolumeProfile(false); // 模板不含 VP 时清位，含 VP 时由 add 分支重挂
    for (const pane of this.host.panes.get()) pane.indicators = [];
    this.host.panes.set(this.host.panes.get().filter((p) => p.kind !== 'indicator'));
    for (const item of list) this.add(item.id, { params: item.params });
  }
}
