# tradingPA

TradingView 图表平台的 1:1 复刻：React 18 + TypeScript + Vite + Zustand，图表渲染是**自研 Canvas 2D 引擎**（框架无关，不依赖任何图表库）。

- 图表类型 18 种 · 时间周期 22 档（含自定义间隔）· 内置指标 64 个 · 画线工具 30 个
- 多市场数据源：加密（Binance）/ A 股·港股·美股（腾讯）/ 美股分钟·国内期货（新浪）/ 全市场搜索（东财）
- 平台能力：多图表布局 1/2/4/6/8、跨图联动、自选股、价格警报、复盘回放、模拟交易、Pine 子集 DSL、Compare 叠加

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器（HMR） |
| `npm run build` | `tsc -b`（app + node 双项目）+ Vite 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | 类型检查双项目：`tsconfig.json`（`src` + `tests/unit`，开着 `noUnusedLocals`）+ `tsconfig.node.json`（`vite.config.ts` / `playwright.config.ts` / `tests/e2e`） |
| `npm run lint` | oxlint（`.oxlintrc.json`，Rust 原生 0.3s；0 错误；61 条警告为存量债务基线：exhaustive-deps 19 / refs 14 / only-export-components 13 / set-state-in-effect 11 / purity 3 / use-memo 1；含函数级规模规则 max-statements 60 / max-params 10，7 个编排类文件放宽至 120） |
| `npm run lint:fix` | oxlint 自动修复 |
| `npm run format` / `format:check` | Prettier（代码/配置全覆盖，已全仓格式化；markdown 与 `docs/` 刻意排除，见 `.prettierignore` 的量化理由） |
| `npm test` | Vitest 单测（65 文件 / 1145 例） |
| `npm run test:e2e` | Playwright E2E（54 例，含 **27 面黄金截图**） |
| `npm run test:e2e:update` | 黄金截图重基线（**仅有意渲染变更时用**：跑完必须在同一提交里审查 `__screenshots__` 的 diff 并说明理由，禁止顺手全量更新） |
| `npm run audit` | 依赖漏洞审计（**必须走官方 registry**：本机配置的 npmmirror 镜像不实现 `/-/npm/v1/security/*`，直接 `npm audit` 会报 NOT_IMPLEMENTED） |
| `npm run verify` | 机器无关门禁一键跑：typecheck + lint + format:check + test（批次内快速闭环用） |

## 目录结构

```
src/
  engine/       自研渲染引擎（框架无关，不得 import React/zustand）
    renderer/     ChartController 门面 + 状态/管线/输入/手势/坐标轴/序列渲染（40 文件，含水印绘制）
    drawing/      画线数据模型、几何纯函数、canvas 绘制（26 文件，math 与 render 分离）
    profile/      Volume Profile（kline 近似，见 docs/DECISIONS）
    scale/ viewport/ crosshair/ canvas/ theme.ts countdown.ts
  indicators/   指标引擎
    core/         声明式 schema + 窗口化/脏缓存计算
    builtin/      64 个内置指标定义（按族分文件：trend-ma/trend-ichimoku/trend-supertrend、
                  momentum-macd/momentum-adx/momentum-atr、oscillators-rsi/oscillators-range/
                  oscillators-momentum、momentum-osc-smooth/momentum-osc-fisher/momentum-osc-roc…）
    pine/         Pine 子集编译器与解释器（tokenizer → parser → interpreter → taFunctions；
                  taFunctions 按族拆为 ta-shared/ta-overlap/ta-momentum/ta-math）
  data/         数据层
    sources/      多市场数据源路由（binance / tencent / sina / eastmoney）
    feed/         Binance REST + WS 实时通道
    aggregate.ts aggregatePath.ts liveBar.ts tz.ts cache/ BarSeries.ts
  store/        Zustand（UI/布局/指标/自选/警报/联动总线…），渲染态不进 React
  features/     平台功能（market / drawings / watchlist / layout / alerts / trading / command / replay / pine / settings）
  ui/           设计 token 与基础组件（primitives / controls / tokens）
  components/ hooks/ types/ styles/
tests/
  unit/         Vitest（65 文件，node 环境为主，需 DOM 的文件用 `// @vitest-environment jsdom`）
  e2e/          Playwright（7 spec / 54 例）+ __screenshots__ 黄金基线
docs/           Spec 与差距分析（见下）
```

## 质量门禁

批次出口标准：`npm run verify`（typecheck + lint + format:check + test 一键门禁）+ `npm run test:e2e` 全绿 + `npm run build` 通过。等价手工链：`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:e2e`。

> E2E 在 Windows 上必须先自己起 dev server 再跑（见下节）；`verify` 只含机器无关门禁，可随时跑。

当前实测基线（2026-10-08）：typecheck 0 错（**TypeScript 7 原生编译器，单一依赖无别名**）/ lint 0 错（**61 条警告**，oxlint 口径：exhaustive-deps 19 / refs 14 / only-export-components 13 / set-state-in-effect 11 / purity 3 / use-memo 1，全部为在案债务基线）/ 单测 1145 全过 / E2E 53 过 + 1 例网络 flaky（重试通过，**27 面黄金截图零 diff**）/ 构建 7 chunk、最大应用块 456.61 kB（>500 kB 警告已消除）。

**工具链统一 Vite 8 / oxc 生态（2026-10-03 迁移）**：`typescript` 为原生 7.0 单一依赖（无 JS API，官方预期形态）。原依赖 TS JS API 与 eslint/babel 的两处校验工具链统一迁到 **oxc 栈**（Vite 8 内置 Rolldown 的同源生态，Rust 原生解析）：
- **lint**：eslint 五件套 + @babel 三件套（共 8 个 devDep）→ **oxlint** 单二进制（`.oxlintrc.json`）。规则覆盖完备：react-hooks 全家族（含编译器规则 refs/purity/set-state-in-effect）+ react-refresh + TS 规则；`eslint-disable` 注释指令原样兼容（已探针验证）。61 条 vs 原 68 条：oxlint 的 refs/set-state-in-effect 移植更保守（-7），无新增类别。耗时 30s → **0.3s**。
- `no-undef`/`no-unused-vars` 对 TS 关闭（tsc 把关全局与未使用代码）。

**E2E 在 Windows 上必须先自己起 dev server 再跑**：

```bash
npm run dev &        # 或另一个终端；Playwright 配置为 reuseExistingServer
npm run test:e2e
```

让 Playwright 自管 `webServer` 时，Windows 上 `npm → vite` 孙进程无法回收会导致挂死（已登记于 `.workbuddy/memory/pitfalls.jsonl`）。

## 项目规则（施工红线）

- 图标只用 `lucide-react` 或自绘 SVG，禁字符 emoji
- 颜色一律走 CSS 变量 / 设计 token。**canvas 渲染路径与 UI 层零 hex 字面量**，可机械审计：
  默认色走 `src/engine/palette.ts`（TV 调色板数据，非硬编码）、主题色走 `src/engine/theme.ts`、
  UI 走 `--text-on-accent` / `--on-updown` / `--on-warn` 等 CSS 变量
- 渲染循环与 React 解耦：高频行情不触发 React 重渲染；跨图表联动走 `store/syncBus.ts`（sourceId 防环 + 限频）
- 函数级规模红线（oxlint 原生规则，随 lint 门禁执行）：单函数 ≤ **60 条语句**、≤ **10 个参数**
  （2026-10-08 由「单文件 ≤300 逻辑单元」自定义脚本改为函数级口径——实测全仓 3863 个函数，
  99.7% ≤30 条语句、最大 59；文件级口径对缺陷零捕获且最大文件 ChartController 三次裁决健康，
  函数级才直接度量「巨型函数」这个真实风险）。存量 7 个帧编排/分发类大函数（`RenderPipeline.draw`
  97 / `useTvShortcuts` onKey 107 / `drawLegendBlock` 88 / `drawIndicator` 80 / parser dispatch 73 /
  `parseShapeDirective` 70 / `PaneRenderer.draw` 64）经 `.oxlintrc.json` overrides 放宽至 120 并登记；
  放宽是提阈值而非关闭，>120 的新函数仍被拦
- 引擎侧框架无关：不得 import React / zustand
- 公开 API 签名冻结，重构保持调用点零改动（golden：27 面截图 + 1145 单测 + 54 E2E）

## 已知状态与待办

- **依赖漏洞 → 0（2026-10-08 复核）**：经依赖升级专项批次（vite 5→8、vitest 3→5、react 18→19、
  zustand 4→5、TS 5.6→6.0.3、eslint 9→10，见 git log `507be30`…`956fa1f`），`npm run audit` 报
  **found 0 vulnerabilities**。复查命令不变：`npm run audit`（必须走官方 registry）。
  2026-10-08 二次审计：传递依赖 `source-map-js`（jsdom→css-tree / vite→postcss 链）出现 1 项
  high（GHSA-68fv-2mgg-jv7q），已 `npm audit fix --registry=...` 升至 1.2.2 修复；同批清理死
  依赖 `oxc-parser`（唯一消费者 check-file-size.mjs 已退役）并更新 semver 兼容依赖
  （radix minors / lucide 1.52 / plugin-react 6.1.2 / vite 8.3.3 / oxlint 1.87 / jsdom 30.1.2），
  全量门禁 + E2E 54/54（27 面黄金截图零 diff）实证行为中性。残留 outdated 仅跨主版本
  （@types/node 26 线对 Node 26、jsdom 29 线低于已装的 30）——按 engines 锁定 22 线不动。
- Node 版本要求已固化为 `engines: node >=22.22.2`（jsdom@30 的声明要求；npm 默认只警告不强制，旧环境 22.21.1 会打 `EBADENGINE` 警告）。
- `git blame` 建议启用忽略清单：`git config blame.ignoreRevsFile .git-blame-ignore-revs`（跳过纯格式化提交）。

已收口（2026-09-30）：无 lint 门禁 → 已引入 ESLint + `.editorconfig` + `.gitattributes`；单 chunk >500 kB → 已按 vendor 分块（最大应用块 445 kB）；canvas hex 无审计口径 → 已集中到 `palette.ts`，`.ts/.tsx` 中的 hex 259 → 90 且**使用点零字面量**（剩余全为 token/调色板定义、Pine 语言常量表与注释）；P2-B 画线家族无像素安全网 → 已补 6 面覆盖 25 个工具（黄金面 21 → 27）；Prettier 未全仓应用 → 已单批格式化（162 处内容变更，`format:check` 转绿，行为中性经 27 面黄金截图零 diff 证明）。

## 文档

| 文件 | 内容 |
|---|---|
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | 开发计划与 1:1 对照清单（§3 为功能验收基线） |
| [docs/SPEC-TV-ALIGNMENT.md](docs/SPEC-TV-ALIGNMENT.md) | TV 对齐 v2.0 主规格；**§12 变更记录 = 项目决策登记表** |
| [docs/SPEC-P1.md](docs/SPEC-P1.md) / [docs/SPEC-P2.md](docs/SPEC-P2.md) | P1（功能广度）/ P2（收官批次）规格与交付记录 |
| [docs/decisions/OPEN-DECISIONS.md](docs/decisions/OPEN-DECISIONS.md) | 未决项登记册（只追加 + 就地关闭） |
| [docs/decisions/ADR-001-volume-profile-kline-approx.md](docs/decisions/ADR-001-volume-profile-kline-approx.md) | Volume Profile kline 近似裁决 |
| [docs/GAP_ANALYSIS_TV_vs_tradingPA.md](docs/GAP_ANALYSIS_TV_vs_tradingPA.md) / [docs/UI_GAP_ANALYSIS_pixel.md](docs/UI_GAP_ANALYSIS_pixel.md) | 功能维度 / UI 像素维度差距分析 |
| [.workbuddy/memory/](.workbuddy/memory/) | 工作日志与踩坑记录（`pitfalls.jsonl`，未入版本库） |
