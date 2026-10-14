import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// 浏览器二进制安装在 workspace 内（避免全局缓存锁冲突），.gitignore 已排除
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('./.playwright-browsers', import.meta.url));

// 端口可用 PORT 覆盖：本机残留旧 dev server 占住 5173 时，指向带最新 vite 配置的实例
const PORT = Number(process.env.PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // A3-1：黄金截图基线目录（toHaveScreenshot 经 expect.pathTemplate 落此）
  snapshotDir: './tests/e2e/__screenshots__',
  // 首个用例会触发 dev server 冷编译（~60 模块），由 webServer.url 健康检查 + 用例内
  // 显式 timeout 承担，不靠重试兜底（2026-10-14 用户裁决 retries 归零）：
  // 本仓交付标准一直是 `--retries=0` 全绿 + 27 面黄金截图零 diff，配置留 1 只会让
  // 「不带 flag 的本地跑法」与被采纳的结果不一致，把 flaky 藏在重试里。
  retries: 0,
  // 图表应用较重（10 万 K 线 + 实时流），并行页面互相抢资源会 flaky，串行执行
  workers: 1,
  fullyParallel: false,
  expect: {
    toHaveScreenshot: {
      // 黄金截图统一落 <snapshotDir>/<name>.png（A3-1：tests/e2e/__screenshots__/）
      pathTemplate: '{snapshotDir}/{arg}{ext}',
    },
  },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    // 首个用例会触发 dev server 冷编译（~60 模块），由健康检查与用例 timeout 承担（见上）；
    // retries 归零后 'on-first-retry' 永不落地（不会有第二次尝试），改为失败即留 trace
    trace: 'retain-on-failure',
  },
  projects: [
    // 使用系统 Chrome（本环境无法从 CDN 下载 Playwright 内置 chromium）
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
