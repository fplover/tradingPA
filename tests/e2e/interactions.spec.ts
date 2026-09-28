import { test, expect } from '@playwright/test';

/** 画线交互对齐 TV：放置后退出工具 / 保持绘图模式 / 双击打开画线设置 */
test('画线放置、保持绘图模式与画线设置', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const trend = page.getByRole('button', { name: '趋势线', exact: true });
  const canvas = page.locator('canvas').first();

  // 默认关闭「保持绘图模式」：放置完成后退回光标
  await trend.click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await canvas.click({ position: { x: 500, y: 300 } });
  await expect(trend).toHaveAttribute('aria-pressed', 'false');

  // 开启保持绘图模式：放置后工具仍在
  await page.getByRole('button', { name: '保持绘图模式' }).click();
  await trend.click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await canvas.click({ position: { x: 500, y: 300 } });
  await expect(trend).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '保持绘图模式' }).click();

  // 双击画线 → 画线设置（实时生效、无确定按钮）
  await canvas.dblclick({ position: { x: 400, y: 250 } });
  await expect(page.getByText('画线设置')).toBeVisible();
  await expect(page.getByRole('button', { name: '完成' })).toBeHidden();
  await page.getByLabel('虚线').click();
  await expect(page.getByLabel('虚线')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

/** 指标面板：扁平列表 + 收藏置顶 + ↑↓/Enter */
test('指标面板收藏与键盘操作', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '指标', exact: true }).click();
  const input = page.getByRole('textbox', { name: '搜索指标' });
  await expect(input).toBeFocused();
  await input.fill('RSI');
  await expect(page.getByRole('option').filter({ hasText: 'RSI 相对强弱' })).toHaveCount(1);
  await input.press('Enter');

  // RSI 已加入图表（chip 出现）
  const chip = page.locator('span').filter({ hasText: 'RSI 相对强弱' }).filter({ has: page.getByRole('button', { name: '设置' }) });
  await expect(chip).toHaveCount(1);

  // 收藏后清空搜索，RSI 置顶
  await page.getByRole('button', { name: /收藏 RSI/ }).click();
  await input.fill('');
  await expect(page.getByRole('option').first()).toContainText('RSI 相对强弱');
});

/** 对象树：视觉顺序（置于顶层）改变行序 */
test('对象树视觉顺序', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const canvas = page.locator('canvas').first();
  // 先放矩形，再放趋势线
  await page.getByRole('button', { name: '矩形', exact: true }).click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await canvas.click({ position: { x: 420, y: 300 } });
  await page.getByRole('button', { name: '趋势线', exact: true }).click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await canvas.click({ position: { x: 500, y: 320 } });

  await page.getByRole('button', { name: '对象树' }).click();
  const rows = page.getByTestId('object-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('矩形');

  // 矩形置于顶层 → 行序末尾
  await rows.nth(0).getByLabel('置于顶层').click();
  await expect(rows.nth(0)).toContainText('趋势线');
  await expect(rows.nth(1)).toContainText('矩形');
});

/** 研究图例中键删除 + 底栏隐藏所有指标 */
test('研究图例中键删除与隐藏指标开关', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  // 用 Pine 草稿加一个主图研究（图例行在主图图例上）
  await page.getByRole('button', { name: 'Pine 编辑器' }).click();
  await page.getByRole('button', { name: /添加到图表/ }).click();
  await expect(page.getByText('双均线交叉').first()).toBeVisible();
  await page.keyboard.press('Escape');

  const chip = page.locator('span').filter({ hasText: '双均线交叉' }).filter({ has: page.getByRole('button', { name: '设置' }) });
  await expect(chip).toHaveCount(1);

  // 底栏：隐藏所有指标
  const studiesHidden = () =>
    page.evaluate(() => (window as unknown as { __chartRenderer?: { studiesHidden: boolean } }).__chartRenderer?.studiesHidden ?? null);
  expect(await studiesHidden()).toBe(false);
  await page.getByRole('button', { name: '隐藏所有指标' }).click();
  expect(await studiesHidden()).toBe(true);
  await page.getByRole('button', { name: '显示所有指标' }).click();
  expect(await studiesHidden()).toBe(false);

  // 中键点击研究图例行 → 删除该研究
  await page.locator('canvas').first().click({ position: { x: 60, y: 40 }, button: 'middle' });
  await expect(chip).toHaveCount(0);
});
