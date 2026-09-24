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
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
