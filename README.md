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
| `npm run lint` | ESLint 扁平配置（0 错误；32 条 `react-hooks/exhaustive-deps`、`react-refresh/only-export-components` 警告为存量基线） |
| `npm run lint:fix` | ESLint 自动修复 |
| `npm run format` / `format:check` | Prettier（**注意**：全仓尚未重排，见下「已知状态」） |
| `npm test` | Vitest 单测（49 文件 / 959 例） |
| `npm run test:e2e` | Playwright E2E（54 例，含 **27 面黄金截图**） |

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
    builtin/      64 个内置指标定义（12 文件）
    pine/         Pine 子集编译器与解释器（tokenizer → parser → interpreter → taFunctions）
  data/         数据层
    sources/      多市场数据源路由（binance / tencent / sina / eastmoney）
    feed/         Binance REST + WS 实时通道
    aggregate.ts aggregatePath.ts liveBar.ts tz.ts cache/ BarSeries.ts
  store/        Zustand（UI/布局/指标/自选/警报/联动总线…），渲染态不进 React
  features/     平台功能（market / drawings / watchlist / layout / alerts / trading / command / replay / pine / settings）
  ui/           设计 token 与基础组件（primitives / controls / tokens）
  components/ hooks/ types/ styles/
tests/
  unit/         Vitest（49 文件，node 环境为主，需 DOM 的文件用 `// @vitest-environment jsdom`）
  e2e/          Playwright（7 spec / 48 例）+ __screenshots__ 黄金基线
docs/           Spec 与差距分析（见下）
```

## 质量门禁

批次出口标准：`npm run typecheck && npm run lint && npm test && npm run test:e2e` 全绿 + `npm run build` 通过。

当前实测基线（2026-09-30）：typecheck 0 错 / lint 0 错（32 警告）/ 单测 959 全过 / E2E 54 例全过（**27 面黄金截图零 diff**）/ 构建 8 chunk、最大应用块 445 kB（>500 kB 警告已消除），合计 gzip 224.31 kB。

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
- 单文件 ≤ 300 行（唯一在卷例外：`src/engine/renderer/ChartController.ts`，纯委托门面，已裁决）
- 引擎侧框架无关：不得 import React / zustand
- 公开 API 签名冻结，重构保持调用点零改动（golden：27 面截图 + 959 单测 + 54 E2E）

## 已知状态与待办

- **Prettier 尚未全仓应用**：配置与脚本已就位，但 288 个受检文件中 175 个未格式化；全仓 `--write` 会产生不可评审的巨 diff，需作为**独立提交**（配 `git blame` 忽略）择机执行。当前请对改动的文件单独 `npx prettier --write <file>`。
- `npm run format:check` 在上述提交落地前会保持红色，这是已知且刻意的。
- `jsdom@30` 声明要求 Node `^22.22.2`，当前环境 22.21.1 可用但会打 `EBADENGINE` 警告。

已收口（2026-09-30）：单 chunk >500 kB → 已按 vendor 分块（最大应用块 445 kB）；canvas hex 无审计口径 → 已集中到 `palette.ts`，全仓 hex 259 → 100 且零违规；P2-B 画线家族无像素安全网 → 已补 6 面覆盖 25 个工具（黄金面 21 → 27）。

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
