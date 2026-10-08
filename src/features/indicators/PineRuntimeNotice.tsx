import { TriangleAlert } from 'lucide-react';
import { fontSize, icon, radius, space } from '@/ui/tokens';

/**
 * Pine 脚本运行期错误提示条：编译期 dry-run 用默认参数发现不了「用户把周期改成 0」
 * 这类运行期错误，指标设置面板（图例齿轮入口）与 Pine 编辑器控制台共用此条展示。
 */

export function PineRuntimeNotice({ message }: { message: string }) {
  return (
    <div role="status" style={noticeStyle}>
      <TriangleAlert size={icon.md} style={{ flexShrink: 0 }} />
      <span style={{ lineHeight: 1.5 }}>运行期错误：{message}</span>
    </div>
  );
}

const noticeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: space.sm,
  marginBottom: space.md,
  padding: `${space.xs + 2}px ${space.sm}px`,
  background: 'var(--panel-2)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--warn)',
  fontSize: fontSize.sm,
};
