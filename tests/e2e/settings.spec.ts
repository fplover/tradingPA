import { test, expect } from '@playwright/test';

/** 指标设置四页签 + 图表设置左导航 + TV tooltip */
test('设置类对话框与 tooltip', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  // 指标设置：VOL chip 的设置按钮 → 四页签
  const volChip = page.locator('span').filter({ hasText: 'VOL 成交量' }).filter({ has: page.getByRole('button', { name: '设置' }) });
  await volChip.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('button', { name: '精度', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '可见性', exact: true }).click();
  await expect(page.getByText('全部周期')).toBeVisible();
  await page.getByRole('button', { name: '样式', exact: true }).click();
  await expect(page.getByLabel('指标显示名称')).toBeVisible();
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
