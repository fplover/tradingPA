import { test, expect } from '@playwright/test';

/** 冒烟：页面加载、工具栏、画布渲染 */
test('页面加载并渲染图表', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  await expect(page.getByText('TradingPA', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '指标', exact: true })).toBeVisible();

  // 画布存在且有非零尺寸
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  // 画布上确实画了内容（非纯背景像素）——轮询等待首帧渲染
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement;
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          let count = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] !== 19 || d[i + 1] !== 23 || d[i + 2] !== 34) count++;
          }
          return count;
        }),
      { timeout: 8000 },
    )
    .toBeGreaterThan(1000);

  expect(errors).toEqual([]);
});

/** 周期与图表类型切换 */
test('切换周期和图表类型', async ({ page }) => {
  await page.goto('/');
  const selects = page.locator('select');
  await selects.nth(0).selectOption('1H');
  await expect(page.getByText(/\d+ 根 · 1时/)).toBeVisible();

  const chartTypeSelect = page.locator('select').nth(1);
  await chartTypeSelect.selectOption('line');
  // 线形图下不应有蜡烛色像素
  const candlePx = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i] === 38 && d[i + 1] === 166 && d[i + 2] === 154) || (d[i] === 239 && d[i + 1] === 83 && d[i + 2] === 80)) count++;
    }
    return count;
  });
  expect(candlePx).toBe(0);
});

/** 指标添加与副图面板 */
test('添加指标创建副图', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '指标', exact: true }).click();
  await page.getByText('RSI 相对强弱').click();
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible();
});

/** 画线工具创建与删除 */
test('画线工具创建趋势线并删除', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;

  await page.getByTitle('趋势线').click();
  await page.mouse.click(box.x + 200, box.y + 200);
  await page.mouse.click(box.x + 400, box.y + 300);

  await page.getByRole('button', { name: '对象树' }).click();
  await expect(page.getByText('对象树（1）')).toBeVisible();

  await page.keyboard.press('Delete');
  await expect(page.getByText('对象树（0）')).toBeVisible();
});

/** 多图表布局 */
test('切换到四分布局', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '布局：四分' }).click();
  await expect(page.locator('canvas')).toHaveCount(4);
  await page.getByRole('button', { name: '布局：单图' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
});

/** 回放模式：进入即选择K线，点图表定位起点 */
test('回放模式进入与退出', async ({ page }) => {
  await page.goto('/');
  // 等实时/模拟数据就绪（避免 0 根进入回放）
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '回放：点击后在图表上选择 K 线作为起点' }).click();
  // 进入即选择K线：提示可见、走位控件未出现
  await expect(page.getByText('请在图表上点击选择 K 线作为回放起点')).toBeVisible();
  await expect(page.getByRole('button', { name: '回放计时' })).toBeVisible();
  // 点击图表选定起点 → 进入回放（走位控件出现）
  await page.locator('canvas').click({ position: { x: 400, y: 300 } });
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上一根' })).toBeVisible();
  await expect(page.getByText('请在图表上点击选择 K 线作为回放起点')).toBeHidden();
  // 回放计时菜单
  await page.getByRole('button', { name: '回放计时' }).click();
  await expect(page.getByRole('button', { name: '选择K线' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择日期' })).toBeVisible();
  await expect(page.getByRole('button', { name: '随机K线' })).toBeVisible();
  await page.keyboard.press('Escape');
  // 播放推进（可见页面定时器正常）
  const progress = page.locator('span', { hasText: /^\d+ \/ \d+$/ });
  const before = await progress.textContent();
  await page.getByRole('button', { name: '播放' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '暂停' }).click();
  expect(await progress.textContent()).not.toBe(before);
  // 退出
  await page.getByRole('button', { name: '退出回放' }).click();
  await expect(page.getByRole('button', { name: '回放计时' })).toBeHidden();
});

/** 主题切换 */
test('主题切换改变画布背景', async ({ page }) => {
  await page.goto('/');
  const bgOf = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(2, 2, 1, 1).data;
      return `${d[0]},${d[1]},${d[2]}`;
    });
  const dark = await bgOf();
  await page.getByRole('button', { name: '切换到浅色' }).click();
  const light = await bgOf();
  expect(light).not.toBe(dark);
});
