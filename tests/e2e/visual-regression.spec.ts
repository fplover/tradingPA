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
 *   ⑳ timeframe-1H            Wave5 项7 时间 zh 化视觉覆盖（M月D日 日级标签 + 1H 聚合）
 *   ㉑ pine-paint             P2-A Pine 绘图指令（bgcolor/barcolor/plotshape）
 *   ㉒ drawings-line-family   P2-B 线类家族（趋势线/射线/水平线/垂直线/箭头/信息线）
 *   ㉓ drawings-shape-family  P2-B 通道与形状（平行通道/矩形/椭圆/路径）
 *   ㉔ drawings-text-family   P2-B 文字类（文本/便签/价格标签/锚定文本/箭头标记）
 *   ㉕ drawings-geometry-family P2-B 几何进阶（多边形/圆弧/曲线）
 *   ㉖ drawings-gann-elliott  P2-B 江恩与艾略特（扇形/江恩线/江恩箱/艾略特波浪）
 *   ㉗ drawings-measure-fib   P2-B 测量与斐波那契（测量/百分比线/斐波那契回撤/扩展）
 *   （㉒–㉗ 补 P2-B 画线家族的覆盖空档：此前 11 个新工具「结构性不可见」，见文件末说明）
 *
 * 稳定性约定（防 flaky）：
 *   - deviceScaleFactor 锁 1（见 test.use）
 *   - page.addStyleTag 禁用 CSS 动画/transition
 *   - 每次截图前等 document.fonts.ready + __vh.frames 推进 ≥2（两个 rAF）
 *   - 数据走 harness 确定性模拟数据（固定基准时间 + 符号种子），不依赖真实 Binance
 *   - Date.now 冻结在「末 bar 收盘后」（B3 护栏）：倒计时不绘制，基线纯数据驱动
 *   - 图例市场状态圆点（Wave5 项4）：harness 种子符号均为 crypto，isMarketOpen
 *     首行短路恒开市——不读时钟，圆点颜色/显隐与采集时点无关（确定性）；
 *     若引入时段依赖市场的符号，须连 new Date() 一并冻结（仅冻 Date.now 不够）
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
      addPine(source: string): string | null;
      clearIndicators(): void;
      setLayout(n: number): void;
      setTool(t: string | null): void;
      clearDrawings(): void;
      importDrawings(raw: string): void;
      barAnchor(i: number, price: 'open' | 'high' | 'low' | 'close'): { time: number; price: number } | null;
      toolDefaultStyle(t: string): Record<string, unknown> | null;
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
            if (Math.abs(d[i] - tr) < 32 && Math.abs(d[i + 1] - tg) < 32 && Math.abs(d[i + 2] - tb) < 32) {
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
              const check = () => (window.__vh.frames >= start + n ? resolve() : requestAnimationFrame(check));
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

  /**
   * ⑳ 1H 档位（Wave5 项7 时间 zh 化的视觉覆盖）：600 × 1m → 10 × 1H。
   * 默认间距（~6px/bar）下 10 根只占 60px，时间轴仍是日内 HH:mm；
   * 在数据条带处（x≈1185）向下滚轮 25 档（1.1×/档，锚定光标处的 bar）→
   * 间距 ~65px ≥ formatTime 的 60px 阈值 → 标签落入「M月D日」日级区间
   * （既有表面全为日内格式，zh 日期标签此前零视觉覆盖）。
   * 注：绕屏幕中心的 zoom() 不可用——10 根 bar 贴右缘，中心锚定会落入
   * 无数据区；滚轮锚在光标处（须在数据条带内）才能保持视口有数据。
   */
  test('⑳ 1H 档位（timeframe-1H，zh 日期标签 + 聚合）', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.__vh.setTimeframe('1H'));
    await settle(page, 3);
    expect(await page.evaluate(() => window.__vh.barCount())).toBe(10); // 600 × 1m → 10 × 1H
    await page.mouse.move(1185, 400); // 数据条带内（10 根 1H bar 位于右缘 ~60px 宽）
    for (let i = 0; i < 25; i++) await page.mouse.wheel(0, 120); // deltaY>0 = 放大 1.1×/档
    await settle(page, 3);
    await golden(page, 'timeframe-1H');
  });

  /**
   * ㉑ P2-A Pine 绘图指令（bgcolor/barcolor/plotshape）：harness 编译脚本挂主图
   * （compilePine → registerCustomDef → addIndicator，与 App PineEditorPanel 同路径），
   * 黄金截图一表面覆盖三类绘制——阳线列绿色背景色带（drawPinePaint bg 相位）/
   * 阴线蜡烛体红色覆绘（bar 相位）/ 阳线下方蓝色三角（drawPineShapes belowbar）。
   * 条件序列经 computeExtra 窗口旁路（与 compute 同脏缓存），确定性种子数据驱动。
   */
  test('㉑ P2-A Pine 绘图指令（bgcolor/barcolor/plotshape）', async ({ page }) => {
    await openHarness(page);
    const uid = await page.evaluate(() =>
      window.__vh.addPine(
        [
          'indicator("P2-A 绘图指令", overlay=true)',
          'plot(close, "收盘")',
          'bgcolor(close > open, color=color.green)',
          'barcolor(close < open, color=color.red)',
          'plotshape(close > open, style=shape.triangleup, location=location.belowbar, color=color.blue)',
        ].join('\n'),
      ),
    );
    expect(uid, 'Pine 脚本应编译并挂载').not.toBeNull();
    await settle(page, 3);
    await golden(page, 'pine-paint');
  });
});

/**
 * P2-B 画线家族黄金面（补覆盖空档）。
 *
 * 背景：既有 21 面中画线只有 ⑧ 覆盖「趋势线 + 水平线」两条，且 §12 自述 P2-B 新增的 11 个
 * 画线工具走 harness 路径「结构性不可见」——即新工具家族此前没有像素级安全网。本组把画线
 * 按族拆成 6 面覆盖 25 个工具：用 harness 的 importDrawings 走**对象树同款序列化通道**
 * （serializeDrawings → deserializeDrawings，不绕过几何/命中/渲染链路）；锚点由 barAnchor
 * 从真实种子 bar 取，钉在可见区内，避免写死世界坐标后随视口变化跑出屏；样式取
 * DRAWING_TOOLS 默认值（单一数据源）→ 这些面同时是调色板默认色的回归网。
 *
 * 采集：UPDATE_SNAPSHOTS=1 npx playwright test visual-regression --grep "画线家族"
 * （限定本组，绝不重产既有 21 面——反作弊门禁：基线变更须单独评审）
 */
type VhAnchor = [number, 'open' | 'high' | 'low' | 'close'];
interface VhDrawSpec {
  id: string;
  type: string;
  anchors: VhAnchor[];
}

async function importDrawings(page: Page, specs: VhDrawSpec[]): Promise<void> {
  await page.evaluate((list) => {
    const vh = window.__vh;
    const drawings = list.map((s) => ({
      id: s.id,
      type: s.type,
      points: s.anchors.map(([i, w]) => vh.barAnchor(i, w)),
      style: vh.toolDefaultStyle(s.type),
      locked: false,
      visible: true,
    }));
    vh.importDrawings(JSON.stringify(drawings));
  }, specs);
}

test.describe('P2-B 画线家族（黄金面）', () => {
  test('㉒ 线类家族（趋势线/射线/水平线/垂直线/箭头/信息线）', async ({ page }) => {
    await openHarness(page);
    await importDrawings(page, [
      {
        id: 'l1',
        type: 'trendline',
        anchors: [
          [480, 'low'],
          [540, 'high'],
        ],
      },
      {
        id: 'l2',
        type: 'ray',
        anchors: [
          [500, 'high'],
          [560, 'low'],
        ],
      },
      { id: 'l3', type: 'hline', anchors: [[520, 'close']] },
      { id: 'l4', type: 'vline', anchors: [[570, 'close']] },
      {
        id: 'l5',
        type: 'arrow',
        anchors: [
          [490, 'close'],
          [525, 'close'],
        ],
      },
      {
        id: 'l6',
        type: 'info-line',
        anchors: [
          [550, 'low'],
          [592, 'high'],
        ],
      },
    ]);
    await settle(page, 3);
    await golden(page, 'drawings-line-family');
  });

  test('㉓ 通道与形状（平行通道/矩形/椭圆/路径）', async ({ page }) => {
    await openHarness(page);
    await importDrawings(page, [
      {
        id: 's1',
        type: 'channel',
        anchors: [
          [475, 'low'],
          [510, 'high'],
          [555, 'low'],
        ],
      },
      {
        id: 's2',
        type: 'rect',
        anchors: [
          [500, 'high'],
          [545, 'low'],
        ],
      },
      {
        id: 's3',
        type: 'ellipse',
        anchors: [
          [520, 'high'],
          [565, 'low'],
        ],
      },
      {
        id: 's4',
        type: 'path',
        anchors: [
          [485, 'low'],
          [515, 'high'],
          [550, 'low'],
          [585, 'high'],
        ],
      },
    ]);
    await settle(page, 3);
    await golden(page, 'drawings-shape-family');
  });

  test('㉔ 文字类（文本/便签/价格标签/锚定文本/箭头标记）', async ({ page }) => {
    await openHarness(page);
    await importDrawings(page, [
      { id: 't1', type: 'text', anchors: [[480, 'high']] },
      { id: 't2', type: 'note', anchors: [[505, 'low']] },
      { id: 't3', type: 'price-label', anchors: [[540, 'high']] },
      { id: 't4', type: 'anchored-text', anchors: [[565, 'low']] },
      { id: 't5', type: 'arrow-mark', anchors: [[590, 'high']] },
    ]);
    await settle(page, 3);
    await golden(page, 'drawings-text-family');
  });

  test('㉕ 几何进阶（多边形/圆弧/曲线）', async ({ page }) => {
    await openHarness(page);
    await importDrawings(page, [
      {
        id: 'g1',
        type: 'polygon',
        anchors: [
          [475, 'low'],
          [515, 'high'],
          [560, 'low'],
          [535, 'open'],
        ],
      },
      {
        id: 'g2',
        type: 'arc',
        anchors: [
          [495, 'high'],
          [540, 'low'],
          [585, 'high'],
        ],
      },
      {
        id: 'g3',
        type: 'curve',
        anchors: [
          [505, 'low'],
          [535, 'high'],
          [565, 'low'],
          [593, 'high'],
        ],
      },
    ]);
    await settle(page, 3);
    await golden(page, 'drawings-geometry-family');
  });

  test('㉖ 江恩与艾略特（扇形/江恩线/江恩箱/艾略特波浪）', async ({ page }) => {
    await openHarness(page);
    await importDrawings(page, [
      { id: 'w1', type: 'gann-fan', anchors: [[500, 'low']] },
      { id: 'w2', type: 'gann-line', anchors: [[540, 'high']] },
      {
        id: 'w3',
        type: 'gann-box',
        anchors: [
          [555, 'low'],
          [590, 'high'],
        ],
      },
      {
        id: 'w4',
        type: 'elliott-wave',
        anchors: [
          [470, 'low'],
          [492, 'high'],
          [512, 'low'],
          [532, 'high'],
          [552, 'low'],
          [572, 'high'],
          [592, 'low'],
        ],
      },
    ]);
    await settle(page, 3);
    await golden(page, 'drawings-gann-elliott');
  });

  test('㉗ 测量与斐波那契（测量/百分比线/斐波那契回撤/扩展）', async ({ page }) => {
    await openHarness(page);
    await importDrawings(page, [
      {
        id: 'm1',
        type: 'measure',
        anchors: [
          [480, 'low'],
          [525, 'high'],
        ],
      },
      {
        id: 'm2',
        type: 'percent-line',
        anchors: [
          [505, 'high'],
          [560, 'low'],
        ],
      },
      {
        id: 'm3',
        type: 'fib',
        anchors: [
          [520, 'low'],
          [580, 'high'],
        ],
      },
      {
        id: 'm4',
        type: 'fib-extension',
        anchors: [
          [495, 'high'],
          [535, 'low'],
          [575, 'high'],
        ],
      },
    ]);
    await settle(page, 3);
    await golden(page, 'drawings-measure-fib');
  });
});
