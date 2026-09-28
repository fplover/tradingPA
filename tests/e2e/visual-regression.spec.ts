import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * A3-1 视觉回归黄金截图集（TV 对齐安全网第 1 层）。
 *
 * 覆盖表面（锁定清单，勿扩）：
 *   ① dark-default            深色主题默认视图（蜡烛图）
 *   ② light-default           浅色主题默认视图
 *   ③ candles-volume          蜡烛图 + 成交量副图
 *   ④ line-chart              线形图
 *   ⑤ area-chart              面积图
 *   ⑥ ma-macd                 主图 MA + 副图 MACD
 *   ⑦ crosshair-hover         十字光标悬停态（含图例 OHLCV 浮层）
 *   ⑧ drawings                一条趋势线 + 一条水平线画线态
 *   ⑨ layout-2-grid           2 格布局
 *   ⑩ axis-time-closeup       时间轴特写 / axis-price-closeup 价格轴特写
 *
 * 稳定性约定（防 flaky）：
 *   - deviceScaleFactor 锁 1（见 test.use）
 *   - page.addStyleTag 禁用 CSS 动画/transition
 *   - 每次截图前等 document.fonts.ready + __vh.frames 推进 ≥2（两个 rAF）
 *   - 数据走 harness 确定性模拟数据（固定基准时间 + 符号种子），不依赖真实 Binance
 *
 * 基线更新方法：
 *   UPDATE_SNAPSHOTS=1 npm run test:e2e -- visual-regression
 *   （等价 npx playwright test visual-regression --update-snapshots）
 *   基线文件位于 tests/e2e/__screenshots__/<name>.png，基线对应 commit 见提交说明。
 */

test.use({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === '1';
/** 像素差异容差：1% 像素 + 单像素色距 0.02（消化 AA 抖动；主题/结构变化必被抓） */
const MAX_DIFF_PIXEL_RATIO = 0.01;
const PIXEL_THRESHOLD = 0.02;

// 视觉截图含 dev server 冷路径 + 多工人并行争用，放宽单例超时（默认 30s 不够）
test.setTimeout(120_000);

const HARNESS_URL = '/tests/e2e/harness/visual-harness.html';

declare global {
  interface Window {
    __vh: {
      frames: number;
      setTheme(name: 'dark' | 'light'): void;
      setChartType(t: 'candles' | 'line' | 'area'): void;
      addIndicator(id: string): string | null;
      clearIndicators(): void;
      setLayout(n: number): void;
      setTool(t: string | null): void;
      clearDrawings(): void;
    };
  }
}

const framesNow = (page: Page): Promise<number> => page.evaluate(() => window.__vh.frames);

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS_URL);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  // 引擎首帧 + 两个 rAF 后才允许截图
  await expect.poll(() => framesNow(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
}

/** 等待帧计数推进 n 帧（状态变更 → invalidate → 下一 rAF 绘制） */
async function settle(page: Page, n = 2): Promise<void> {
  const start = await framesNow(page);
  await expect.poll(() => framesNow(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(start + n);
}

async function golden(
  page: Page,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<void> {
  if (UPDATE_SNAPSHOTS) {
    // 更新模式：直接落盘为基线（跳过比对）
    await page.screenshot({ path: fileURLToPath(new URL(`./__screenshots__/${name}.png`, import.meta.url)), clip });
    return;
  }
  // name 必须带 .png 扩展名（Playwright 据此判定 mimeType；配合 config 的
  // pathTemplate '{snapshotDir}/{arg}{ext}' 落盘为 __screenshots__/<name>.png）
  await expect(page).toHaveScreenshot(`${name}.png`, {
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    threshold: PIXEL_THRESHOLD,
    clip,
  });
}

test('① 深色主题默认视图', async ({ page }) => {
  await openHarness(page);
  await golden(page, 'dark-default');
});

test('② 浅色主题默认视图', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.__vh.setTheme('light'));
  await settle(page);
  await golden(page, 'light-default');
});

test('③ 蜡烛图 + 成交量副图', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.__vh.addIndicator('vol'));
  await settle(page);
  await golden(page, 'candles-volume');
});

test('④ 线形图', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.__vh.setChartType('line'));
  await settle(page);
  await golden(page, 'line-chart');
});

test('⑤ 面积图', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.__vh.setChartType('area'));
  await settle(page);
  await golden(page, 'area-chart');
});

test('⑥ 主图 MA + 副图 MACD', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => {
    window.__vh.addIndicator('sma');
    window.__vh.addIndicator('macd');
  });
  await settle(page, 3);
  await golden(page, 'ma-macd');
});

test('⑦ 十字光标悬停态（含图例 OHLCV 浮层）', async ({ page }) => {
  await openHarness(page);
  await page.mouse.move(600, 400); // 图表区内 → 十字光标 + 图例跟随悬停 bar
  await settle(page);
  await golden(page, 'crosshair-hover');
});

test('⑧ 一条趋势线 + 一条水平线画线态', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.__vh.setTool('trendline'));
  await page.mouse.click(300, 250);
  await page.mouse.click(620, 360);
  await page.evaluate(() => window.__vh.setTool('hline'));
  await page.mouse.click(420, 180);
  await page.evaluate(() => window.__vh.setTool(null));
  await settle(page, 3);
  await golden(page, 'drawings');
});

test('⑨ 2 格布局', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.__vh.setLayout(2));
  await settle(page, 3);
  await golden(page, 'layout-2-grid');
});

test('⑩ 时间轴 + 价格轴特写', async ({ page }) => {
  await openHarness(page);
  await settle(page);
  await golden(page, 'axis-time-closeup', { x: 0, y: 776, width: 640, height: 24 });
  await golden(page, 'axis-price-closeup', { x: 1216, y: 0, width: 64, height: 800 });
});
