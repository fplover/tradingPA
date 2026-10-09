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

  // RSI 已加入图表（图例为画布绘制，不在 DOM 中）：经引擎 listIndicators 验证
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __chartRenderer?: { listIndicators(): Array<{ name: string }> } }).__chartRenderer
            ?.listIndicators()
            .some((i) => i.name === 'RSI 相对强弱') ?? false,
      ),
    )
    .toBe(true);

  // 收藏后清空搜索，RSI 置顶
  await page.getByRole('button', { name: /收藏 RSI/ }).click();
  await input.fill('');
  await expect(page.getByRole('option').first()).toContainText('RSI 相对强弱');
});

/** 磁吸档位、清空全部、画线右键菜单 */
test('磁吸档位与清空全部', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const canvas = page.locator('canvas').first();
  await page.getByRole('button', { name: '趋势线', exact: true }).click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await canvas.click({ position: { x: 500, y: 300 } });

  // 磁吸默认关闭；开启后 caret 可选强弱档
  await page.getByRole('button', { name: '磁吸', exact: true }).click();
  await expect(page.getByRole('button', { name: '磁吸', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('button[aria-label="磁吸模式"]').click();
  await page.getByRole('menuitem', { name: /强磁铁/ }).click();
  await expect(page.getByRole('button', { name: '磁吸', exact: true })).toHaveAttribute('title', /强磁铁/);

  // 画线右键菜单：视觉顺序子菜单
  await canvas.click({ button: 'right', position: { x: 400, y: 250 } });
  await expect(page.getByRole('menuitem', { name: '移除' })).toBeVisible();
  await page.getByRole('menuitem', { name: '视觉顺序' }).hover();
  await expect(page.getByRole('menuitem', { name: '上移一层' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 清空全部 → 移除画线
  await page.locator('button[aria-label="清空选项"]').click();
  await page.getByRole('menuitem', { name: '移除画线', exact: true }).click();
  await page.getByRole('button', { name: '对象树' }).click();
  await expect(page.getByTestId('object-row')).toHaveCount(0);
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

  // Pine 研究已挂主图（图例为画布绘制，不在 DOM 中）：经引擎 listIndicators 验证
  const hasPineStudy = () =>
    page.evaluate(
      () =>
        (window as unknown as { __chartRenderer?: { listIndicators(): Array<{ name: string }> } }).__chartRenderer
          ?.listIndicators()
          .some((i) => i.name === '双均线交叉') ?? false,
    );
  await expect.poll(hasPineStudy).toBe(true);

  // 底栏：隐藏所有指标
  const studiesHidden = () =>
    page.evaluate(
      () =>
        (window as unknown as { __chartRenderer?: { studiesHidden: boolean } }).__chartRenderer?.studiesHidden ?? null,
    );
  expect(await studiesHidden()).toBe(false);
  await page.getByRole('button', { name: '隐藏所有指标' }).click();
  expect(await studiesHidden()).toBe(true);
  await page.getByRole('button', { name: '显示所有指标' }).click();
  expect(await studiesHidden()).toBe(false);

  // 中键点击研究图例行 → 删除该研究
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 60, y: 40 }, button: 'middle' });
  await expect.poll(hasPineStudy).toBe(false);
});

/** 前往日期：自建日历弹层（替代原生 date input——部分嵌入式浏览器不弹原生选择器） */
test('前往日期日历弹层', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('Alt+g');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // 点日历图标按钮 → 弹层出现（月导航 + 周行头 + 日期格）
  await dialog.getByRole('button', { name: '选择日期' }).click();
  await expect(page.getByRole('button', { name: '上个月' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下个月' })).toBeVisible();
  await expect(page.getByText('一', { exact: true })).toBeVisible();

  // 首个界内可点日格（可访问名为 `YYYY-MM-DD` 的按钮只在日期格上；`disabled: false` 排除补位/区间外格，
  // 且 mock 区间随 Date.now() 漂移，故不按年份字面量挑）→ 回填文本输入 + 弹层关闭
  const target = page.getByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/, disabled: false }).first();
  const label = await target.getAttribute('aria-label');
  await target.click();
  await expect(dialog.getByRole('textbox', { name: '日期' })).toHaveValue(label!);
  await expect(page.getByRole('button', { name: '上个月' })).toBeHidden();

  // 前往 → 对话框关闭（定位链路通）
  await dialog.getByRole('button', { name: '前往' }).click();
  await expect(dialog).toBeHidden();
});

/** 回放「选择日期」：自建日历弹层定位（包含块 regression——缺 relative 时弹层渲染到视口上方外） */
test('回放选择日期日历弹层', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  // 进入回放选线 → 点一根 K 线 → 回放栏出现
  await page.getByRole('button', { name: /回放：点击后/ }).click();
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 400, y: 300 } });
  await page.getByRole('button', { name: '选择K线' }).click();
  await page.getByRole('menuitem', { name: '选择日期' }).click();

  // DatePicker 触发按钮在视口内（回放栏上方的日期弹层）
  const trigger = page.getByRole('button', { name: '选择日期' });
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(viewport.height);

  // 日历格可见且在视口内（弹层向上展开进图表区）
  await trigger.click();
  const day = page.getByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/, disabled: false }).first();
  await expect(day).toBeVisible();
  const dayBox = (await day.boundingBox())!;
  expect(dayBox.y).toBeGreaterThanOrEqual(0);
  expect(dayBox.y).toBeLessThan(viewport.height);

  // 选一天 → 跳转 → 弹层收起
  await day.click();
  await page.getByRole('button', { name: '跳转' }).click();
  await expect(trigger).toBeHidden();
});
