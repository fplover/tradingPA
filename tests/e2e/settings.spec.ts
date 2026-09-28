import { test, expect } from '@playwright/test';

/** 设置类对话框与 tooltip */
test('设置类对话框与 tooltip', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  // 指标设置：TV 页签顺序 输入 → 样式 → 可见范围
  const volChip = page.locator('span').filter({ hasText: 'VOL 成交量' }).filter({ has: page.getByRole('button', { name: '设置' }) });
  await volChip.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('button', { name: '输入', exact: true })).toBeVisible();
  // VOL 的 MA Length 来自 input 声明
  await expect(page.getByText('MA Length')).toBeVisible();

  // 样式页：覆盖最小tick（精度折入）
  await page.getByRole('button', { name: '样式', exact: true }).click();
  await expect(page.getByLabel('覆盖最小tick')).toBeVisible();

  // 隐藏 MA plot 后，输入页的 MA Length 联动隐藏（hideWhenPlotsHidden）
  await page.getByRole('button', { name: '输入', exact: true }).click();
  await expect(page.getByText('MA Length')).toBeVisible();
  await page.getByRole('button', { name: '样式', exact: true }).click();
  await page.getByLabel('MA 显示').click();
  await page.getByRole('button', { name: '输入', exact: true }).click();
  await expect(page.getByText('MA Length')).toBeHidden();

  await expect(page.getByRole('button', { name: '可见范围', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 图表设置：左导航三页签，外观页可关网格
  await page.getByRole('button', { name: '图表设置' }).click();
  await expect(page.getByText('图表设置', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('网格线').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // TV tooltip：悬停图标按钮出现 role=tooltip
  await page.getByRole('button', { name: '指标', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 3000 });
});

/** 图例右键菜单：开关图例各部分 */
test('图例右键菜单', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  // 右键图例商品行
  await page.mouse.click(box.x + 120, box.y + 10, { button: 'right' });
  const menu = page.getByRole('menuitemcheckbox', { name: 'OHLC值' });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-checked', 'true');

  // 关掉 OHLC → 菜单保持（实时生效）
  await menu.click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'OHLC值' })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
});
