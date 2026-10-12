import { test, expect } from '@playwright/test';

/** 设置类对话框与 tooltip */
test('设置类对话框与 tooltip', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  // 指标设置（VOL 副图，TV 副图面板路径）：点击副图面板选中 → 面板右上角齿轮打开设置
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const chartW = box.width - 64; // 右价格轴宽
  const chartH = box.height - 24; // 下时间轴高
  const volY = (chartH * 3) / 4; // 面板高度比 主图 3 : 副图 1
  await page.mouse.click(box.x + Math.floor(chartW / 2), box.y + Math.floor(volY + chartH / 8));
  await page.waitForTimeout(150); // 等一帧：选中副图面板后头部按钮才绘制
  await page.mouse.click(box.x + Math.floor(chartW - 35), box.y + Math.floor(volY + 12));
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

  // 图表设置：左导航五页签，外观页可关网格
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

/** 三期-B0：图表设置偏好落盘并跨刷新保留。
 *  改造前画布五项（网格/边框/水印/价格轴位置/时间制式）由对话框自持 useState + 硬编码默认，
 *  刷新即丢且重开即把默认值推回引擎；现在偏好归 chartConfigStore，对话框读回真值。 */
test('图表设置偏好跨刷新保留', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '图表设置' }).click();
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '水印' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('checkbox', { name: '水印' }).click();
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('radio', { name: '横', exact: true }).click();
  await expect(page.getByRole('radio', { name: '横', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  // 落盘证据：写的是偏好切片键，且 watermarkVisible 为改动后的值
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.chartPrefs.v1'));
      return raw ? (JSON.parse(raw).watermarkVisible ?? null) : null;
    })
    .toBe(true);

  await page.reload();
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '图表设置' }).click();
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '水印' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await expect(page.getByRole('radio', { name: '横', exact: true })).toHaveAttribute('aria-checked', 'true');
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
