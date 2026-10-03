import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * ESLint 扁平配置（本项目首次引入 lint 门禁）。
 *
 * 定位：typecheck 管类型、vitest/playwright 管行为，lint 只补两者都管不到的一类——
 * hooks 依赖与调用规则、import 卫生、明显易错写法。因此**刻意不启用**风格类规则
 * （缩进/引号/换行交给 .editorconfig 与 Prettier），避免与既有 3 万行代码形成噪声对抗。
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.playwright-browsers/**',
      '.workbuddy/**',
      '.shots/**',
    ],
  },

  // 应用与引擎源码（浏览器环境 + React）
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 类型层由 tsc 的 noUnusedLocals/noUnusedParameters 把关；此处只兜住 export 面
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 引擎重启/调试期显式 any 是既有事实，先降为提示，不做批量改写
      '@typescript-eslint/no-explicit-any': 'warn',
      // 与 P0 红线一致：渲染/数据路径不允许静默吞错，但允许 catch 内注释说明的空块
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // 单测与 E2E（node + 浏览器桩混用）
  {
    files: ['tests/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // 构建/测试配置脚本（node 环境）
  {
    files: ['*.config.{js,ts,mjs,cjs}', '*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
