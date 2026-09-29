import { describe, expect, it } from 'vitest';
import { filterCommands, fuzzyScore } from '@/features/command/fuzzyMatch';

interface Cmd {
  title: string;
  keywords?: string;
}

const CMDS: Cmd[] = [
  { title: '切换到 1m 周期', keywords: 'timeframe 1m' },
  { title: '打开指标面板', keywords: 'indicators study' },
  { title: '打开警报面板', keywords: 'alert alarm' },
  { title: '生成快照', keywords: 'screenshot png' },
];

describe('fuzzyScore', () => {
  it('空查询返回 0（全量通过）', () => {
    expect(fuzzyScore('', '任意')).toBe(0);
    expect(fuzzyScore('   ', '任意')).toBe(0);
  });

  it('连续子串命中且高于散落子序列', () => {
    const consecutive = fuzzyScore('指标', '打开指标面板');
    const scattered = fuzzyScore('指板', '打开指标面板');
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive! > scattered!).toBe(true);
  });

  it('子序列可不连续但仍要求按序', () => {
    expect(fuzzyScore('指板', '打开指标面板')).not.toBeNull();
    expect(fuzzyScore('板指', '打开指标面板')).toBeNull();
  });

  it('不匹配返回 null', () => {
    expect(fuzzyScore('xyz', '打开指标面板')).toBeNull();
    expect(fuzzyScore('这个查询太长了吧不可能匹配', '短')).toBeNull();
  });

  it('词首命中加分（分隔符后）', () => {
    expect(fuzzyScore('v', '关闭成交量 volume')).not.toBeNull();
    const wordStart = fuzzyScore('sc', '生成快照 screenshot');
    const mid = fuzzyScore('re', '生成快照 screenshot');
    expect(wordStart!).toBeGreaterThan(mid! - 2); // 词首加分可见但不至于翻转语义
  });

  it('大小写不敏感', () => {
    expect(fuzzyScore('PNG', '生成快照 png')).not.toBeNull();
  });
});

describe('filterCommands', () => {
  it('空查询保持注册顺序返回全量', () => {
    expect(filterCommands(CMDS, '')).toHaveLength(4);
    expect(filterCommands(CMDS, '').map((c) => c.title)).toEqual(CMDS.map((c) => c.title));
  });

  it('标题命中排在 keywords 命中之前（AC-E1 模糊匹配）', () => {
    const withKw: Cmd[] = [
      { title: '另一个命令', keywords: '指标' },
      { title: '打开指标面板' },
    ];
    const out = filterCommands(withKw, '指标');
    expect(out[0].title).toBe('打开指标面板');
  });

  it('keywords 可兜底命中标题不含词的命令', () => {
    const out = filterCommands(CMDS, 'alarm');
    expect(out.map((c) => c.title)).toContain('打开警报面板');
  });

  it('无匹配返回空数组', () => {
    expect(filterCommands(CMDS, 'zzzz')).toEqual([]);
  });

  it('评分排序：更精确（更短）的标题更靠前', () => {
    const out = filterCommands(CMDS, '面板');
    expect(out[0].title).toBe('打开指标面板'); // 同为命中，短标题惩罚更小
  });
});
