import { useState } from 'react';
import { Modal } from '@/ui/primitives';
import { useWatchlistStore } from '@/store/watchlistStore';
import { control, fontSize, radius, space } from '@/ui/tokens';

/** 重命名当前自选股列表 */
export function RenameListDialog({
  listId,
  initialName,
  onClose,
}: {
  listId: string;
  initialName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const renameList = useWatchlistStore((s) => s.renameList);

  const submit = () => {
    if (!name.trim()) return;
    renameList(listId, name);
    onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="重命名列表"
      width={300}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        aria-label="列表名称"
        style={{
          width: '100%',
          height: control.hLg,
          padding: `0 ${space.sm}px`,
          background: 'var(--input-bg)',
          border: '1px solid var(--border)',
          borderRadius: radius.sm,
          color: 'var(--text)',
          fontSize: fontSize.md,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space.sm, marginTop: space.lg }}>
        <button onClick={onClose} style={ghostBtnStyle}>
          取消
        </button>
        <button onClick={submit} style={primaryBtnStyle}>
          保存
        </button>
      </div>
    </Modal>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  height: control.hLg,
  padding: `0 ${space.md}px`,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text-dim)',
  fontSize: fontSize.md,
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  height: control.hLg,
  padding: `0 ${space.md}px`,
  background: 'var(--accent)',
  border: 'none',
  borderRadius: radius.sm,
  color: 'var(--text-on-accent)',
  fontSize: fontSize.md,
  cursor: 'pointer',
};
