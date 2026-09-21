import { useEffect, useRef, useState } from 'react';

interface ReplayControlsProps {
  barCount: number;
  replayIndex: number | null;
  onIndexChange: (index: number | null) => void;
}

/** 复盘模式：逐 K 线回放（播放/暂停/步进/退出） */
export function ReplayControls({ barCount, replayIndex, onIndexChange }: ReplayControlsProps) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing || replayIndex === null) return;
    timerRef.current = window.setInterval(() => {
      const next = replayIndex + 1;
      if (next >= barCount - 1) {
        setPlaying(false);
        return;
      }
      onIndexChange(next);
    }, 300);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, replayIndex, barCount, onIndexChange]);

  if (replayIndex === null) {
    return (
      <button
        style={btnStyle}
        onClick={() => {
          onIndexChange(Math.max(0, barCount - 60));
          setPlaying(false);
        }}
        title="从最后 60 根之前开始逐K回放"
      >
        ▶ 复盘
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button style={btnStyle} onClick={() => onIndexChange(Math.max(0, replayIndex - 1))} title="上一根">
        ⏮
      </button>
      <button
        style={{ ...btnStyle, background: playing ? '#ff9800' : '#26a69a' }}
        onClick={() => setPlaying(!playing)}
        title={playing ? '暂停' : '播放'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button style={btnStyle} onClick={() => onIndexChange(Math.min(barCount - 1, replayIndex + 1))} title="下一根">
        ⏭
      </button>
      <span style={{ color: '#787b86', fontSize: 10 }}>
        {replayIndex + 1} / {barCount}
      </span>
      <button
        style={btnStyle}
        onClick={() => {
          setPlaying(false);
          onIndexChange(null);
        }}
        title="退出复盘"
      >
        退出
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#2a2e39',
  color: '#d1d4dc',
  border: 'none',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
};
