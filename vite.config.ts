/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
         * 依 vite 官方建议把体积大且更新频率低的依赖单独成块，借浏览器缓存。
         *
         * 用函数式而非对象式：对象式按「模块 id 精确值」匹配，React 实际经
         * `react/jsx-runtime`（自动 JSX 运行时）与 `react-dom/client` 进入图，
         * 列 `'react'`/`'react-dom'` 会得到一个 0.03kB 的空壳块（实测）。
         * 函数式按解析后的 node_modules 路径归类，稳定命中。
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('lucide-react')) return 'lucide';
          if (id.includes('zustand')) return 'zustand';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
