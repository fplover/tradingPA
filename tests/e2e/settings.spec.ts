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

/** 三期-B2：图表设置「交易」页。改造前四项默认值散落在五处硬编码（0.01 ×4、×1.01、100_000），
 *  本页把它们收成一个落盘偏好，并证明它真的流入下单表单与模拟盘引擎——不是只存在 store 里。 */
test('交易页偏好跨刷新保留并流入下单表单', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '图表设置' }).click();
  await page.getByRole('button', { name: '交易', exact: true }).click();

  // 初值 = 改造前的硬编码逐位相同
  const qty = page.getByRole('spinbutton', { name: '默认下单数量' });
  const sl = page.getByRole('spinbutton', { name: '止损价偏移' });
  await expect(qty).toHaveValue('0.01');
  await expect(sl).toHaveValue('1');
  await expect(page.getByRole('spinbutton', { name: '模拟盘初始资金' })).toHaveValue('100000');
  await expect(page.getByRole('checkbox', { name: /显示交易可视化/ })).toHaveAttribute('aria-checked', 'true');

  await qty.fill('0.25');
  await sl.fill('2');
  await page.getByRole('spinbutton', { name: '模拟盘初始资金' }).fill('250000');
  const showTrading = page.getByRole('checkbox', { name: /显示交易可视化/ });
  await showTrading.click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.tradeSettings.v1'));
      if (!raw) return null;
      const p = JSON.parse(raw);
      return `${p.defaultQty}/${p.stopOffsetPct}/${p.initialBalance}/${p.showTrading}`;
    })
    .toBe('0.25/2/250000/false');

  // 接线证明：复选框 → store → 对话框下发 effect → 主图引擎状态（画布层证据见 renderer-input 单测）
  const engineTradingOn = () =>
    page.evaluate(
      () =>
        (window as unknown as { __chartRenderer?: { tradingVisible?: boolean } }).__chartRenderer?.tradingVisible ??
        null,
    );
  await expect.poll(engineTradingOn).toBe(false);

  await page.keyboard.press('Escape');

  // 刷新后读回真值（不是回到硬编码默认），且引擎重新收到关档
  await page.reload();
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '图表设置' }).click();
  await page.getByRole('button', { name: '交易', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: '默认下单数量' })).toHaveValue('0.25');
  await expect(page.getByRole('spinbutton', { name: '止损价偏移' })).toHaveValue('2');
  await expect(page.getByRole('checkbox', { name: /显示交易可视化/ })).toHaveAttribute('aria-checked', 'false');
  await expect.poll(engineTradingOn).toBe(false);

  // 流入下单表单：进入回放 → 挂单对话框数量初值 = 偏好；止损价 = 当前价 × (1 + 2%)
  await page.getByRole('checkbox', { name: /显示交易可视化/ }).click(); // 恢复显示再走下单链路
  await expect.poll(engineTradingOn).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '回放：点击后在图表上选择 K 线作为起点' }).click();
  await page.locator('canvas').click({ position: { x: 400, y: 300 } });
  // 初始资金经引擎构造抵达面板权益
  await expect(page.getByText('权益 250000.00')).toBeVisible();
  await page.getByRole('button', { name: '限价 / 止损挂单' }).click();
  const dlg = page.getByRole('dialog', { name: '挂单' });
  await expect(dlg.getByLabel('数量')).toHaveValue('0.25');
  await dlg.getByRole('button', { name: '止损', exact: true }).click();
  const priceText = (await dlg.getByText(/当前价/).textContent())?.match(/当前价 ([0-9.]+)/)?.[1];
  expect(priceText).toBeTruthy();
  await expect(dlg.getByLabel('止损价')).toHaveValue((Number(priceText) * 1.02).toFixed(2));

  // 第 5 处调用点（图表右键下单浮窗）：回放态右键 → 数量同样取偏好；
  // 关档改 市价/卖出 后点遮罩关闭 → 卸载，重开回到默认档且数量仍是偏好（证明每次打开重新播种）
  await page.keyboard.press('Escape');
  const menu = page.getByTestId('chart-order-menu');
  const openMenu = async () => {
    await page
      .locator('canvas')
      .first()
      .click({ button: 'right', position: { x: 400, y: 300 } });
    await expect(menu).toBeVisible();
  };
  await openMenu();
  await expect(menu.getByLabel('数量')).toHaveValue('0.25');
  await expect(menu.getByLabel('价格')).toBeVisible();
  await menu.getByRole('button', { name: '市价', exact: true }).click();
  await expect(menu.getByLabel('价格')).toBeHidden();
  await page.mouse.click(20, 300); // 遮罩 pointerdown 关闭浮窗
  await expect(menu).toBeHidden();
  await openMenu();
  await expect(menu.getByLabel('数量')).toHaveValue('0.25');
  await expect(menu.getByLabel('价格')).toBeVisible();
});

/** 三期-B3：图表设置「一般」页（时区口径只做显示层）。
 *  默认档 = 浏览器本地，且必须与改造前逐字等价——这是 27 面黄金截图零 diff 的凭据，
 *  也是最容易被「顺手改成 UTC」改坏的性质，故连状态栏读数一起锁住。 */
test('一般页时区偏好落盘并流入引擎与状态栏', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const engineTz = () =>
    page.evaluate(() => {
      const r = (window as unknown as { __chartRenderer?: { tzOffsetMinutes?: number | null } }).__chartRenderer;
      // null 是合法档位（浏览器本地），不能与「句柄/属性缺失」混为一谈，故显式分支
      if (!r) return 'no-dev-handle';
      return 'tzOffsetMinutes' in r ? r.tzOffsetMinutes : 'no-such-getter';
    });
  const localOffset = () => page.evaluate(() => -new Date().getTimezoneOffset());
  /** 状态栏时区标的期望值：按浏览器本地偏移算，不写死 UTC+8（CI 时区不同） */
  const localLabel = async () => {
    const hours = (await localOffset()) / 60;
    const abs = Math.abs(hours);
    return `UTC${hours >= 0 ? '+' : '-'}${abs % 1 === 0 ? abs : abs.toFixed(1)}`;
  };
  const statusTz = page.getByTestId('status-tz');
  const stepper = page.getByRole('spinbutton', { name: '时区偏移' });
  const openGeneralTab = async () => {
    await page.getByRole('button', { name: '图表设置' }).click();
    await page.getByRole('button', { name: '一般', exact: true }).click();
  };

  // 默认档：引擎收 null、步进器不出现、状态栏 = 浏览器本地（改造前口径）
  await expect.poll(engineTz).toBeNull();
  await expect(statusTz).toHaveText(await localLabel());

  await openGeneralTab();
  await expect(page.getByRole('radio', { name: '浏览器本地', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(stepper).toBeHidden();

  // 由本地切固定偏移：以当前本地偏移起算，切档瞬间图上读数与状态栏都不跳
  await page.getByRole('radio', { name: '固定偏移', exact: true }).click();
  await expect(stepper).toBeVisible();
  const seeded = await localOffset();
  await expect(stepper).toHaveValue(String(seeded));
  await expect.poll(engineTz).toBe(seeded);
  await expect(statusTz).toHaveText(await localLabel());

  // 半小时档：引擎读数 + 状态栏 + 落盘三处同向
  await stepper.fill('330');
  await expect.poll(engineTz).toBe(330);
  await expect(statusTz).toHaveText('UTC+5.5');
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.chartPrefs.v1'));
      return raw ? JSON.parse(raw).tzOffsetMinutes : null;
    })
    .toBe(330);
  await page.keyboard.press('Escape');

  // 刷新：读回真值而非回到本地档，且引擎重新收到该档
  await page.reload();
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });
  await expect.poll(engineTz).toBe(330);
  await expect(statusTz).toHaveText('UTC+5.5');
  await openGeneralTab();
  await expect(page.getByRole('radio', { name: '固定偏移', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(stepper).toHaveValue('330');

  // UTC 档 = 固定偏移填 0（不与「浏览器本地」混档），状态栏随之
  await stepper.fill('0');
  await expect.poll(engineTz).toBe(0);
  await expect(statusTz).toHaveText('UTC+0');

  // 越界由步进器 clamp 到 TZ_OFFSET_LIMITS（与读档 clamp 同一份上下限）
  await stepper.fill('5000');
  await expect(stepper).toHaveValue('840');
  await expect.poll(engineTz).toBe(840);
  await expect(statusTz).toHaveText('UTC+14');

  // 回本地档：引擎收 null、步进器消失、状态栏回到本地读数
  await page.getByRole('radio', { name: '浏览器本地', exact: true }).click();
  await expect(stepper).toBeHidden();
  await expect.poll(engineTz).toBeNull();
  await expect(statusTz).toHaveText(await localLabel());
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('tradingpa.chartPrefs.v1'));
      return raw ? JSON.parse(raw).tzOffsetMinutes : null;
    })
    .toBeNull();
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
