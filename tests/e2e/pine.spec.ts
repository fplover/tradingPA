import { test, expect } from '@playwright/test';

/** Pine 编辑器：编译自定义指标并添加到图表；坏脚本在控制台报错 */
test('Pine 编辑器编译自定义指标', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Pine 编辑器' }).click();
  await expect(page.getByLabel('Pine 脚本源码')).toBeVisible();
  await page.getByRole('button', { name: /添加到图表/ }).click();

  // 指标 chip 出现（图例为画布绘制，不在 DOM 中）
  const chip = page.locator('span').filter({ hasText: '双均线交叉' }).filter({ has: page.getByRole('button', { name: '设置' }) });
  await expect(chip).toHaveCount(1);

  // 设置对话框的输入页由 input.* 自动生成
  await chip.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '输入', exact: true }).click();
  await expect(page.getByText('快线周期')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 坏脚本：编译期报错进控制台，不污染图表
  await page.getByLabel('Pine 脚本源码').fill('indicator("坏", overlay=false)\nplot(ta.foo(close, 3), "X")');
  await page.getByRole('button', { name: /运行/ }).click();
  await expect(page.getByText(/不支持的函数/)).toBeVisible();
});
