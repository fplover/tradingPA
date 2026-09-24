import { test, expect } from '@playwright/test';

/** 左工具栏 flyout：TV 交互模型——按住 300ms 展开、已激活组单击展开、caret 即时开关、热键选工具 */
test('画线工具 flyout 交互与 TV 一致', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const groupBtn = page.getByRole('button', { name: '趋势线', exact: true });
  await expect(groupBtn).toBeVisible();
  const box = (await groupBtn.boundingBox())!;
  const center = { x: box.x + box.width / 2 - 4, y: box.y + box.height / 2 };

  // 1) 按住 > 300ms 展开 flyout，松开后保持打开
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const hlineItem = page.getByRole('menuitem', { name: /水平线/ });
  await expect(hlineItem).toBeVisible();
  // 选中行带快捷键提示
  await expect(page.getByText('Alt + H')).toBeVisible();
  await hlineItem.click();
  await expect(page.getByRole('button', { name: '水平线', exact: true })).toBeVisible();

  // 2) 已激活组单击 → 展开 flyout（TV 行为），Esc 关闭
  await page.getByRole('button', { name: '水平线', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /水平线/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: /水平线/ })).toBeHidden();

  // 3) caret 即时开关（无需等待）
  const caret = page.locator('button[data-role="menu-handle"]').first();
  await caret.click();
  await expect(page.getByRole('menuitem', { name: /射线/ })).toBeVisible();
  await caret.dispatchEvent('click'); // caret 自身 handler：切换关闭
  await expect(page.getByRole('menuitem', { name: /射线/ })).toBeHidden();

  // 4) 外部点击关闭
  await caret.click();
  await expect(page.getByRole('menuitem', { name: /射线/ })).toBeVisible();
  await page.mouse.click(600, 400);
  await expect(page.getByRole('menuitem', { name: /射线/ })).toBeHidden();

  // 5) 未激活组快速单击 = 直接激活，不弹菜单（矩形组此时未激活）
  await page.getByRole('button', { name: '矩形', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /射线/ })).toBeHidden();
  await expect(page.getByRole('button', { name: '矩形', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // 6) TV 热键 Alt+H 选水平线
  await page.keyboard.press('Alt+h');
  await expect(page.getByRole('button', { name: '水平线', exact: true })).toBeVisible();
});
