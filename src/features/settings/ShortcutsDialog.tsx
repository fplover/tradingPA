import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { fontSize, radius, shadow, space, zIndex } from '@/ui/tokens';

/** 快捷键分组：只收录本项目已实现的快捷键（与 Chart.tsx / App.tsx 实际绑定一致） */
const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: '图表',
    items: [
      ['快速搜索', 'Ctrl + K'],
      ['打开指标面板', 'Alt + D'],
      ['图表向左移动', '←'],
      ['图表向右移动', '→'],
      ['放大', 'Ctrl + ↑'],
      ['缩小', 'Ctrl + ↓'],
      ['重置图表视图', 'Alt + R'],
      ['对数坐标', 'Alt + L'],
      ['百分比坐标', 'Alt + P'],
      ['全屏模式', 'Shift + F'],
      ['生成快照', 'Alt + S'],
      ['复原 / 重做', 'Ctrl + Z / Ctrl + Y'],
    ],
  },
  {
    title: '警报与自选',
    items: [
      ['添加警报', 'Alt + A'],
      ['加入自选股', 'Alt + W'],
      ['添加文本注释', 'Alt + N'],
      ['隐藏所有图形', 'Ctrl + Alt + H'],
    ],
  },
  {
    title: '指标和绘图',
    items: [
      ['趋势线', 'Alt + T'],
      ['水平线', 'Alt + H'],
      ['水平射线', 'Alt + J'],
      ['垂直线', 'Alt + V'],
      ['斐波那契回撤', 'Alt + F'],
      ['矩形', 'Shift + Alt + R'],
      ['移除对象', 'Delete / Backspace'],
      ['完成路径 / 取消放置', 'Enter / Esc'],
    ],
  },
];

/** 键盘快捷键面板：对齐 TradingView「键盘快捷键」对话框，? 或 Shift + / 打开 */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} aria-describedby={undefined}>
          <div style={headerStyle}>
            <Dialog.Title style={titleStyle}>键盘快捷键</Dialog.Title>
            <Dialog.Close asChild>
              <button style={closeStyle} aria-label="关闭">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div className="tv-scroll" style={paneStyle}>
            {GROUPS.map((g) => (
              <section key={g.title} style={{ marginBottom: space.lg }}>
                <h3 style={groupTitleStyle}>{g.title}</h3>
                {g.items.map(([label, keys]) => (
                  <div key={label} style={rowStyle}>
                    <span style={{ color: 'var(--text)', fontSize: fontSize.md }}>{label}</span>
                    <span style={keysStyle}>{keys}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div style={footerStyle}>提示：在图表区域按 ? 可随时打开本面板</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: zIndex.modal };

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 480,
  maxHeight: '76vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: radius.lg,
  boxShadow: shadow.modal,
  zIndex: zIndex.modal,
  outline: 'none',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 44,
  padding: `0 ${space.lg}px`,
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = { color: 'var(--text)', fontSize: 16, fontWeight: 600 };

const closeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: 'transparent',
  border: 'none',
  borderRadius: radius.xs,
  color: 'var(--text-faint)',
  cursor: 'pointer',
};

const paneStyle: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: `${space.md}px ${space.xl}px` };

const groupTitleStyle: React.CSSProperties = {
  margin: `0 0 ${space.xs}px`,
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space.md,
  minHeight: 28,
};

const keysStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const footerStyle: React.CSSProperties = {
  padding: `${space.sm}px ${space.xl}px`,
  borderTop: '1px solid var(--border)',
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  flexShrink: 0,
};
