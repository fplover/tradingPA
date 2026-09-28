import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { icon, radius, shadow, space, zIndex } from '@/ui/tokens';

/** 全局操作反馈 Toast（TV 规格）：顶部居中深色 pill，150ms 淡入，3s 自动消失。
 *  用法：const toast = useToast(); toast('已加入自选股'); */

export type ToastKind = 'success' | 'info' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function useToast(): (text: string, kind?: ToastKind) => void {
  return useContext(ToastCtx);
}

const ICONS = { success: Check, info: Info, error: AlertTriangle } as const;

const KIND_COLOR = {
  success: 'var(--up)',
  info: 'var(--text-dim)',
  error: 'var(--down)',
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = ++seq.current;
    setToasts((ts) => [...ts, { id, kind, text }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <ToastHost toasts={toasts} />
    </ToastCtx.Provider>
  );
}

function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 46,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: space.sm,
        zIndex: zIndex.toast,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className="tv-toast"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space.sm,
              background: 'var(--tooltip-bg)',
              color: 'var(--tooltip-text)',
              fontSize: 13,
              lineHeight: '18px',
              padding: '6px 12px',
              borderRadius: radius.md,
              boxShadow: shadow.menu,
              maxWidth: 420,
            }}
          >
            <Icon size={icon.md} style={{ color: KIND_COLOR[t.kind], flexShrink: 0 }} />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
