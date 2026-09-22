import { useEffect, useRef, useState } from 'react';
import {
  Timer,
  ChevronDown,
  ChevronUp,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  MousePointerClick,
  Calendar,
  CalendarRange,
  Shuffle,
  X,
} from 'lucide-react';
import { useReplayStore } from '@/store/replayStore';

const SPEEDS = [1, 2, 4];
const BASE_INTERVAL = 300;

interface ReplayBarProps {
  barCount: number;
  intervalLabel: string;
  /** 按时间定位（选择日期） */
  onSeekToTime: (time: number) => void;
}

/** TV 风格底部回放工具条：回放计时菜单 + 步进/播放/倍速 */
export function ReplayBar({ barCount, intervalLabel, onSeekToTime }: ReplayBarProps) {
  const index = useReplayStore((s) => s.index);
  const playing = useReplayStore((s) => s.playing);
  const speed = useReplayStore((s) => s.speed);
  const selectMode = useReplayStore((s) => s.selectMode);
  const setIndex = useReplayStore((s) => s.setIndex);
  const setPlaying = useReplayStore((s) => s.setPlaying);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setSelectMode = useReplayStore((s) => s.setSelectMode);
  const exit = useReplayStore((s) => s.exit);

  const [menuOpen, setMenuOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // 播放：按倍速推进
  useEffect(() => {
    if (!playing || index === null || barCount < 2) return;
    const id = window.setInterval(() => {
      const next = index + 1;
      if (next >= barCount - 1) {
        setPlaying(false);
        return;
      }
      setIndex(next);
    }, BASE_INTERVAL / speed);
    return () => window.clearInterval(id);
  }, [playing, index, speed, barCount, setIndex, setPlaying]);

  // 点击菜单外关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // 未选 K 线时（选择中）也显示工具条，但隐藏走位控制
  const selecting = index === null;
  if (selecting && !selectMode) return null;

  const seekRandom = () => {
    const max = Math.max(1, barCount - 60);
    setIndex(Math.floor(Math.random() * max));
    setMenuOpen(false);
  };

  const applyDate = () => {
    if (!dateValue) return;
    const t = new Date(dateValue).getTime();
    if (!isNaN(t)) {
      onSeekToTime(t);
      setDatePickerOpen(false);
      setMenuOpen(false);
    }
  };

  return (
    <div style={barStyle}>
      {/* 回放计时下拉菜单 */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button style={btnStyle} onClick={() => setMenuOpen(!menuOpen)} title="回放计时">
          <Timer size={14} />
          <span style={{ marginLeft: 4 }}>回放计时</span>
          {menuOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {menuOpen && (
          <div style={menuStyle}>
            <MenuItem icon={<MousePointerClick size={14} />} label="选择K线" onClick={() => { setSelectMode(true); setMenuOpen(false); }} />
            <MenuItem icon={<Calendar size={14} />} label="选择日期" onClick={() => { setDatePickerOpen(true); setMenuOpen(false); }} />
            <MenuItem icon={<CalendarRange size={14} />} label="选择第一个可用日期" onClick={() => { setIndex(0); setMenuOpen(false); }} />
            <MenuItem icon={<Shuffle size={14} />} label="随机K线" onClick={seekRandom} />
          </div>
        )}
        {datePickerOpen && (
          <div style={datePopStyle}>
            <input
              type="datetime-local"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              style={dateInputStyle}
            />
            <button style={{ ...btnStyle, background: 'var(--accent)', color: 'var(--text-on-accent)' }} onClick={applyDate}>
              跳转
            </button>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

      {/* 步进 / 播放（选好 K 线后可用） */}
      {!selecting && (
        <>
          <button style={btnStyle} title="上一根" onClick={() => { setPlaying(false); setIndex(Math.max(0, index - 1)); }}>
            <SkipBack size={14} />
          </button>
          <button
            style={{ ...btnStyle, background: playing ? 'var(--accent)' : 'transparent', color: playing ? 'var(--text-on-accent)' : 'var(--text-dim)' }}
            title={playing ? '暂停' : '播放'}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button style={btnStyle} title="下一根" onClick={() => { setPlaying(false); setIndex(Math.min(barCount - 1, index + 1)); }}>
            <SkipForward size={14} />
          </button>

          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

          {/* 倍速 */}
          <select
            style={{ ...selectStyle, width: 56 }}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            title="播放倍速"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>

          {/* 周期 */}
          <span style={{ color: 'var(--text-dim)', fontSize: 12, padding: '0 6px' }}>{intervalLabel}</span>

          {/* 进度 */}
          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
            {index + 1} / {barCount}
          </span>
        </>
      )}

      {/* 选择中提示 */}
      {selectMode && selecting && (
        <span style={hintStyle}>
          <MousePointerClick size={12} /> 请在图表上点击选择 K 线作为回放起点
        </span>
      )}
      {selectMode && !selecting && (
        <span style={hintStyle}>
          <MousePointerClick size={12} /> 请在图表上点击选择 K 线
          <button style={{ ...btnStyle, padding: '0 4px' }} onClick={() => setSelectMode(false)} title="取消">
            <X size={12} />
          </button>
        </span>
      )}

      <div style={{ flex: 1 }} />

      <button style={btnStyle} title="退出回放" onClick={exit}>
        <X size={14} />
      </button>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '7px 10px',
        background: 'transparent',
        border: 'none',
        color: 'var(--text)',
        fontSize: 12,
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </button>
  );
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 36,
  padding: '0 10px',
  background: 'var(--panel)',
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
};

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  height: 26,
  padding: '0 7px',
  background: 'transparent',
  color: 'var(--text-dim)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};

const selectStyle: React.CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 12,
};

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 34,
  left: 0,
  width: 200,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 4,
  zIndex: 30,
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
};

const datePopStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 34,
  left: 0,
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 8,
  zIndex: 30,
};

const dateInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '4px 6px',
  fontSize: 12,
};

const hintStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: 'var(--accent)',
  color: 'var(--text-on-accent)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 11,
};
