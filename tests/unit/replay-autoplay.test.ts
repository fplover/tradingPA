// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nextAutoplayIndex, replayTickMs, REPLAY_SPEEDS, useReplayStore } from '@/store/replayStore';

/**
 * 低优先批修复：回放自动播放此前最高只到 barCount-2（ReplayBar 播放 effect 里
 * `next >= barCount - 1` 判停），与手动 stepping（Math.min(barCount - 1, ...)）不一致。
 * 修复后自动播放可到达最后一根（barCount-1），手动 stepping/回退行为不变。
 */

/** 按 ReplayBar 播放 effect 的步进逻辑驱动 store（纯函数裁决 + setIndex 写入） */
function runAutoplay(startIndex: number, barCount: number) {
  useReplayStore.getState().start(startIndex);
  useReplayStore.getState().setPlaying(true);
  for (let guard = 0; guard < 10_000; guard++) {
    const idx = useReplayStore.getState().index;
    if (idx === null) break;
    const next = nextAutoplayIndex(idx, barCount);
    if (next === null) {
      useReplayStore.getState().setPlaying(false);
      break;
    }
    useReplayStore.getState().setIndex(next);
  }
  return useReplayStore.getState();
}

describe('回放自动播放：步进裁决', () => {
  it('未到末柱：返回下一根 index', () => {
    expect(nextAutoplayIndex(0, 5)).toBe(1);
    expect(nextAutoplayIndex(3, 5)).toBe(4);
  });

  it('倒数第二根：仍能推进到最后一根（barCount-1）而非判停', () => {
    // 旧行为：index = barCount-2 时直接停止，自动播放最高只到 barCount-2
    expect(nextAutoplayIndex(4, 6)).toBe(5);
  });

  it('已在最后一根：再步进才停止（null）', () => {
    expect(nextAutoplayIndex(5, 6)).toBeNull();
    expect(nextAutoplayIndex(0, 1)).toBeNull();
  });
});

describe('回放自动播放：store 联动', () => {
  it('自动播放从起点跑到 barCount-1 后停止播放', () => {
    const barCount = 8;
    const st = runAutoplay(0, barCount);
    expect(st.index).toBe(barCount - 1);
    expect(st.playing).toBe(false);
  });

  it('从中间起点自动播放同样到达 barCount-1', () => {
    const barCount = 5;
    const st = runAutoplay(3, barCount);
    expect(st.index).toBe(barCount - 1);
    expect(st.playing).toBe(false);
  });

  it('store.setIndex 不钳制：手动 stepping 末根（barCount-1）可达', () => {
    useReplayStore.getState().start(0);
    useReplayStore.getState().setIndex(7);
    expect(useReplayStore.getState().index).toBe(7);
  });
});

/**
 * 三期-E1（2026-10-15 用户裁决「扩到 1/2/4/8」）：档位表从 ReplayBar 组件文件上移为
 * store 单一来源后的守卫。断言写成**与档位表的关系**而非裸档位——把表改回三档、
 * 把换算写成 `300 * speed`、或摘掉 setSpeed 的档位校验，都必须有断言变红。
 */
describe('回放倍速：档位表与 tick 换算同源', () => {
  // 本例依赖「此前无用例写过 speed」（replayStore 是模块级单例，文件内顺序即执行顺序）
  it('默认档即档位表首项（1x）', () => {
    expect(useReplayStore.getState().speed).toBe(REPLAY_SPEEDS[0]);
  });

  it('档位表为 1/2/4/8（下拉选项与换算共用同一引用）', () => {
    expect([...REPLAY_SPEEDS]).toEqual([1, 2, 4, 8]);
  });

  it('每档间隔 = 300ms / 倍速（8x 收到 37.5ms）', () => {
    for (const s of REPLAY_SPEEDS) expect(replayTickMs(s)).toBe(300 / s);
    expect(replayTickMs(8)).toBe(37.5);
  });

  it('倍速越高间隔越短（换算方向不得写反）', () => {
    expect(replayTickMs(8)).toBeLessThan(replayTickMs(1));
  });
});

describe('回放倍速：setSpeed 只收档位值', () => {
  it('档位值写入', () => {
    useReplayStore.getState().setSpeed(8);
    expect(useReplayStore.getState().speed).toBe(8);
    useReplayStore.getState().setSpeed(2);
    expect(useReplayStore.getState().speed).toBe(2);
  });

  it('越界档被忽略 ⇒ state.speed 恒为档位值，播放 effect 不会拿到非档位的除数', () => {
    useReplayStore.getState().setSpeed(4);
    for (const bad of [3, 0, -1, 1.5, 16, Number.NaN]) useReplayStore.getState().setSpeed(bad);
    expect(useReplayStore.getState().speed).toBe(4);
    expect(REPLAY_SPEEDS).toContain(useReplayStore.getState().speed);
  });
});
