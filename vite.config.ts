import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 基路径：Actions 环境由 GITHUB_REPOSITORY 推导（owner/repo → /repo/），
  // 本地开发与普通构建保持 '/'。无 react-router，单页应用无 SPA 回退问题。
  base: (() => {
    const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
    return process.env.GITHUB_ACTIONS && repo ? `/${repo}/` : '/';
  })(),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
    // 新浪 K 线已改为 script 标签 JSONP 直连（2026-10-08），不再需要 dev server 代理
  },
  build: {
    /**
     * 体积预算（2026-10-14 用户裁决：提阈值并登记预算，非关闭）。
     * 判据沿革：原 500 kB 是 Vite 默认值，B1 起被应用块逐批推高——B1 500.61 / B2 503.85 /
     * B3 505.87 / B4 506.49 kB。四次越线是同一未裁决项在滚，而非四次新问题。
     * 取 560 = 现值 + 约 54 kB 余量，覆盖三期-C（数据窗口表格 + 画线剪贴板，估 5–7 人日）
     * 的量级；越过 560 仍会警告，与本仓 oxlint「存量函数放宽至 120、>120 仍拦」同一哲学。
     * 真实门禁仍是 gzip ≤150 kB（现 144.87 kB）；原始体积只作可见性信号。
     */
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        /**
         * 代码分割（按「第三方库 / 应用代码」切分）。
         * 只切已有静态依赖图，不引入任何动态 import——切割边界不改变
         * 模块求值顺序与副作用，因此对渲染与既有黄金截图是结构中性的。
         *
         * Vite 8 起底层换为 Rolldown，`manualChunks` 虽仍接受但分组不稳定
         * （实测：函数式规则下 React 仍被并入 radix 块，react 块只剩 0.18kB 空壳），
         * 故改用 Rolldown 的 `codeSplitting.groups`（`advancedChunks` 是它的旧名，
         * 用旧名会打弃用警告）：按 test 正则分组，groups 有序——先匹配者优先，
         * 兜底的 vendor 必须放最后。
         */
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'radix', test: /[\\/]node_modules[\\/]@radix-ui[\\/]/ },
            { name: 'lucide', test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
            { name: 'zustand', test: /[\\/]node_modules[\\/]zustand[\\/]/ },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
