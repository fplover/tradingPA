import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { ChartTypeId, TimeframeId } from '@/types/market';

/**
 * A3-1 视觉回归黄金截图集（TV 对齐安全网第 1 层）。
 *
 * 覆盖表面（锁定清单）：
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
 *   ⑪ columns-chart           B4 柱状图
 *   ⑫ high-low-chart          B4 高低图
 *   ⑬ step-line-chart         B4 阶梯线（--accent 令牌蓝）
 *   ⑭ line-markers-chart      B4 带标记线形（--accent 令牌蓝）
 *   ⑮ hlc-area-chart          B4 HLC 面积（--accent 令牌蓝）
 *   ⑯ volume-candles-chart    B4 成交量蜡烛
 *   ⑰ countdown-badge         B3 收盘倒计时徽章（时变语义——禁像素基线，双态差分断言）
 *   ⑱ timeframe-2m            B5 2 分钟档位（1m 种子聚合渲染）
 *   ⑲ timeframe-45m           B5 45 分钟档位（1m 种子聚合渲染）
 *
 * 稳定性约定（防 flaky）：
 *   - deviceScaleFactor 锁 1（见 test.use）
 *   - page.addStyleTag 禁用 CSS 动画/transition
 *   - 每次截图前等 document.fonts.ready + __vh.frames 推进 ≥2（两个 rAF）
 *   - 数据走 harness 确定性模拟数据（固定基准时间 + 符号种子），不依赖真实 Binance
 *   - Date.now 冻结在「末 bar 收盘后」（B3 护栏）：倒计时不绘制，基线纯数据驱动
 *   - B4 三个 accent 依赖型（step-line/line-markers/hlc-area）：harness 页面不引
 *     global.css，body.theme-dark 下 --accent 令牌缺失会使 seriesLineColor 回落
 *     theme.up（青）；截图前必须注入 /src/styles/global.css 并 setTheme('dark')，
 *     线色才是令牌蓝 #2962ff（与 App 运行环境一致）
 *
 * 基线更新方法：
 *   UPDATE_SNAPSHOTS=1 npm run test:e2e -- visual-regression
 *   （等价 npx playwright test visual-regression --update-snapshots）
 *   注意：UPDATE 模式会重写全部表面基线——只应在「预期行为变化」时使用，
 *   且须单独评审测试/基线 diff（反作弊门禁）。增量采集用 --grep 限定新表面。
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
      setChartType(t: ChartTypeId): void;
      setTimeframe(id: TimeframeId): void;
      addIndicator(id: string): string | null;
      clearIndicators(): void;
      setLayout(n: number): void;
      setTool(t: string | null): void;
      clearDrawings(): void;
      setFrozenNow(ts: number): void;
      countdownProbe(): { lastBarTime: number; closeTime: number };
      axisTextRgb(): [number, number, number];
      barCount(): number;
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

/**
 * 注入 App 运行环境样式（B4 accent 依赖型专用）：harness 页面自身不引 global.css，
 * body.theme-dark 下 --accent 令牌缺失 → seriesLineColor 回落 theme.up（青 #26a69a）
 * 而非令牌蓝 #2962ff。注入样式表并落到 dark 主题类后，阶梯线/带标记线形/HLC 面积
 * 的线色才与 App 一致。seriesLineColor 按 body.className 缓存，故须先于
 * setChartType 执行。不影响只取 theme.up/down 的渲染器（columns/high-low/volume-candles）。
 */
async function withAppTheme(page: Page): Promise<void> {
  await page.addStyleTag({ url: '/src/styles/global.css' });
  await page.evaluate(() => window.__vh.setTheme('dark'));
  await settle(page);
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

/**
 * A3-1 扩容表面（B4 六图表类型 + B3 收盘倒计时 + B5 新档位）。
 * 采集：UPDATE_SNAPSHOTS=1 npx playwright test visual-regression --grep 扩容
 * （限定新表面，避免误覆盖既有 10 表面基线——反作弊门禁：基线变更须单独评审）
 */
test.describe('A3-1 扩容（B4 六类型 + B3 倒计时 + B5 新档位）', () => {
  test('⑪ 柱状图（columns）', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.__vh.setChartType('columns'));
    await settle(page);
    await golden(page, 'columns-chart');
  });

  test('⑫ 高低图（high-low）', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.__vh.setChartType('high-low'));
    await settle(page);
    await golden(page, 'high-low-chart');
  });

  test('⑬ 阶梯线（step-line，--accent 令牌蓝）', async ({ page }) => {
    await openHarness(page);
    await withAppTheme(page);
    await page.evaluate(() => window.__vh.setChartType('step-line'));
    await settle(page);
    await golden(page, 'step-line-chart');
  });

  test('⑭ 带标记线形（line-markers，--accent 令牌蓝）', async ({ page }) => {
    await openHarness(page);
    await withAppTheme(page);
    await page.evaluate(() => window.__vh.setChartType('line-markers'));
    await settle(page);
    await golden(page, 'line-markers-chart');
  });

  test('⑮ HLC 面积（hlc-area，--accent 令牌蓝）', async ({ page }) => {
    await openHarness(page);
    await withAppTheme(page);
    await page.evaluate(() => window.__vh.setChartType('hlc-area'));
    await settle(page);
    await golden(page, 'hlc-area-chart');
  });

  test('⑯ 成交量蜡烛（volume-candles）', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.__vh.setChartType('volume-candles'));
    await settle(page);
    await golden(page, 'volume-candles-chart');
  });

  /**
   * B3 收盘倒计时徽章。时变语义（mm:ss 随真实时钟每秒变化）→ 禁像素基线。
   * 方案： harness 冻结时钟 + setFrozenNow 在「窗口内/外」间切换，读右轴条带
   * （徽章与倒计时唯一可能出现区域，宽 64px）canvas 像素做双态差分：
   *   A. 窗口外（默认冻结点：末 bar 收盘后）→ 徽章旁无文本
   *   B. 窗口内（收盘前 30s）→ 徽章旁出现 mm:ss 文本（新增 axisText 色像素）
   *   C. 窗口内再推进 1s（收盘前 29s）→ 文本变化（秒级递减，AC-B3）
   *   A'. 回到窗口外 → 文本像素计数恢复 A（窗口栅栏生效）
   * 全流程冻结时钟驱动，跨运行确定；不依赖 OCR、不落基线 PNG。
   * 注：不做「A 与 A' 逐像素相等」断言——Chrome 画布首帧与重绘存在 1LSB
   * 半透明合成舍入差（GPU/CPU 光栅化模式），属环境行为非产品缺陷；
   * 语义量（axisText 像素计数、各态哈希）跨运行完全确定，以此断言。
   */
  test('⑰ B3 收盘倒计时徽章（窗口内/外双态差分，非像素基线）', async ({ page }) => {
    await openHarness(page);
    const probe = await page.evaluate(() => window.__vh.countdownProbe());
    const states = await page.evaluate(
      async ({ outNow, inNow, inNextSec }) => {
        const canvas = document.querySelector('.cell canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        const STRIP_W = 64; // 右价格轴条带（徽章 + 倒计时文本唯一区域）
        const [tr, tg, tb] = window.__vh.axisTextRgb();
        /** 右轴条带签名：FNV-1a 哈希 + axisText 色像素数（倒计时文本色） */
        const readStrip = () => {
          const d = ctx.getImageData(canvas.width - STRIP_W, 0, STRIP_W, canvas.height).data;
          let axisText = 0;
          let hash = 2166136261;
          for (let i = 0; i < d.length; i += 4) {
            hash = Math.imul(hash ^ d[i], 16777619) >>> 0;
            hash = Math.imul(hash ^ d[i + 1], 16777619) >>> 0;
            hash = Math.imul(hash ^ d[i + 2], 16777619) >>> 0;
            hash = Math.imul(hash ^ d[i + 3], 16777619) >>> 0;
            if (
              Math.abs(d[i] - tr) < 32 &&
              Math.abs(d[i + 1] - tg) < 32 &&
              Math.abs(d[i + 2] - tb) < 32
            ) {
              axisText++;
            }
          }
          return { axisText, hash };
        };
        /** 等 n 帧；15s 竞速上限——rAF 若被环境饿死则显式失败，绝不静默挂死 */
        const waitFrames = (n: number) =>
          Promise.race([
            new Promise<void>((resolve) => {
              const start = window.__vh.frames;
              const check = () =>
                window.__vh.frames >= start + n ? resolve() : requestAnimationFrame(check);
              check();
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`waitFrames(${n}) 超时：rAF 推进停滞`)), 15_000),
            ),
          ]);
        window.__vh.setFrozenNow(outNow); // A. 窗口外（收盘后）
        await waitFrames(3);
        const out = readStrip();
        window.__vh.setFrozenNow(inNow); // B. 窗口内（收盘前 30s）
        await waitFrames(3);
        const inside = readStrip();
        window.__vh.setFrozenNow(inNextSec); // C. 窗口内推进 1s（收盘前 29s）
        await waitFrames(3);
        const insideNextSec = readStrip();
        window.__vh.setFrozenNow(outNow); // A'. 回到窗口外
        await waitFrames(3);
        const outAgain = readStrip();
        return { out, inside, insideNextSec, outAgain };
      },
      { outNow: probe.closeTime + 60_000, inNow: probe.closeTime - 30_000, inNextSec: probe.closeTime - 29_000 },
    );
    // B：窗口内徽章旁出现 mm:ss 文本——右轴条带新增 axisText 色文本像素
    expect(states.inside.axisText, '窗口内应出现倒计时文本像素').toBeGreaterThan(states.out.axisText);
    expect(states.inside.hash).not.toBe(states.out.hash);
    // C：秒级递减——冻结时钟推进 1s，徽章旁文本随之变化（0:30 → 0:29）
    expect(states.insideNextSec.hash).not.toBe(states.inside.hash);
    // A'：窗口外文本消失——文本像素计数恢复窗口外态（窗口栅栏生效）
    expect(states.outAgain.axisText, '窗口外文本应消失').toBe(states.out.axisText);
    expect(states.outAgain.hash).not.toBe(states.inside.hash);
  });

  /**
   * B5 新档位。引擎不做聚合（ChartRenderer 只渲染传入 bars）；harness 与 App 数据层
   * 同路径：aggregateBars 把 1m 种子聚合成目标档位后 setData + setLegend(timeframeId)。
   * 断言 barCount 证明聚合真实发生（600 根 1m → 300 根 2m / 14 根 45m，纪元对齐），
   * 黄金截图证明聚合渲染正常。
   */
  test('⑱ 2 分钟档位（timeframe-2m，1m 种子聚合）', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.__vh.setTimeframe('2m'));
    await settle(page, 3);
    expect(await page.evaluate(() => window.__vh.barCount())).toBe(300); // 600 × 1m → 300 × 2m
    await golden(page, 'timeframe-2m');
  });

  test('⑲ 45 分钟档位（timeframe-45m，1m 种子聚合）', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.__vh.setTimeframe('45m'));
    await settle(page, 3);
    expect(await page.evaluate(() => window.__vh.barCount())).toBe(14); // 600 × 1m → 14 × 45m（末桶不满）
    await golden(page, 'timeframe-45m');
  });
});
