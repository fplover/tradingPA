import { useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  BarChart3,
  BellRing,
  CalendarSearch,
  Copy,
  ListTree,
  Moon,
  RotateCcw,
  Settings,
  Star,
  Sun,
  Trash2,
  Type,
} from 'lucide-react';
import type { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import type { Instrument } from '@/types/instrument';
import { useAlertStore } from '@/store/alertStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useIndicatorStore } from '@/store/indicatorStore';
import { useRightDockStore } from '@/features/rightbar/rightPanelStore';
import { useThemeStore } from '@/store/themeStore';
import { useDrawingStore } from '@/store/drawingStore';
import { useToast } from '@/features/ui/Toast';
import { Modal } from '@/ui/primitives';
import { decimalsFor } from '@/data/format';
import { space } from '@/ui/tokens';
import {
  menuStyle,
  itemStyle,
  iconSlot,
  hintStyle,
  sepStyle,
  fieldStyle,
  fieldLabelStyle,
  inputStyle,
  ghostBtnStyle,
  primaryBtnStyle,
} from './chartContextMenuStyles';

export interface ChartMenuState {
  price: number;
  x: number;
  y: number;
}

interface ChartContextMenuProps {
  state: ChartMenuState | null;
  instrument: Instrument | null;
  renderer: ChartRenderer | null;
  onOpenSettings: () => void;
  /** 前往日期（Alt+G） */
  onGoToDate: () => void;
  onClose: () => void;
}

/** 图表右键菜单：对齐 TradingView 图表空白区菜单（重置/复制价格/警报/自选/注释/对象树/主题/移除/设置） */
export function ChartContextMenu({
  state,
  instrument,
  renderer,
  onOpenSettings,
  onGoToDate,
  onClose,
}: ChartContextMenuProps) {
  const [alertOpen, setAlertOpen] = useState(false);
  const themeName = useThemeStore((s) => s.name);
  const toast = useToast();

  const close = () => {
    setAlertOpen(false);
    onClose();
  };

  const copyPrice = async () => {
    if (!state) return;
    const d = decimalsFor(state.price, instrument?.decimals ?? 2);
    try {
      await navigator.clipboard.writeText(state.price.toFixed(d));
      toast(`已复制价格 ${state.price.toFixed(d)}`);
    } catch {
      /* 剪贴板不可用时静默失败，不阻断菜单其他动作 */
    }
    close();
  };

  return (
    <>
      <DropdownMenu.Root
        open={state !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DropdownMenu.Trigger asChild>
          <span
            aria-hidden
            style={{
              position: 'fixed',
              left: state?.x ?? 0,
              top: state?.y ?? 0,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={2} style={menuStyle}>
            <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={() => renderer?.resetView()}>
              <span style={iconSlot}>
                <RotateCcw size={14} />
              </span>
              重置图表
              <span style={hintStyle}>Alt + R</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={onGoToDate}>
              <span style={iconSlot}>
                <CalendarSearch size={14} />
              </span>
              前往日期…
              <span style={hintStyle}>Alt + G</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={copyPrice}>
              <span style={iconSlot}>
                <Copy size={14} />
              </span>
              复制价格{state ? ` ${state.price.toFixed(decimalsFor(state.price, instrument?.decimals ?? 2))}` : ''}
            </DropdownMenu.Item>
            <DropdownMenu.Separator style={sepStyle} />
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                setAlertOpen(true);
                onClose();
              }}
            >
              <span style={iconSlot}>
                <BellRing size={14} />
              </span>
              添加警报…
              <span style={hintStyle}>Alt + A</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                if (instrument) {
                  useWatchlistStore.getState().add(instrument);
                  toast(`已将 ${instrument.symbol} 加入自选股`);
                }
              }}
            >
              <span style={iconSlot}>
                <Star size={14} />
              </span>
              加入自选股
              <span style={hintStyle}>Alt + W</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator style={sepStyle} />
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                useDrawingStore.getState().setActiveTool('text');
              }}
            >
              <span style={iconSlot}>
                <Type size={14} />
              </span>
              添加文本注释
              <span style={hintStyle}>Alt + N</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                useRightDockStore.getState().open('objectTree');
              }}
            >
              <span style={iconSlot}>
                <ListTree size={14} />
              </span>
              对象树…
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => {
                useThemeStore.getState().toggle();
              }}
            >
              <span style={iconSlot}>{themeName === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</span>
              颜色主题
            </DropdownMenu.Item>
            <DropdownMenu.Separator style={sepStyle} />
            <DropdownMenu.Item
              className="tv-menu-item"
              style={{ ...itemStyle, color: 'var(--down)' }}
              onSelect={() => renderer?.clearDrawings()}
            >
              <span style={iconSlot}>
                <Trash2 size={14} />
              </span>
              移除画线
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="tv-menu-item"
              style={{ ...itemStyle, color: 'var(--down)' }}
              onSelect={() => useIndicatorStore.getState().replaceAll([])}
            >
              <span style={iconSlot}>
                <Trash2 size={14} />
              </span>
              移除指标
            </DropdownMenu.Item>
            <DropdownMenu.Separator style={sepStyle} />
            <DropdownMenu.Item
              className="tv-menu-item"
              style={itemStyle}
              onSelect={() => useIndicatorStore.getState().setPanelOpen(true)}
            >
              <span style={iconSlot}>
                <BarChart3 size={14} />
              </span>
              指标…
            </DropdownMenu.Item>
            <DropdownMenu.Item className="tv-menu-item" style={itemStyle} onSelect={onOpenSettings}>
              <span style={iconSlot}>
                <Settings size={14} />
              </span>
              设置…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* 警报对话框：TV 模型——右键价格预填，确认后创建 */}
      <ChartAlertDialog
        open={alertOpen}
        price={state?.price ?? 0}
        instrument={instrument}
        onClose={() => setAlertOpen(false)}
      />
    </>
  );
}

/** 图表右键 → 添加警报：价格预填 + 方向选择，实时生效 */
function ChartAlertDialog({
  open,
  price,
  instrument,
  onClose,
}: {
  open: boolean;
  price: number;
  instrument: Instrument | null;
  onClose: () => void;
}) {
  const add = useAlertStore((s) => s.add);
  const decimals = decimalsFor(price, instrument?.decimals ?? 2);
  const [text, setText] = useState(() => price.toFixed(decimals));
  const [direction, setDirection] = useState<'crossUp' | 'crossDown'>('crossUp');
  const toast = useToast();

  // 每次打开用最新右键价格重置（价格随 state 变化时才需要）
  const lastPrice = useRef(price);
  if (open && lastPrice.current !== price) {
    lastPrice.current = price;
    setText(price.toFixed(decimals));
  }

  const submit = () => {
    const p = Number(text);
    if (!instrument || !Number.isFinite(p) || p <= 0) return;
    add({
      symbol: instrument.symbol,
      source: { type: 'price' },
      threshold: p,
      condition: direction,
      frequency: 'once',
    });
    useRightDockStore.getState().open('alerts');
    toast(`已创建 ${instrument.symbol} ${direction === 'crossUp' ? '上穿' : '下穿'} ${p} 警报`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`添加警报${instrument ? ` · ${instrument.symbol}` : ''}`}
      width={320}
    >
      <label style={fieldStyle}>
        <span style={fieldLabelStyle}>价格</span>
        <input
          type="number"
          value={text}
          step={0.01}
          onChange={(e) => setText(e.target.value)}
          style={inputStyle}
          aria-label="警报价格"
        />
      </label>
      <label style={fieldStyle}>
        <span style={fieldLabelStyle}>条件</span>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'crossUp' | 'crossDown')}
          style={inputStyle}
          aria-label="警报条件"
        >
          <option value="crossUp">价格上穿</option>
          <option value="crossDown">价格下穿</option>
        </select>
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space.sm, marginTop: space.md }}>
        <button style={ghostBtnStyle} onClick={onClose}>
          取消
        </button>
        <button style={primaryBtnStyle} onClick={submit}>
          创建
        </button>
      </div>
    </Modal>
  );
}
