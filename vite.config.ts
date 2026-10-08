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
    proxy: {
      // 新浪校验 Referer 且不带 CORS 头，浏览器无法直连，只能由 dev server 代发
      '/sina-futures': {
        target: 'https://stock2.finance.sina.com.cn',
        changeOrigin: true,
        secure: false,
        headers: { Referer: 'https://finance.sina.com.cn/' },
        rewrite: (path) => path.replace(/^\/sina-futures/, ''),
      },
      '/sina-us': {
        target: 'https://stock.finance.sina.com.cn',
        changeOrigin: true,
        secure: false,
        headers: { Referer: 'https://finance.sina.com.cn/' },
        rewrite: (path) => path.replace(/^\/sina-us/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * 代码分割（存量债务：单 chunk >500kB 警告从未处理）。
         * 只按「第三方库 / 应用代码」切分，不引入任何动态 import——切割边界不改变
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
