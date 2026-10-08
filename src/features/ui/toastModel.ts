import { createContext, useContext } from 'react';

/** 全局操作反馈 Toast 的上下文与消费钩子（Toast.tsx 只留组件：
 *  Provider/宿主为组件，上下文与 useToast 属非组件导出，拆分至此保证 Fast Refresh）。
 *  用法：const toast = useToast(); toast('已加入自选股'); */

export type ToastKind = 'success' | 'info' | 'error';

/** 全局 Toast 上下文：ToastProvider 注入 push，各组件经 useToast 取用 */
export const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function useToast(): (text: string, kind?: ToastKind) => void {
  return useContext(ToastCtx);
}
