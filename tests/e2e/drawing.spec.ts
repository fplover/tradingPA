import { test, expect } from '@playwright/test';

/** 左工具栏 flyout：长按弹出变体菜单，选择后组按钮切换 */
test('画线工具 flyout 选择变体', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const groupBtn = page.getByRole('button', { name: '趋势线', exact: true });
  await expect(groupBtn).toBeVisible();
  const box = (await groupBtn.boundingBox())!;

  // 长按 > 350ms 弹出 flyout
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const hlineItem = page.getByRole('menuitem', { name: /水平线/ });
  await expect(hlineItem).toBeVisible();
  await hlineItem.click();

  // 组按钮显示新变体
  await expect(page.getByRole('button', { name: '水平线', exact: true })).toBeVisible();

  // 单击（不长按）直接激活当前变体，不弹菜单
  await page.getByRole('button', { name: '水平线', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /水平线/ })).toBeHidden();
});
