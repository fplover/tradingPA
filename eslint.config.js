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
      /*
       * eslint-plugin-react-hooks 7（随 eslint 10 升级）带入了 **React Compiler 规则集**，
       * 比 v5 严格得多。以下四条在本次升级中由 error 降为 warn（基线化管理，理由如下）：
       *
       * - react-hooks/refs（20 处）：命中的是「latest value ref」模式——本项目的核心
       *   架构原则是渲染循环与 React 解耦（行情高频更新不进 React 重渲染），因此
       *   useChartSeries / useAlertWatcher / quoteStore 等**有意**把最新 props/state
       *   镜像到 ref 供回调与 rAF 读取。彻底修好需改成 effect 内同步或启用 React Compiler，
       *   属独立批次（有真实回归风险），不在依赖升级范围内。
       * - react-hooks/set-state-in-effect（12 处）：effect 内同步派生状态，同上。
       * - react-hooks/purity（3 处）、react-hooks/use-memo（1 处）：编译器优化相关提示。
       *
       * 与既有的 exhaustive-deps / only-export-components 警告同一思路：0 错误门禁 +
       * 显式警告基线，债务可见且可逐条清偿（已登记 OPEN-DECISIONS）。
       */
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
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

  // 构建/测试配置脚本与仓库脚本（node 环境）
  {
    files: ['*.config.{js,ts,mjs,cjs}', '*.ts', 'scripts/**/*.mjs'],
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
