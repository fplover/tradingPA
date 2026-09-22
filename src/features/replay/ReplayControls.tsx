import { useEffect, useRef, useState } from 'react';
import { SkipBack, Play, Pause, SkipForward, X } from 'lucide-react';

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
      <IconBtn onClick={() => { onIndexChange(Math.max(0, barCount - 60)); setPlaying(false); }} title="复盘：从最后 60 根之前开始逐K回放">
        <Play size={15} />
      </IconBtn>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <IconBtn onClick={() => onIndexChange(Math.max(0, replayIndex - 1))} title="上一根">
        <SkipBack size={14} />
      </IconBtn>
      <IconBtn active={playing} onClick={() => setPlaying(!playing)} title={playing ? '暂停' : '播放'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </IconBtn>
      <IconBtn onClick={() => onIndexChange(Math.min(barCount - 1, replayIndex + 1))} title="下一根">
        <SkipForward size={14} />
      </IconBtn>
      <span style={{ color: 'var(--text-faint)', fontSize: 10, minWidth: 52, textAlign: 'center' }}>
        {replayIndex + 1} / {barCount}
      </span>
      <IconBtn onClick={() => { setPlaying(false); onIndexChange(null); }} title="退出复盘">
        <X size={14} />
      </IconBtn>
    </div>
  );
}

function IconBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 24,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--text-on-accent)' : 'var(--text-dim)',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
