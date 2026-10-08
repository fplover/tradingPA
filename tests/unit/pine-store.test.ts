// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { DRAFT_ID, usePineStore } from '@/store/pineStore';
import { clearPineAlerts, pineAlertsOf } from '@/indicators/pine/alerts';

/**
 * pineStore.save() 清理 DRAFT_ID 陈旧登记（第四轮审查低优先项）：
 * 草稿阶段 alertcondition 以 DRAFT_ID 登记，正式保存换 id 后旧登记残留 →
 * 保存成功即清除草稿登记，元数据只归新 id。
 */

const SRC = [
  'indicator("阳线指示", overlay=true)',
  'plot(close)',
  'alertcondition(close > open, title="阳线", message="出现阳线")',
].join('\n');

const STORAGE_KEY = 'tradingpa.pine.scripts';

describe('pineStore.save() 清理 DRAFT_ID 陈旧登记', () => {
  beforeEach(() => {
    // store 为模块级单例：显式复位内存态与草稿登记，防用例间串味
    localStorage.clear();
    usePineStore.setState({ scripts: [], editorSource: '', errors: [], draftName: null });
    clearPineAlerts(DRAFT_ID);
  });

  it('run() 草稿登记在 DRAFT_ID；save() 后迁到新 id 且草稿登记被清除', () => {
    usePineStore.getState().setEditorSource(SRC);
    expect(usePineStore.getState().run()).toBe(true);
    expect(pineAlertsOf(DRAFT_ID)).toHaveLength(1); // 草稿阶段以 DRAFT_ID 登记

    usePineStore.getState().save();
    const saved = usePineStore.getState().scripts;
    expect(saved).toHaveLength(1);
    const savedId = saved[0].id;
    expect(savedId).not.toBe(DRAFT_ID);
    expect(pineAlertsOf(savedId)).toEqual([{ key: 'a0', title: '阳线', message: '出现阳线', line: 3 }]);
    expect(pineAlertsOf(DRAFT_ID)).toEqual([]); // 陈旧登记不残留
  });

  it('同名覆盖保存（沿用已有 id）：新登记刷新、DRAFT_ID 同样被清除', () => {
    usePineStore.getState().setEditorSource(SRC);
    usePineStore.getState().run();
    usePineStore.getState().save();
    const id = usePineStore.getState().scripts[0].id;

    // 同名（indicator 名不变）改条件标题后再次 run → DRAFT_ID 重新登记；save 覆盖同 id
    usePineStore.getState().setEditorSource(SRC.replace('title="阳线"', 'title="阳线2"'));
    usePineStore.getState().run();
    expect(pineAlertsOf(DRAFT_ID)).toHaveLength(1);

    usePineStore.getState().save();
    expect(usePineStore.getState().scripts).toHaveLength(1); // 同名覆盖，不新增
    expect(usePineStore.getState().scripts[0].id).toBe(id);
    expect(pineAlertsOf(id)[0].title).toBe('阳线2');
    expect(pineAlertsOf(DRAFT_ID)).toEqual([]);
  });

  it('未 run 直接保存同样清草稿登记；旧脚本登记不受影响', () => {
    usePineStore.getState().setEditorSource(SRC);
    usePineStore.getState().save(); // 未经 run 直接保存
    const id1 = usePineStore.getState().scripts[0].id;
    expect(pineAlertsOf(DRAFT_ID)).toEqual([]);

    // 换成无 alertcondition 的脚本另存
    usePineStore.getState().setEditorSource('indicator("纯plot", overlay=true)\nplot(close)');
    usePineStore.getState().save();
    const id2 = usePineStore.getState().scripts[1].id;
    expect(pineAlertsOf(id2)).toEqual([]);
    expect(pineAlertsOf(id1)).toHaveLength(1); // 旧脚本登记不受影响
    expect(pineAlertsOf(DRAFT_ID)).toEqual([]);
  });

  it('保存失败（编译错误）不清登记：草稿态保留上次成功登记', () => {
    usePineStore.getState().setEditorSource(SRC);
    usePineStore.getState().run();
    expect(pineAlertsOf(DRAFT_ID)).toHaveLength(1);

    usePineStore.getState().setEditorSource('plot(1 +)'); // 语法错误
    usePineStore.getState().save();
    expect(usePineStore.getState().scripts).toHaveLength(0);
    expect(usePineStore.getState().errors.length).toBeGreaterThan(0);
    expect(pineAlertsOf(DRAFT_ID)).toHaveLength(1); // 未成功保存，不清理
  });

  it('落盘内容只含脚本列表（save 不影响持久化形状）', () => {
    usePineStore.getState().setEditorSource(SRC);
    usePineStore.getState().save();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ name: '阳线指示', source: SRC });
  });
});

/**
 * pineStore.remove() 清理被删脚本的 pine alerts 登记（OPEN-DECISIONS 在案项）：
 * 删除已保存脚本时 unregisterCustomDef 不清 pine alerts 注册表，被删脚本 id 的
 * alertcondition 登记残留 → 删除成功后同样注销该 id 的登记（save 路径同源处理）。
 */

describe('pineStore.remove() 清理被删脚本的 pine alerts 登记', () => {
  beforeEach(() => {
    localStorage.clear();
    usePineStore.setState({ scripts: [], editorSource: '', errors: [], draftName: null });
    clearPineAlerts(DRAFT_ID);
  });

  it('删除已保存脚本：登记随注销指标一并清除', () => {
    usePineStore.getState().setEditorSource(SRC);
    usePineStore.getState().save();
    const id = usePineStore.getState().scripts[0].id;
    expect(pineAlertsOf(id)).toHaveLength(1);

    usePineStore.getState().remove(id);
    expect(usePineStore.getState().scripts).toHaveLength(0);
    expect(pineAlertsOf(id)).toEqual([]);
  });

  it('删除不存在的 id：脚本列表与其他脚本登记均不动', () => {
    usePineStore.getState().setEditorSource(SRC);
    usePineStore.getState().save();
    const id = usePineStore.getState().scripts[0].id;

    usePineStore.getState().remove('pine_不存在的_id');
    expect(usePineStore.getState().scripts).toHaveLength(1);
    expect(pineAlertsOf(id)).toHaveLength(1);
  });

  it('删其中一个脚本不影响其他脚本的登记', () => {
    usePineStore.getState().setEditorSource(SRC);
    usePineStore.getState().save();
    const id1 = usePineStore.getState().scripts[0].id;

    // 同名覆盖走既有 id；换个 indicator 名另存得新 id
    usePineStore.getState().setEditorSource(SRC.replace('阳线指示', '阴线指示'));
    usePineStore.getState().save();
    const id2 = usePineStore.getState().scripts[1].id;
    expect(pineAlertsOf(id1)).toHaveLength(1);
    expect(pineAlertsOf(id2)).toHaveLength(1);

    usePineStore.getState().remove(id1);
    expect(usePineStore.getState().scripts.map((s) => s.id)).toEqual([id2]);
    expect(pineAlertsOf(id1)).toEqual([]);
    expect(pineAlertsOf(id2)).toHaveLength(1);
  });
});
