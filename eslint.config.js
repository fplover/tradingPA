import js from '@eslint/js';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint 扁平配置。
 *
 * ## 解析器选型（TS 7 迁移，2026-10-03）
 * 原用 typescript-eslint（@typescript-eslint/parser 依赖 `typescript` 包的 JS API 解析）。
 * TypeScript 7.0（原生编译器）**不再附带 JS API**（官方预期，7.1 才发布新 API），
 * typescript-eslint 8.71 peer 上限 <6.1.0，官方对 7.1+ 的支持在 issue #10940 追踪。
 * 故解析器切换为 @babel/eslint-parser（Babel 内置 typescript/jsx 插件语法解析，
 * 零 `typescript` 包依赖），lint 门禁与 `typescript` 版本彻底解耦。
 *
 * ## 规则面变化（随解析器切换）
 * - **保留**：js.recommended + react-hooks 全家族（含 v7 编译器规则）+ react-refresh——
 *   这三者不依赖 typescript 包，规则与警告基线（68 条）原样延续。
 * - **去掉**：@typescript-eslint/no-unused-vars——类型层由 tsc 的
 *   noUnusedLocals/noUnusedParameters 把关（原配置注释已声明此分工），
 *   `_` 前缀豁免参数与 TS 默认行为一致。
 * - **去掉**：@typescript-eslint/no-explicit-any——warn 级风格提示，非门禁项。
 *
 * 定位：typecheck 管类型、vitest/playwright 管行为，lint 只补两者都管不到的一类——
 * hooks 依赖与调用规则、import 卫生、明显易错写法。因此**刻意不启用**风格类规则
 * （缩进/引号/换行交给 .editorconfig 与 Prettier），避免与既有 3 万行代码形成噪声对抗。
 */
const babelTsParserOptions = {
  requireConfigFile: false,
  babelOptions: {
    parserOpts: {
      // @babel/parser 内置语法插件，非独立 npm 包
      plugins: ['typescript', 'jsx'],
    },
  },
};

export default [
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
    languageOptions: {
      parser: babelParser,
      parserOptions: babelTsParserOptions,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      /*
       * TS 文件关闭 no-undef：TS 全局（Record/Partial/lib.dom 等）由 tsc + lib 类型把关，
       * Babel 解析器会把类型引用交给核心规则遍历造成全量误报——
       * 这也是 typescript-eslint 官方对 TS 文件的推荐配置（eslint-recommended 同款关闭项）。
       */
      'no-undef': 'off',
      // 核心规则不理解 TS 类型语法（interface/type 被当未使用声明全量误报）；
      // TS 未使用代码由 tsc noUnusedLocals/noUnusedParameters 把关（typecheck 门禁）
      'no-unused-vars': 'off',
      /*
       * eslint-plugin-react-hooks 7（随 eslint 10 升级）带入了 **React Compiler 规则集**，
       * 比 v5 严格得多。以下四条在升级时由 error 降为 warn（基线化管理，理由如下）：
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
      // 与 P0 红线一致：渲染/数据路径不允许静默吞错，但允许 catch 内注释说明的空块
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // 单测与 E2E（node + 浏览器桩混用）
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: babelTsParserOptions,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      // 同上：TS 文件由 tsc 把关全局与未使用代码
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },

  // 构建/测试配置脚本与仓库脚本（node 环境）
  {
    files: ['*.config.{js,ts,mjs,cjs}', '*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      parser: babelParser,
      parserOptions: { requireConfigFile: false },
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
