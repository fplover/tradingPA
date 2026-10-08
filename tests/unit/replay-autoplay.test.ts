// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nextAutoplayIndex, useReplayStore } from '@/store/replayStore';

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
