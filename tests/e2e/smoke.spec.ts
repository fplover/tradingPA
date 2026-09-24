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
      { timeout: 20_000 },
    )
    .toBeGreaterThan(1000);

  expect(errors).toEqual([]);
});

/** 周期与图表类型切换 */
test('切换周期和图表类型', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根 · 1分/)).toBeVisible({ timeout: 20_000 });

  const chartTypeOf = () =>
    page.evaluate(() => (window as unknown as { __chartRenderer?: { chartTypeNow: string } }).__chartRenderer?.chartTypeNow ?? null);
  const paintedPx = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 19 || d[i + 1] !== 23 || d[i + 2] !== 34) count++;
      }
      return count;
    });

  await page.getByRole('button', { name: '图表类型' }).click();
  await page.getByRole('menuitem', { name: '线形图', exact: true }).click();
  await expect.poll(chartTypeOf).toBe('line');
  // 线形图下画布仍在正常绘制
  await expect.poll(paintedPx).toBeGreaterThan(1000);

  await page.getByRole('button', { name: '图表类型' }).click();
  await page.getByRole('menuitem', { name: '蜡烛图', exact: true }).click();
  await expect.poll(chartTypeOf).toBe('candles');

  await page.getByRole('button', { name: '周期' }).click();
  await page.getByRole('menuitem', { name: '1时', exact: true }).click();
  await expect(page.getByText(/[1-9][0-9,]* 根 · 1时/)).toBeVisible({ timeout: 15_000 });
});

/** 指标添加与副图面板 */
test('添加指标创建副图', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '指标', exact: true }).click();
  await page.getByText('RSI 相对强弱').click();
  // VOL 成交量默认激活，chip 区会有多个“设置”按钮；用“含设置按钮”过滤排除面板目录里的同名 span
  const rsiChip = page.locator('span').filter({ hasText: 'RSI 相对强弱' }).filter({ has: page.getByRole('button', { name: '设置' }) });
  await expect(rsiChip).toHaveCount(1);
  await expect(rsiChip.getByRole('button', { name: '设置' })).toBeVisible();
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
  await page.getByRole('button', { name: '切换布局' }).click();
  await page.getByRole('menuitem', { name: '四分', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(4);
  await page.getByRole('button', { name: '切换布局' }).click();
  await page.getByRole('menuitem', { name: '单图', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
});

/** 回放模式：进入即选择K线，点图表定位起点 */
test('回放模式进入与退出', async ({ page }) => {
  await page.goto('/');
  // 等实时/模拟数据就绪（避免 0 根进入回放；冷缓存时含 REST 超时回退耗时）
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '回放：点击后在图表上选择 K 线作为起点' }).click();
  // 进入即选择K线：提示可见、走位控件未出现
  await expect(page.getByText('请在图表上点击选择 K 线作为回放起点')).toBeVisible();
  await expect(page.getByRole('button', { name: '选择K线' })).toBeVisible();
  // 点击图表选定起点 → 进入回放（走位控件出现）
  await page.locator('canvas').click({ position: { x: 400, y: 300 } });
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上一根' })).toBeVisible();
  await expect(page.getByText('请在图表上点击选择 K 线作为回放起点')).toBeHidden();
  // 回放计时菜单
  await page.getByRole('button', { name: '选择K线' }).click();
  await expect(page.getByRole('menuitem', { name: '选择K线' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '选择日期' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '随机K线' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: '选择K线' })).toBeHidden();
  await page.waitForTimeout(150); // portal 遮罩移除的微任务时间
  // 播放推进（可见页面定时器正常；经开发句柄读取回放位置）
  const idxOf = () => page.evaluate(() => (window as unknown as { __chartRenderer?: { replayIndex: number | null } }).__chartRenderer?.replayIndex ?? null);
  const before = await idxOf();
  expect(before).not.toBeNull();
  await page.getByRole('button', { name: '播放' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '暂停' }).click();
  expect(await idxOf()).toBeGreaterThan(before!);
  // 退出
  await page.getByRole('button', { name: '退出回放' }).click();
  await expect(page.getByRole('button', { name: '选择K线' })).toBeHidden();
});

/** 回放模拟交易：市价下单 / 挂单对话框 / 平仓 / 总结报告 */
test('回放模拟交易全流程', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 15_000 });
  // 进入回放并选择 K 线
  await page.getByRole('button', { name: '回放：点击后在图表上选择 K 线作为起点' }).click();
  await page.locator('canvas').click({ position: { x: 400, y: 300 } });
  // 交易面板 + 市价买入
  await expect(page.getByRole('button', { name: '买入', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '买入', exact: true }).click();
  // 面板默认收起：先展开再验证页签
  await page.getByRole('button', { name: '展开面板' }).click();
  await expect(page.getByRole('tab', { name: /^持仓/ })).toBeVisible();
  // 挂单对话框（限价/止损/止损限价）
  await page.getByRole('button', { name: '限价 / 止损挂单' }).click();
  await expect(page.getByText('挂单在回放触及价格时成交')).toBeVisible();
  await expect(page.getByRole('button', { name: '止损限价' })).toBeVisible();
  await page.keyboard.press('Escape'); // Radix Dialog：Esc 关闭
  await expect(page.getByText('挂单在回放触及价格时成交')).toBeHidden();
  // 市价平仓 → 产生成交
  await page.getByRole('button', { name: '平仓', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^成交 \([1-9]/ })).toBeVisible();
  // 总结报告
  await page.getByRole('button', { name: '交易报告' }).click();
  await expect(page.getByText('交易总结报告')).toBeVisible();
  await expect(page.getByText('交易次数')).toBeVisible();
  await expect(page.getByText('盈亏比')).toBeVisible();
});

/** 图表右键菜单与缩放/平移快捷键 */
test('图表右键菜单与缩放快捷键', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.locator('canvas').first().click({ button: 'right', position: { x: 400, y: 300 } });
  await expect(page.getByRole('menuitem', { name: /加入自选股/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /重置图表/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: /重置图表/ })).toBeHidden();

  const spacingOf = () =>
    page.evaluate(() => (window as unknown as { __chartRenderer?: { getViewport(): { spacing: number } } }).__chartRenderer?.getViewport().spacing ?? 0);
  const before = await spacingOf();
  await page.keyboard.press('+');
  await page.waitForTimeout(250);
  expect(await spacingOf()).toBeGreaterThan(before);
  await page.keyboard.press('-');
  await page.waitForTimeout(250);
  expect(await spacingOf()).toBeLessThanOrEqual(before * 1.05);
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
