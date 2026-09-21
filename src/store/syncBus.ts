/** 多图表联动的轻量事件总线（绕开 React，避免高频 setState） */
type CrosshairHandler = (time: number | null) => void;
type ViewportHandler = (v: { first: number; spacing: number }) => void;

const crosshairHandlers = new Set<CrosshairHandler>();
const viewportHandlers = new Set<ViewportHandler>();

export const syncBus = {
  onCrosshair(handler: CrosshairHandler): () => void {
    crosshairHandlers.add(handler);
    return () => crosshairHandlers.delete(handler);
  },
  emitCrosshair(time: number | null): void {
    for (const h of crosshairHandlers) h(time);
  },
  onViewport(handler: ViewportHandler): () => void {
    viewportHandlers.add(handler);
    return () => viewportHandlers.delete(handler);
  },
  emitViewport(v: { first: number; spacing: number }): void {
    for (const h of viewportHandlers) h(v);
  },
};
