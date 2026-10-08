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
| `npm run build` | `tsc -b` + Vite 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | 类型检查（含 `src` 与 `tests/unit`，开着 `noUnusedLocals`） |
| `npm run check:size` | 文件规模检查（**逻辑单元**口径，oxc-parser AST 计数、与排版无关；含存量例外清单） |
| `npm run lint` | oxlint（`.oxlintrc.json`，Rust 原生 0.3s；0 错误；61 条警告为存量债务基线：exhaustive-deps 19 / refs 14 / only-export-components 13 / set-state-in-effect 11 / purity 3 / use-memo 1） |
| `npm run lint:fix` | oxlint 自动修复 |
| `npm run format` / `format:check` | Prettier（代码/配置全覆盖，已全仓格式化；markdown 与 `docs/` 刻意排除，见 `.prettierignore` 的量化理由） |
| `npm test` | Vitest 单测（62 文件 / 1090 例） |
| `npm run test:e2e` | Playwright E2E（54 例，含 **27 面黄金截图**） |
| `npm run audit` | 依赖漏洞审计（**必须走官方 registry**：本机配置的 npmmirror 镜像不实现 `/-/npm/v1/security/*`，直接 `npm audit` 会报 NOT_IMPLEMENTED） |

## 目录结构

```
src/
  engine/       自研渲染引擎（框架无关，不得 import React/zustand）
    renderer/     ChartController 门面 + 状态/管线/输入/手势/坐标轴/序列渲染（39 文件）
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
  unit/         Vitest（62 文件，node 环境为主，需 DOM 的文件用 `// @vitest-environment jsdom`）
  e2e/          Playwright（7 spec / 54 例）+ __screenshots__ 黄金基线
docs/           Spec 与差距分析（见下）
```

## 质量门禁

批次出口标准：`npm run typecheck && npm run lint && npm run check:size && npm test && npm run test:e2e` 全绿 + `npm run build` 通过。

当前实测基线（2026-10-08）：typecheck 0 错（**TypeScript 7 原生编译器，单一依赖无别名**）/ lint 0 错（**61 条警告**，oxlint 口径：exhaustive-deps 19 / refs 14 / only-export-components 13 / set-state-in-effect 11 / purity 3 / use-memo 1，全部为在案债务基线）/ 单测 1090 全过 / E2E 53 过 + 1 例网络 flaky（重试通过，**27 面黄金截图零 diff**）/ 构建 7 chunk、最大应用块 453.49 kB（>500 kB 警告已消除）。

**工具链统一 Vite 8 / oxc 生态（2026-10-03 迁移）**：`typescript` 为原生 7.0 单一依赖（无 JS API，官方预期形态）。原依赖 TS JS API 与 eslint/babel 的两处校验工具链统一迁到 **oxc 栈**（Vite 8 内置 Rolldown 的同源生态，Rust 原生解析）：
- **lint**：eslint 五件套 + @babel 三件套（共 8 个 devDep）→ **oxlint** 单二进制（`.oxlintrc.json`）。规则覆盖完备：react-hooks 全家族（含编译器规则 refs/purity/set-state-in-effect）+ react-refresh + TS 规则；`eslint-disable` 注释指令原样兼容（已探针验证）。61 条 vs 原 68 条：oxlint 的 refs/set-state-in-effect 移植更保守（-7），无新增类别。耗时 30s → **0.3s**。
- **check:size**：`check-file-size.mjs` 计数器迁 `oxc-parser`（与 oxlint 同解析器栈），口径不变（语句+声明+类成员+对象成员），例外清单按新口径校准（与 Babel 口径仅 ChartController ±2）。
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
- 单文件 ≤ **300 逻辑单元**（AST 计数，与排版无关；原「≤300 行」口径因 Prettier 折行使文件数凭空翻倍而废弃）。
  另有物理行 ≤900 的宽松护栏。存量超标仅剩 1 项（`ChartController`，纯委托门面三次裁决不拆）列于
  `scripts/file-size-allowlist.json`（每项带理由与登记出处）；门禁只拦**新增**超标：`npm run check:size`
- 引擎侧框架无关：不得 import React / zustand
- 公开 API 签名冻结，重构保持调用点零改动（golden：27 面截图 + 1090 单测 + 54 E2E）

## 已知状态与待办

- **依赖漏洞 4 项 → 已清零（2026-10-03 复核）**：经依赖升级专项批次（vite 5→8、vitest 3→5、react 18→19、
  zustand 4→5、TS 5.6→6.0.3、eslint 9→10，见 git log `507be30`…`956fa1f`），`npm run audit` 报
  **found 0 vulnerabilities**。复查命令不变：`npm run audit`（必须走官方 registry）。
- `jsdom@30` 声明要求 Node `^22.22.2`，当前环境 22.22.2 满足（旧环境 22.21.1 会打 `EBADENGINE` 警告）。
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
