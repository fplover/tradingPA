import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'D:/workspace/tradingPA/.shots';
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:5173/';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => /[1-9][0-9,]* 根/.test(document.body.innerText), { timeout: 25000 });
await page.waitForTimeout(1500);
const draw = () => page.evaluate(() => window.__chartRenderer?.draw());

// 01 dark default + crosshair
await page.mouse.move(600, 400);
await page.waitForTimeout(300);
await draw();
await page.screenshot({ path: `${OUT}/a01-dark.png` });

// 02 light default
await page.getByRole('button', { name: '切换到浅色' }).click();
await page.waitForTimeout(600);
await draw();
await page.screenshot({ path: `${OUT}/a02-light.png` });
await page.getByRole('button', { name: '切换到深色' }).click();
await page.waitForTimeout(400);

// 03 indicator panel + settings dialog
await page.getByRole('button', { name: '指标', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/a03-ind-panel.png` });
await page.getByText('RSI 相对强弱').click();
await page.waitForTimeout(600);
const rsiChip = page.locator('span').filter({ hasText: 'RSI 相对强弱' }).filter({ has: page.getByRole('button', { name: '设置' }) });
await rsiChip.getByRole('button', { name: '设置' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/a04-ind-settings.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.getByRole('button', { name: '指标', exact: true }).click();
await page.waitForTimeout(300);

// 05 replay mode
await page.getByRole('button', { name: '回放：点击后在图表上选择 K 线作为起点' }).click();
await page.waitForTimeout(300);
await page.locator('canvas').first().click({ position: { x: 500, y: 350 } });
await page.waitForTimeout(800);
await draw();
await page.screenshot({ path: `${OUT}/a05-replay.png` });
await page.getByRole('button', { name: '退出回放' }).click();
await page.waitForTimeout(400);

// 06 four layout
await page.getByRole('button', { name: '布局：四分' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/a06-grid.png` });
await page.getByRole('button', { name: '布局：单图' }).click();
await page.waitForTimeout(600);

console.log('ERRORS:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
