import { test, expect } from '@playwright/test';

/**
 * 三期-C2 数据窗口：右轨第四个停靠面板的端到端行为。锁四段机制——
 * ① 入口在图标轨（点开后 aria-pressed=true）；② 初始无十字光标 = 跟随最新（有 OHLCV 行、无「光标价」、
 * 头部带「· 跟随最新」）；③ 悬停图表 → 光标价行出现、跟随最新退场、时间读数随悬停 bar 变（合帧广播驱动）；
 * ④ 再点图标收起 → 面板卸载、dw-row 归零。全程 DOM 断言，不新增黄金截图（守 27 面零 diff 基线）。
 */
test('数据窗口面板跟随十字光标', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const rail = page.getByRole('button', { name: '数据窗口', exact: true });
  const rows = page.getByTestId('dw-row');

  // ① 入口 + 打开
  await rail.click();
  await expect(rail).toHaveAttribute('aria-pressed', 'true');

  // ② 跟随最新初始态：OHLCV 行在、无光标价、头部标注跟随最新
  await expect(rows.filter({ hasText: /^时间/ }).first()).toBeVisible();
  await expect(rows.filter({ hasText: /^开盘/ }).first()).toBeVisible();
  await expect(rows.filter({ hasText: /^成交量/ }).first()).toBeVisible();
  await expect(rows.filter({ hasText: /光标价/ })).toHaveCount(0);
  await expect(page.getByText(/跟随最新/)).toBeVisible();

  // ③ 悬停 → 十字光标进入：光标价行出现、跟随最新退场
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  const timeText = async () => (await rows.filter({ hasText: /^时间/ }).first().textContent()) ?? '';

  await page.mouse.move(box!.x + 600, box!.y + 250);
  await expect(rows.filter({ hasText: /光标价/ })).toHaveCount(1);
  await expect(page.getByText(/跟随最新/)).toHaveCount(0);

  // 移到另一根 bar → 时间读数随之改变（同列结构、值随悬停 bar 变）
  const t1 = await timeText();
  await page.mouse.move(box!.x + 400, box!.y + 250);
  await expect.poll(timeText).not.toBe(t1);

  // ④ 再点图标收起：面板卸载，dw-row 归零
  await rail.click();
  await expect(rail).toHaveAttribute('aria-pressed', 'false');
  await expect(rows).toHaveCount(0);
});
