/**
 * 系列渲染器 barrel：按绘制家族分模块（几何同构聚族），此处仅装配重导出。
 * 调用点（PaneRenderer / 单测）经本文件导入，模块拆分对调用方零改动。
 */
export { drawOhlc, drawHighLow } from './ohlcSeries';
export { drawLine, drawBaseline, drawStepLine, drawLineMarkers } from './lineSeries';
export { drawArea, drawHlcArea } from './areaSeries';
export { drawColumns, drawVolumeCandles } from './columnSeries';
