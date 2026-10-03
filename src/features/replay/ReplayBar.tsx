import { useEffect, useState } from 'react';
import {
  Timer,
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
import { useTradeStore } from '@/features/trading/tradeStore';
import { Menu, MenuItem } from '@/ui/primitives';
import { barStyle, dateBadgeStyle, centerGroupStyle, btnStyle, orderBtn, qtyInput, sepStyle, selectStyle, datePopStyle, dateInputStyle, hintStyle } from './replayBarStyles';

const SPEEDS = [1, 2, 4];
const BASE_INTERVAL = 300;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 回放徽章时间：周四 2026-09-17 07:00（日线及以上只显日期） */
function formatBarTime(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const weekday = `周${WEEKDAYS[d.getDay()]}`;
  if (d.getHours() === 0 && d.getMinutes() === 0) return `回放：${weekday} ${date}`;
  return `回放：${weekday} ${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ReplayBarProps {
  barCount: number;
  intervalLabel: string;
  /** 当前回放 bar 的价格/时间（下单用） */
  price: number;
  time: number;
  /** 按时间定位（选择日期） */
  onSeekToTime: (time: number) => void;
}

/** 底部一体化回放工具条：左徽章 + 右置中回放控制 + 最右模拟下单（对齐 TV） */
export function ReplayBar({ barCount, intervalLabel, price, time, onSeekToTime }: ReplayBarProps) {
  const index = useReplayStore((s) => s.index);
  const playing = useReplayStore((s) => s.playing);
  const speed = useReplayStore((s) => s.speed);
  const selectMode = useReplayStore((s) => s.selectMode);
  const setIndex = useReplayStore((s) => s.setIndex);
  const setPlaying = useReplayStore((s) => s.setPlaying);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setSelectMode = useReplayStore((s) => s.setSelectMode);
  const exit = useReplayStore((s) => s.exit);

  const tradeVersion = useTradeStore((s) => s.version);
  const tradeEngine = useTradeStore((s) => s.engine);
  const place = useTradeStore((s) => s.place);
  const closePosition = useTradeStore((s) => s.closePosition);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [qty, setQty] = useState('0.01');

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

  // 未选 K 线时（选择中）也显示工具条，但隐藏走位/下单控制
  const selecting = index === null;
  if (selecting && !selectMode) return null;

  const seekRandom = () => {
    const max = Math.max(1, barCount - 60);
    setIndex(Math.floor(Math.random() * max));
  };

  const applyDate = () => {
    if (!dateValue) return;
    const t = new Date(dateValue).getTime();
    if (!isNaN(t)) {
      onSeekToTime(t);
      setDatePickerOpen(false);
    }
  };

  const quick = (side: 'buy' | 'sell') => {
    const q = Math.max(0, Number(qty) || 0);
    if (q <= 0 || price <= 0) return;
    place({ type: 'market', side, qty: q }, price, time);
  };


  void tradeVersion;
  const position = tradeEngine.position;

  return (
    <div style={barStyle}>
      {/* 左：回放日期徽章 */}
      {!selecting && <span style={dateBadgeStyle}>{formatBarTime(time)}</span>}

      <div style={{ flex: 1 }} />

      {/* 中：回放控制组（偏右居中） */}
      <div style={centerGroupStyle}>
        <Menu
          trigger={
            <button style={btnStyle} title="回放计时">
              <Timer size={14} />
              <span style={{ marginLeft: 4 }}>选择K线</span>
            </button>
          }
        >
          <MenuItem icon={<MousePointerClick size={14} />} onSelect={() => setSelectMode(true)}>
            选择K线
          </MenuItem>
          <MenuItem icon={<Calendar size={14} />} onSelect={() => setDatePickerOpen(true)}>
            选择日期
          </MenuItem>
          <MenuItem icon={<CalendarRange size={14} />} onSelect={() => setIndex(0)}>
            选择第一个可用日期
          </MenuItem>
          <MenuItem icon={<Shuffle size={14} />} onSelect={seekRandom}>
            随机K线
          </MenuItem>
        </Menu>
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

        {!selecting && (
          <>
            <div style={sepStyle} />
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
            <div style={sepStyle} />
            <select
              style={{ ...selectStyle, width: 52 }}
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
            <span style={{ color: 'var(--text-dim)', fontSize: 12, padding: '0 4px' }}>{intervalLabel}</span>
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
      </div>

      <div style={{ flex: 1 }} />

      {/* 右：模拟下单（对齐 TV 回放底条） */}
      {!selecting && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button style={{ ...orderBtn, background: 'var(--down)' }} onClick={() => quick('sell')} title="市价卖出/做空">
            卖出
          </button>
          <input value={qty} onChange={(e) => setQty(e.target.value)} style={qtyInput} title="数量" />
          <button style={{ ...orderBtn, background: 'var(--up)' }} onClick={() => quick('buy')} title="市价买入/做多">
            买入
          </button>
          <button
            style={{ ...orderBtn, background: position ? 'var(--warn)' : 'var(--panel-2)', color: position ? '#fff' : 'var(--text-faint)' }}
            onClick={() => position && closePosition(price, time)}
            title="市价平仓"
            disabled={!position}
          >
            平仓
          </button>
        </div>
      )}

      <button style={btnStyle} title="退出回放" onClick={exit}>
        <X size={16} />
      </button>
    </div>
  );
}
