import { test, expect, type Page } from '@playwright/test';

/**
 * 研究图例行悬停按钮（TV 图例路径）：图例由画布绘制，按钮位置随图例文本宽度变化。
 * 从左向右扫过主图首个研究行（y=28、行高 16，取行中 y=36），光标在按钮区变 pointer；
 * 每个扫描位连移两拍——引擎悬停光标滞后 pointermove 一拍（updateHoverCursor 先于
 * hover.update 执行），第二拍消化该滞后；命中按钮区后按 16px 按钮宽推算目标按钮
 * 中心（0=眼睛/隐藏 1=齿轮/设置 2=移除）。
 */
async function clickStudyLegendButton(page: Page, box: { x: number; y: number }, btn: number): Promise<void> {
  const rowY = 36;
  let btnLeft = -1;
  for (let x = 8; x <= 800; x += 8) {
    await page.mouse.move(box.x + x, box.y + rowY);
    await page.mouse.move(box.x + x, box.y + rowY);
    const cursor = await page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement).style.cursor);
    if (cursor === 'pointer') {
      btnLeft = x;
      break;
    }
  }
  expect(btnLeft, '应扫到研究图例悬停按钮区').toBeGreaterThan(0);
  await page.mouse.click(box.x + btnLeft + btn * 16 + 8, box.y + rowY);
}

/** Pine 编辑器：编译自定义指标并添加到图表；坏脚本在控制台报错 */
test('Pine 编辑器编译自定义指标', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Pine 编辑器' }).click();
  await expect(page.getByLabel('Pine 脚本源码')).toBeVisible();
  await page.getByRole('button', { name: /添加到图表/ }).click();

  // 指标已挂主图（图例为画布绘制，不在 DOM 中）：经引擎 listIndicators 验证
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __chartRenderer?: { listIndicators(): Array<{ name: string }> } }).__chartRenderer?.listIndicators().some((i) => i.name === '双均线交叉') ??
          false,
      ),
    )
    .toBe(true);

  // 设置入口（TV 图例路径）：悬停主图研究行行尾悬停按钮，点齿轮打开指标设置
  const box = (await page.locator('canvas').first().boundingBox())!;
  await clickStudyLegendButton(page, box, 1);

  // 设置对话框的输入页由 input.* 自动生成
  await page.getByRole('button', { name: '输入', exact: true }).click();
  await expect(page.getByText('快线周期')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 坏脚本：编译期报错进控制台，不污染图表
  await page.getByLabel('Pine 脚本源码').fill('indicator("坏", overlay=false)\nplot(ta.foo(close, 3), "X")');
  await page.getByRole('button', { name: /运行/ }).click();
  await expect(page.getByText(/不支持的函数/)).toBeVisible();
});
