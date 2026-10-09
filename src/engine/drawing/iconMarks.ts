/**
 * 图标标记（二期-C2，「图标与表情」按 D3 裁决口径落地：**SVG 矢量图标标记**，
 * 非 emoji——P0 红线禁 emoji）。
 * 单一数据源：24×24 viewBox 的 SVG path 字符串，渲染层经 Path2D 以 canvas
 * stroke 绘制，设置对话框选择器以同 path 内联 SVG 展示——两处几何零漂移。
 */

export interface IconMarkDef {
  /** 中文标签（选择器展示） */
  label: string;
  /** 24×24 viewBox 的 SVG path（stroke 绘制；闭合/开放均可） */
  d: string;
}

/** 图标集（TV 图标工具的矢量子集；键存入 Drawing.style.text） */
export const ICON_MARK_PATHS: Readonly<Record<string, IconMarkDef>> = {
  'arrow-up': { label: '向上箭头', d: 'M12 4l6 7h-4v9h-4v-9H6z' },
  'arrow-down': { label: '向下箭头', d: 'M12 20l-6-7h4V4h4v9h4z' },
  flag: { label: '旗标', d: 'M6 21V3M6 4h11l-2.5 3.5L17 11H6' },
  star: {
    label: '星形',
    d: 'M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.1L12 17l-5.6 3 1.2-6.1L3 9.6l6.3-.8z',
  },
  check: { label: '对勾', d: 'M5 12l5 5L19 7' },
  cross: { label: '叉号', d: 'M6 6l12 12M18 6L6 18' },
  bell: { label: '铃铛', d: 'M12 4a5 5 0 0 1 5 5v4l2 3H5l2-3V9a5 5 0 0 1 5-5zM10 19a2 2 0 0 0 4 0' },
  target: {
    label: '靶心',
    d: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0',
  },
};

/** 默认图标键（与 types.ts 中 icon-mark defaultStyle.text 一致） */
export const ICON_MARK_DEFAULT = 'flag';

/** 图标键安全解析：未知键 / 非字符串回落默认（序列化恢复防呆） */
export function iconMarkKeyOf(styleText: string | undefined): string {
  return styleText && styleText in ICON_MARK_PATHS ? styleText : ICON_MARK_DEFAULT;
}
