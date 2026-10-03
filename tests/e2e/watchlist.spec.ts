import { test, expect } from '@playwright/test';

/** 自选股面板：默认停靠、真实报价、涨跌幅 pill */
test('自选股面板显示多市场实时报价', async ({ page }) => {
  await page.goto('/');
  // 面板默认停靠，列表名与列头可见
  await expect(page.getByRole('button', { name: '切换自选股列表' })).toBeVisible();
  await expect(page.getByRole('button', { name: '代码', exact: true })).toBeVisible();

  // 报价轮询到位：至少一行出现涨跌幅 pill（带百分号）
  await expect(page.getByText(/^[+-]\d+\.\d{2}%$/).first()).toBeVisible({ timeout: 20_000 });
  // 多市场都在：A股 + 美股 + 国内期货 + 外盘期货（exact 避免匹配到顶栏品种按钮）
  await expect(page.getByRole('button', { name: '600519 贵州茅台', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AAPL 苹果', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'rbm 螺纹钢主连', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GC00Y COMEX黄金', exact: true })).toBeVisible();
});

/** 符号搜索：/ 打开、回车切换图表品种 */
test('符号搜索切换图表品种', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('/');
  const input = page.getByRole('textbox', { name: '搜索品种' });
  await expect(input).toBeFocused();

  await input.fill('平安');
  const target = page.getByRole('option', { name: /601318/ });
  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.click();

  // 图表切到中国平安：顶栏品种按钮的 aria-label 反映当前品种
  await expect(page.getByRole('button', { name: /当前品种 601318/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 15_000 });
});

/** 符号搜索 add 模式：加入列表但不切换图表 */
test('搜索弹窗加号模式只加入列表', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '添加品种' }).click();
  const input = page.getByRole('textbox', { name: '搜索品种' });
  await input.fill('比亚迪');
  const target = page.getByRole('option', { name: /002594/ });
  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.click();

  // 列表里出现了新行
  await expect(page.getByRole('button', { name: '002594 比亚迪', exact: true })).toBeVisible();
  // 图表品种没变（仍是默认的 600519）
  await expect(page.getByRole('button', { name: /当前品种 600519/ })).toBeVisible();

  // 移除该行
  await page.getByRole('button', { name: '002594 比亚迪', exact: true }).hover();
  await page.getByRole('button', { name: '从列表移除 002594' }).click();
  await expect(page.getByRole('button', { name: '002594 比亚迪', exact: true })).toBeHidden();
});

/** 期货分类搜索走合约全集 */
test('期货分类可搜到合约', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await page.getByRole('button', { name: '国内期货', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索品种' }).fill('螺纹');
  await expect(page.getByRole('option', { name: /rb26/ }).first()).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: '搜索品种' })).toBeHidden();
});

/** 列头三态排序：升 → 降 → 手动 */
test('列头点击三态排序', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/^[+-]\d+\.\d{2}%$/).first()).toBeVisible({ timeout: 20_000 });

  const firstRow = () => page.locator('[data-testid="watchlist-row"]').first().getAttribute('aria-label');
  const before = await firstRow();

  const header = page.getByRole('button', { name: '涨跌幅', exact: true });
  await header.click(); // 升序
  await page.waitForTimeout(300);
  const asc = await firstRow();
  await header.click(); // 降序
  await page.waitForTimeout(300);
  const desc = await firstRow();

  expect(asc).not.toBe(desc);
  await header.click(); // 回到手动
  await page.waitForTimeout(300);
  expect(await firstRow()).toBe(before);
});

/** 右侧图标轨：切换停靠面板 */
test('右侧图标轨切换面板', async ({ page }) => {
  await page.goto('/');
  // 自选股默认打开
  await expect(page.getByRole('button', { name: '切换自选股列表' })).toBeVisible();
  // 切到对象树：自选股收起，对象树出现
  await page.getByRole('button', { name: '对象树' }).click();
  await expect(page.getByText(/对象树（\d+）/)).toBeVisible();
  await expect(page.getByRole('button', { name: '切换自选股列表' })).toBeHidden();
  // 再点一次收起
  await page.getByRole('button', { name: '对象树' }).click();
  await expect(page.getByText(/对象树（\d+）/)).toBeHidden();
});

/** 日线滚到最左自动加载更早历史，且视口不跳回右边缘 */
test('向左滚动加载更早历史', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '周期' }).click();
  await page.getByRole('menuitem', { name: '1日', exact: true }).click();
  await expect(page.getByText(/\d+ 根 · 1日/)).toBeVisible({ timeout: 15_000 });
  // 等日线真正落地（状态条显示源与根数），避免在在途加载时触发翻页
  await expect(page.getByText(/腾讯财经 · \d+ 根/)).toBeVisible({ timeout: 15_000 });

  const countOf = () =>
    page.evaluate(
      () =>
        (window as unknown as { __chartRenderer?: { getBars(): unknown[] } }).__chartRenderer?.getBars().length ?? 0,
    );
  const before = await countOf();
  expect(before).toBeGreaterThan(100);

  await page.evaluate(() => {
    const r = (
      window as unknown as {
        __chartRenderer?: {
          getViewport(): { first: number; spacing: number };
          setSyncViewport(v: { first: number; spacing: number }): void;
        };
      }
    ).__chartRenderer;
    r?.setSyncViewport({ first: 0, spacing: r.getViewport().spacing });
  });
  await expect.poll(countOf, { timeout: 20_000 }).toBeGreaterThan(before);
});

/** 面板宽度可拖拽并持久化 */
test('拖拽调整面板宽度', async ({ page }) => {
  await page.goto('/');
  const sep = page.getByRole('separator', { name: '拖拽调整面板宽度' });
  await expect(sep).toBeVisible();
  const before = (await sep.boundingBox())!;

  await page.mouse.move(before.x + 2, before.y + 300);
  await page.mouse.down();
  await page.mouse.move(before.x + 2 - 80, before.y + 300, { steps: 8 });
  await page.mouse.up();

  // 分隔条左移 = 面板变宽，且已持久化
  const after = (await sep.boundingBox())!;
  expect(after.x).toBeLessThan(before.x - 40);
  const stored = await page.evaluate(() => Number(localStorage.getItem('tradingpa.rightdock.width')));
  expect(stored).toBeGreaterThanOrEqual(360);
});
