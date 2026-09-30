import { describe, it, expect } from 'vitest';
import { compilePine } from '@/indicators/pine/compile';
import { pineAlertsOf } from '@/indicators/pine/alerts';
import { IndicatorInstance } from '@/indicators/core/instance';
import { parseAlertsPayload, runAlertCheck, sampleKey, sourceKeyOf, type PriceAlert } from '@/features/alerts/alertLogic';
import { pineAlertSamples } from '@/features/alerts/useAlertWatcher';
import { BARS, CLOSES, compileOk } from './helpers/pine-fixture';

/**
 * P2-A③ alertcondition：编译期注册（元数据 + dry-run 前置）、computeExtra 条件
 * 序列旁路、pine 警报源（键/持久化/判定纯函数）、watcher 采样提取。
 * 注册表为模块级 Map：各用例用独立 def id 防串。
 */

const FROM = 0;
const TO = BARS.length - 1;

/** extra 中的 alertcondition 条目 */
function alertEntries(inst: IndicatorInstance): Array<{ key: string; title: string; message: string; cond: Array<number | undefined> | null }> {
  const { extra } = inst.computeWindow(BARS, FROM, TO);
  return (extra as Array<{ kind: string; key: string; title: string; message: string; cond: Array<number | undefined> | null }>).filter(
    (e) => e.kind === 'alertcondition',
  );
}

function pineAlert(patch: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: 'a1',
    symbol: 'BTCUSDT',
    source: { type: 'pine', indicatorId: 'pine_x', key: 'a0' },
    threshold: 1,
    condition: 'greater',
    active: true,
    triggered: false,
    createdAt: 1,
    frequency: 'once',
    cooldownMs: 30_000,
    ...patch,
  };
}

describe('P2-A③ alertcondition 编译期注册', () => {
  it('元数据进入注册表：key/title/message/line', () => {
    const id = 'pine-alert-meta';
    const r = compilePine(
      ['indicator("A", overlay=true)', 'plot(close)', 'alertcondition(close > open, title="阳线", message="出现阳线")'].join('\n'),
      id,
    );
    expect(r.def).not.toBeNull();
    expect(pineAlertsOf(id)).toEqual([
      { key: 'a0', title: '阳线', message: '出现阳线', line: 3 },
    ]);
  });

  it('多条件按序生成 a0/a1；message 缺省回落 title', () => {
    const id = 'pine-alert-multi';
    compilePine(
      ['plot(close)', 'alertcondition(close > open, title="甲")', 'alertcondition(close < open, title="乙", message="乙条件")'].join('\n'),
      id,
    );
    expect(pineAlertsOf(id)).toEqual([
      { key: 'a0', title: '甲', message: '甲', line: 2 },
      { key: 'a1', title: '乙', message: '乙条件', line: 3 },
    ]);
  });

  it('纯警报脚本（无 plot）可编译（TV 合法形态）', () => {
    const id = 'pine-alert-only';
    const r = compilePine('indicator("纯警报", overlay=true)\nalertcondition(ta.crossover(close, open), title="金叉")', id);
    expect(r.def).not.toBeNull();
    expect(r.def!.plots).toEqual([]);
    expect(pineAlertsOf(id)).toHaveLength(1);
  });

  it('重编译同 id 覆盖旧登记（含条件减少到零）', () => {
    const id = 'pine-alert-overwrite';
    compilePine('plot(close)\nalertcondition(close > open, title="A")', id);
    expect(pineAlertsOf(id)).toHaveLength(1);
    compilePine('plot(close)\nalertcondition(close > open, title="A")\nalertcondition(close < open, title="B")', id);
    expect(pineAlertsOf(id)).toHaveLength(2);
    compilePine('plot(close)', id);
    expect(pineAlertsOf(id)).toEqual([]);
  });

  it('语法错误不注册', () => {
    compilePine('plot(1 +)', 'pine-alert-syntax');
    expect(pineAlertsOf('pine-alert-syntax')).toEqual([]);
  });

  it('运行期错误脚本 dry-run 前置拦截，不注册', () => {
    const id = 'pine-alert-rt';
    const r = compilePine(
      ['n = ta.sma(close, 3) / 0', 'plot(close)', 'alertcondition(ta.sma(close, n) > 1, title="x")'].join('\n'),
      id,
    );
    expect(r.def).toBeNull();
    expect(r.errors[0].message).toContain('运行期校验失败');
    expect(pineAlertsOf(id)).toEqual([]);
  });

  it('cond 引用未定义变量 / 嵌套 → 编译期报错', () => {
    const r1 = compilePine('plot(close)\nalertcondition(flag)', 't');
    expect(r1.def).toBeNull();
    expect(r1.errors[0].message).toBe('未定义的标识符: flag');
    const r2 = compilePine('f(x) =>\n    alertcondition(x)\nplot(close)', 't');
    expect(r2.def).toBeNull();
    expect(r2.errors[0].message).toContain('alertcondition 必须在顶层');
  });
});

describe('P2-A③ computeExtra 条件序列旁路（窗口对齐）', () => {
  it('extra 暴露 alertcondition 条目：cond 与 bars 逐根对齐', () => {
    const inst = new IndicatorInstance(compileOk('plot(close)\nalertcondition(close > open, title="阳线", message="m")'));
    const entries = alertEntries(inst);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: 'a0', title: '阳线', message: 'm' });
    expect(entries[0].cond).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : 0)));
  });

  it('多条件各自独立序列', () => {
    const inst = new IndicatorInstance(
      compileOk('plot(close)\nalertcondition(close > open, title="up")\nalertcondition(close < open, title="down")'),
    );
    const entries = alertEntries(inst);
    expect(entries.map((e) => e.key)).toEqual(['a0', 'a1']);
    expect(entries[0].cond).toEqual(CLOSES.map((_, i) => (i % 2 === 1 ? 1 : 0)));
    expect(entries[1].cond).toEqual(CLOSES.map((_, i) => (i % 2 === 0 ? 1 : 0)));
  });

  it('watcher 窗命中脏缓存时 extra 仍返回本窗条件（不读全局 lastRun 槽位）', () => {
    const inst = new IndicatorInstance(compileOk('plot(close)\nalertcondition(close > open, title="阳线")'));
    // watcher 窗（末两根）先算：10..11
    inst.computeWindow(BARS, TO - 1, TO);
    // 图例窗（5..6）compute：覆盖全局 lastRun 槽位（若 watcher 读槽位此处即串窗）
    inst.computeWindow(BARS, 5, 6);
    // watcher 再算：bars/末 bar 未变 → 命中实例脏缓存，不触发 compute
    const { extra, ctxFrom } = inst.computeWindow(BARS, TO - 1, TO);
    const samples = pineAlertSamples(extra, ctxFrom, TO, 'S', 'pine_x', new Set(['a0']));
    expect(samples).toEqual([{ key: 'S:pine:pine_x:a0', value: 1 }]); // bar11 阳线
  });
});

describe('P2-A③ pine 警报源（键 / 持久化 / 判定）', () => {
  it('sourceKeyOf / sampleKey：pine 分支', () => {
    const src = { type: 'pine', indicatorId: 'pine_x', key: 'a0' } as const;
    expect(sourceKeyOf(src)).toBe('pine:pine_x:a0');
    expect(sampleKey('BTCUSDT', src)).toBe('BTCUSDT:pine:pine_x:a0');
  });

  it('parseAlertsPayload：v2 pine 条目正常装载', () => {
    const raw = JSON.stringify({
      version: 2,
      soundEnabled: true,
      alerts: [{ ...pineAlert() }],
    });
    const { alerts } = parseAlertsPayload(raw);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toEqual({ type: 'pine', indicatorId: 'pine_x', key: 'a0' });
  });

  it('parseAlertsPayload：v1 旧快照仍迁移为 price 源', () => {
    const raw = JSON.stringify([{ id: 'old', symbol: 'BTCUSDT', price: 100, direction: 'above' }]);
    const { alerts } = parseAlertsPayload(raw);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toEqual({ type: 'price' });
    expect(alerts[0].condition).toBe('greater');
  });

  it('parseAlertsPayload：pine 条目字段损坏则跳过', () => {
    const raw = JSON.stringify({
      version: 2,
      alerts: [{ ...pineAlert(), source: { type: 'pine', indicatorId: 'x' } as unknown as PriceAlert['source'] }],
    });
    expect(parseAlertsPayload(raw).alerts).toHaveLength(0);
  });

  it('runAlertCheck：条件采样为 1 → once 触发并停用；为 0 → 不触发', () => {
    const key = sampleKey('BTCUSDT', { type: 'pine', indicatorId: 'pine_x', key: 'a0' });
    const fired = runAlertCheck([pineAlert()], 'BTCUSDT', [{ key, value: 1 }], {}, 1000);
    expect(fired.fired).toHaveLength(1);
    expect(fired.alerts[0]).toMatchObject({ active: false, triggered: true });
    const calm = runAlertCheck([pineAlert()], 'BTCUSDT', [{ key, value: 0 }], {}, 1000);
    expect(calm.fired).toHaveLength(0);
    expect(calm.alerts[0]).toMatchObject({ active: true, triggered: false });
  });
});

describe('P2-A③ pineAlertSamples（watcher 采样纯函数）', () => {
  const MIXED = [
    { kind: 'bgcolor', color: '#f44336', cond: [1, 0], line: 2 },
    { kind: 'shape', style: 'circle', color: '#2196f3', cond: [1, 1], line: 3 },
    { kind: 'alertcondition', key: 'a0', title: 't', message: 'm', cond: [undefined, 1], line: 4 },
    { kind: 'alertcondition', key: 'a1', title: 't2', message: 'm2', cond: [0, 0], line: 5 },
  ];

  it('从混合 extra 取条件采样：kind/key 过滤 + 窗口对齐（to-ctxFrom）+ 非零为真', () => {
    const samples = pineAlertSamples(MIXED, 0, 1, 'BTCUSDT', 'pine_x', new Set(['a0', 'a1']));
    expect(samples).toEqual([
      { key: 'BTCUSDT:pine:pine_x:a0', value: 1 },
      { key: 'BTCUSDT:pine:pine_x:a1', value: 0 },
    ]);
  });

  it('只采样 keys 集合内的条件；undefined/NaN 不产出', () => {
    const samples = pineAlertSamples(MIXED, 0, 0, 'BTCUSDT', 'pine_x', new Set(['a0']));
    expect(samples).toEqual([]); // cond[0]=undefined
    const partial = pineAlertSamples(MIXED, 0, 1, 'BTCUSDT', 'pine_x', new Set(['a1']));
    expect(partial).toEqual([{ key: 'BTCUSDT:pine:pine_x:a1', value: 0 }]);
  });

  it('extra 为空/undefined → 空采样', () => {
    expect(pineAlertSamples(undefined, 0, 1, 'S', 'i', new Set(['a0']))).toEqual([]);
    expect(pineAlertSamples([], 0, 1, 'S', 'i', new Set(['a0']))).toEqual([]);
  });
});
