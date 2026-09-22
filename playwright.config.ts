import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// 浏览器二进制安装在 workspace 内（避免全局缓存锁冲突），.gitignore 已排除
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('./.playwright-browsers', import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // 首个用例会触发 dev server 冷编译（~60 模块），允许 1 次重试消解 flaky
  retries: 1,
  // 图表应用较重（10 万 K 线 + 实时流），并行页面互相抢资源会 flaky，串行执行
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    // 使用系统 Chrome（本环境无法从 CDN 下载 Playwright 内置 chromium）
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
