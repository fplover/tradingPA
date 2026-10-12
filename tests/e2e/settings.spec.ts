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

  // 图表设置：左导航页签（模板页见下方专测），外观页可关网格
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

/** 三期-B1：图表模板的命名保存 / 应用 / 重命名 / 删除。
 *  模板是 B0 偏好切片的命名快照，故「应用」的证据面就是画布偏好真的被整份覆盖回去
 *  （改造前无任何模板面，偏好只能逐项手改）。 */
test('图表模板保存与跨刷新应用', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const openTemplateTab = async () => {
    await page.getByRole('button', { name: '图表设置' }).click();
    await page.getByRole('button', { name: '模板', exact: true }).click();
  };
  // 对话框左导航常驻，页签间直接切换即可（重复点「图表设置」会被遮罩拦截）
  const tab = (name: string) => page.getByRole('button', { name, exact: true }).click();

  await openTemplateTab();
  await expect(page.getByText('保存当前图表设置为模板，随时一键应用')).toBeVisible();

  // 造一份非默认偏好：水印开 + 网格竖
  await tab('Canvas');
  await page.getByRole('checkbox', { name: '水印' }).click();
  await tab('外观');
  await page.getByRole('radio', { name: '竖', exact: true }).click();

  // 命名保存 → 行出现，且落盘的是偏好快照（不是只有名字）
  await tab('模板');
  await page.getByLabel('模板名称').fill('看盘样式');
  await page.getByRole('button', { name: '保存当前为模板' }).click();
  const row = page.getByTestId('template-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('看盘样式');
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.chartTemplates.v1'));
      if (!raw) return null;
      const p = JSON.parse(raw)[0].prefs;
      return `${p.watermarkVisible}/${p.gridMode}`;
    })
    .toBe('true/vertical');

  // 改动偏好后刷新（模板列表本身跨刷新保留），点行应用 → 整份快照覆盖当前偏好
  await tab('Canvas');
  await page.getByRole('checkbox', { name: '水印' }).click();
  await tab('外观');
  await page.getByRole('radio', { name: '全', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await openTemplateTab();
  await expect(page.getByTestId('template-row')).toHaveCount(1);
  await page.getByRole('button', { name: '应用模板 看盘样式' }).click();
  await tab('Canvas');
  await expect(page.getByRole('checkbox', { name: '水印' })).toHaveAttribute('aria-checked', 'true');
  await tab('外观');
  await expect(page.getByRole('radio', { name: '竖', exact: true })).toHaveAttribute('aria-checked', 'true');
  // 应用经 B0 的单点订阅写回偏好键
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.chartPrefs.v1'));
      return raw ? JSON.parse(raw).gridMode : null;
    })
    .toBe('vertical');

  // 行内重命名（Enter 提交）→ 删除（confirm 二次确认）→ 回空态
  await tab('模板');
  await page.getByRole('button', { name: '重命名模板 看盘样式' }).click();
  const draft = page.getByLabel('重命名模板 看盘样式');
  await draft.fill('趋势');
  await draft.press('Enter');
  await expect(page.getByTestId('template-row')).toContainText('趋势');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '删除模板 趋势' }).click();
  await expect(page.getByTestId('template-row')).toHaveCount(0);
  await expect(page.getByText('保存当前图表设置为模板，随时一键应用')).toBeVisible();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.chartTemplates.v1'));
      return raw ? JSON.parse(raw).length : null;
    })
    .toBe(0);
});

/** 三期-B1 共用呈现层回归：指标对话框的模板分区（NamedTemplateSection 的既有调用方）。
 *  自 B1 起该分区与图表设置「模板」页共用同一呈现层，本测锁住其对外契约（空态 / 空名置灰 /
 *  重名序号 / 行内重命名 / 删除二次确认 / 落盘键），使共用化不是只有图表侧有证据。 */
test('指标模板分区契约（共用呈现层回归）', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '指标', exact: true }).click();

  const section = page.getByRole('region', { name: '指标模板' });
  await expect(section.getByText('保存当前指标组合为模板，随时一键应用')).toBeVisible();
  const saveBtn = section.getByRole('button', { name: '保存当前为模板' });
  await expect(saveBtn).toBeDisabled();

  await section.getByLabel('模板名称').fill('甲');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await section.getByLabel('模板名称').fill('甲');
  await saveBtn.click();
  await expect(section.getByTestId('template-row')).toHaveCount(2);
  await expect(section.getByText('甲 (2)')).toBeVisible();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.indicatorTemplates'));
      return raw
        ? JSON.parse(raw)
            .map((t: { name: string }) => t.name)
            .join(',')
        : null;
    })
    .toBe('甲 (2),甲');

  // 行内重命名 Enter 提交；删除走 confirm 二次确认
  await section.getByRole('button', { name: '重命名模板 甲', exact: true }).click();
  const draft = section.getByRole('textbox', { name: '重命名模板 甲', exact: true });
  await draft.fill('乙');
  await draft.press('Enter');
  await expect(section.getByTestId('template-row')).toHaveCount(2);
  await expect(section.getByText('乙')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await section.getByRole('button', { name: '删除模板 乙', exact: true }).click();
  await expect(section.getByTestId('template-row')).toHaveCount(1);
  page.once('dialog', (d) => d.accept());
  await section.getByRole('button', { name: '删除模板 甲 (2)', exact: true }).click();
  await expect(section.getByTestId('template-row')).toHaveCount(0);
  await expect(section.getByText('保存当前指标组合为模板，随时一键应用')).toBeVisible();
});

/** 图例右键菜单：开关图例各部分 */ test('图例右键菜单', async ({ page }) => {
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
