// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { drawWatermark, watermarkText } from '@/engine/renderer/drawWatermark';
import { theme, setTheme } from '@/engine/theme';
import { asCtx, callsOf, createMockCtx, fillTexts, propSets } from './helpers/mock-ctx';

/**
 * 画布水印单测（P2 画布级特性）：文本组装口径 + mock ctx 绘制断言
 * （居中/字号缩放/主题色/空文本短路）+ theme token 双主题双值。
 */

describe('watermarkText：商品代码 + 周期', () => {
  it('symbol · interval，与图例首行同分隔符', () => {
    expect(watermarkText({ symbol: 'BTCUSDT', interval: '1D' })).toBe('BTCUSDT · 1D');
    expect(watermarkText({ symbol: 'AAPL', interval: '5m' })).toBe('AAPL · 5m');
  });
});

describe('drawWatermark：mock ctx 绘制', () => {
  const geo = { chartW: 800, chartH: 400 };

  it('居中绘制：面板几何中心、TV 字体、主题水印色', () => {
    const ctx = createMockCtx();
    drawWatermark(asCtx(ctx), 'BTCUSDT · 1D', geo);
    expect(fillTexts(ctx)).toEqual(['BTCUSDT · 1D']);
    expect(callsOf(ctx, 'fillText')[0][1]).toBe(400);
    expect(callsOf(ctx, 'fillText')[0][2]).toBe(200);
    expect(propSets(ctx, 'fillStyle')).toEqual([theme.watermark]);
    expect(propSets(ctx, 'font')[0]).toContain('Trebuchet MS');
    expect(propSets(ctx, 'textAlign')).toEqual(['center']);
    expect(propSets(ctx, 'textBaseline')).toEqual(['middle']);
    // save/restore 成对，不污染调用方 ctx 状态
    expect(callsOf(ctx, 'save')).toHaveLength(1);
    expect(callsOf(ctx, 'restore')).toHaveLength(1);
  });

  it('字号随面板缩放：大面板取上限 72，小面板取下限 24', () => {
    const big = createMockCtx();
    drawWatermark(asCtx(big), 'X', { chartW: 1800, chartH: 900 });
    expect(String(propSets(big, 'font')[0]).startsWith('72px ')).toBe(true);
    const small = createMockCtx();
    drawWatermark(asCtx(small), 'X', { chartW: 120, chartH: 60 });
    expect(String(propSets(small, 'font')[0]).startsWith('24px ')).toBe(true);
  });

  it('文本超宽：收缩字号至面板 90% 宽度内（120px 宽、文本宽 120px → 24→22px）', () => {
    const ctx = createMockCtx();
    drawWatermark(asCtx(ctx), '12345678901234567890', { chartW: 120, chartH: 400 });
    // mock measureText：宽 = 字符数 × 6 = 120 > 108 → size = round(24 × 108 / 120) = 22
    const fonts = propSets(ctx, 'font').map(String);
    expect(fonts[fonts.length - 1].startsWith('22px ')).toBe(true);
    expect(fillTexts(ctx)).toEqual(['12345678901234567890']);
  });

  it('空文本：零绘制（不发任何 ctx 调用）', () => {
    const ctx = createMockCtx();
    drawWatermark(asCtx(ctx), '', geo);
    expect(ctx.calls).toHaveLength(0);
  });
});

describe('theme.watermark：双主题 token', () => {
  it('深/浅各一值，均为带透明度的 rgba 且强度克制（不干扰行情）', () => {
    setTheme('dark');
    const dark = theme.watermark;
    setTheme('light');
    const light = theme.watermark;
    expect(dark).not.toBe(light);
    for (const v of [dark, light]) {
      expect(v).toMatch(/^rgba\(/);
      const alpha = Number(v.match(/,\s*([\d.]+)\s*\)$/)![1]);
      expect(alpha).toBeGreaterThan(0.04);
      expect(alpha).toBeLessThanOrEqual(0.2);
    }
  });

  it('renderer 使用点只引用 token：水印 fillStyle 恒等于 theme.watermark', () => {
    setTheme('dark');
    const darkW = theme.watermark;
    const ctx = createMockCtx();
    drawWatermark(asCtx(ctx), 'BTCUSDT · 1D', { chartW: 800, chartH: 400 });
    expect(propSets(ctx, 'fillStyle')).toEqual([darkW]);
  });
});
