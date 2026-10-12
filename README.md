# tradingPA

TradingView 图表平台的 1:1 复刻：React 19 + TypeScript + Vite + Zustand，图表渲染是**自研 Canvas 2D 引擎**（框架无关，不依赖任何图表库）。

- 图表类型 18 种 · 时间周期 22 档（含自定义间隔）· 内置指标 64 个 · 画线工具 45 个
- 多市场数据源：加密（Binance 多主机回退 + Gate 回退）/ A 股·港股·美股·指数（腾讯）/ 美股分钟·国内期货·外盘期货·外汇（新浪，script 标签 JSONP 直连）/ 全市场搜索（东财）
- 平台能力：多图表布局 1/2/4/6/8、跨图联动、自选股、价格警报、复盘回放、模拟交易、Pine 子集 DSL、Compare 叠加

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

## GitHub Pages 部署

推送即部署：`push` 到 `main`（或 Actions 页手动 `workflow_dispatch`）触发 `.github/workflows/deploy.yml`——先跑 `npm run verify`（typecheck + lint + format:check + 单测，红则终止部署），再 `npm run build` 并发布到 Pages。产物地址 `https://<owner>.github.io/tradingPA/`。

**一次性仓库设置**（git push 无法代做）：仓库 **Settings → Pages → Source 选 “GitHub Actions”**。

- base 路径由 `vite.config.ts` 在 Actions 环境自动推导（`GITHUB_REPOSITORY` → `/tradingPA/`），本地构建保持 `/`
- 本地按 Pages base 预演：`npm run build:pages && npm run preview`
- 单页应用无路由，无需 SPA 回退；全部 K 线数据源浏览器直连（腾讯系带 CORS，新浪系经 script 标签 JSONP，无 CORS/Referer 依赖），开发与生产一致。唯一已知缺口：港股分钟线暂无免费源（腾讯/新浪/东财均不提供），港股仅日/周/月

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器（HMR） |
| `npm run build` | `tsc -b`（app + node 双项目）+ Vite 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | 类型检查双项目：`tsconfig.json`（`src` + `tests/unit`，开着 `noUnusedLocals`）+ `tsconfig.node.json`（`vite.config.ts` / `playwright.config.ts` / `tests/e2e`） |
| `npm run lint` | oxlint（`.oxlintrc.json`，Rust 原生 0.3s；**0 错误 0 警告**——2026-10-08 存量 55 条警告基线全额清偿，2026-10-12 三期-H 再消除该基线未覆盖的 1 条指令遮蔽链；源码内 `eslint-disable` 注释 **2 条**，逐条理由与遮蔽范围见「lint disable 台账」；含函数级规模规则 max-statements 60 / max-params 10，7 个编排类文件放宽至 120） |
| `npm run lint:fix` | oxlint 自动修复 |
| `npm run format` / `format:check` | Prettier（代码/配置全覆盖，已全仓格式化；markdown 与 `docs/` 刻意排除，见 `.prettierignore` 的量化理由） |
| `npm test` | Vitest 单测（85 文件 / 1344 例） |
| `npm run test:e2e` | Playwright E2E（63 例，含 **27 面黄金截图** + 1M 根画布全管线帧时长预算） |
| `npm run test:e2e:update` | 黄金截图重基线（**仅有意渲染变更时用**：跑完必须在同一提交里审查 `__screenshots__` 的 diff 并说明理由，禁止顺手全量更新） |
| `npm run build:pages` | 按 Pages base（`/tradingPA/`）本地预演构建（配合 `npm run preview`） |
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
                  taFunctions 按族拆为 ta-shared/ta-overlap/ta-momentum/ta-math；
                  strategy.ts strategy 骨架模拟器 StratSim）
  data/         数据层
    sources/      多市场数据源路由（binance / tencent / sina / eastmoney）
    feed/         Binance REST + WS 实时通道
    aggregate.ts aggregatePath.ts liveBar.ts tz.ts cache/ BarSeries.ts
  store/        Zustand（UI/布局/指标/自选/警报/联动总线…），渲染态不进 React
  features/     平台功能（market / drawings / watchlist / layout / alerts / trading / command / replay / pine / settings）
  ui/           设计 token 与基础组件（primitives / controls / tokens）
  components/ hooks/ types/ styles/
tests/
  unit/         Vitest（85 文件，node 环境为主，需 DOM 的文件用 `// @vitest-environment jsdom`）
  e2e/          Playwright（8 spec / 63 例）+ __screenshots__ 黄金基线
docs/           Spec 与差距分析（见下）
```

## 质量门禁

批次出口标准：`npm run verify`（typecheck + lint + format:check + test 一键门禁）+ `npm run test:e2e` 全绿 + `npm run build` 通过。等价手工链：`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:e2e`。

> E2E 在 Windows 上必须先自己起 dev server 再跑（见下节）；`verify` 只含机器无关门禁，可随时跑。

当前实测基线（2026-10-12 复跑门禁口径校准 + 同日晚三期-H 交付 + 同日晚三期-B0 交付 + 同日晚三期-B1 交付 + 同日晚三期-B2 交付；上一次功能基线为 2026-10-09 二期收官后 + 形态家族画线回归修复 + rAF 帧循环加固 + E2E 去 flaky）：typecheck 0 错（**TypeScript 7 原生编译器，单一依赖无别名**；双项目：app + node 配置/e2e）/ lint **0 错 0 警告**（375 文件；存量 55 条基线已于 2026-10-08 全额清偿：exhaustive-deps 19 / only-export-components 11 / refs 10 / set-state-in-effect 11 / purity 3 / use-memo 1；该口径曾有一处盲区——`useChartSeries.ts` 的一条 disable 连带遮蔽同文件 6 条 refs + 1 条 set-state-in-effect，即「指令锚定而非分析归零」，已于三期-H 用代码结构归零，现源码内 2 条 disable 逐条见「lint disable 台账」）/ format:check 绿 / 单测 **85 文件 1344 例全过** / E2E **63 例全过**（`--retries=0` 实测零失败——基线已确定化，外网依赖已切断，见下条待办记录；含 `perf-million-bars.spec.ts` 的 1M 根画布全管线帧时长预算）/ **27 面黄金截图零 diff** / 构建 7 chunk、最大应用块 **503.85 kB（gzip 143.80 kB，合计 gzip 256.14 kB）**——B0 标注的「裕度仅 1.92 kB」已在 B1 兑现，**>500 kB 警告现已触发**（B2 再 +3.24 kB，仍在同一触发态；这是 Vite 的提示阈值、非本期门禁；gzip ≤150 kB 口径仍在内。处置三选一待裁决：接受警告 / 提 `chunkSizeWarningLimit` / 拆动态 import；本轮**未动 build 配置**，详见 `docs/PLAN-PHASE3.md` §2-B 的 B1 交付记录登记项③）。

**工具链统一 Vite 8 / oxc 生态（2026-10-03 迁移）**：`typescript` 为原生 7.0 单一依赖（无 JS API，官方预期形态）。原依赖 TS JS API 与 eslint/babel 的两处校验工具链统一迁到 **oxc 栈**（Vite 8 内置 Rolldown 的同源生态，Rust 原生解析）：
- **lint**：eslint 五件套 + @babel 三件套（共 8 个 devDep）→ **oxlint** 单二进制（`.oxlintrc.json`）。规则覆盖完备：react-hooks 全家族（含编译器规则 refs/purity/set-state-in-effect）+ react-refresh + TS 规则；`eslint-disable` 注释指令**基本**兼容（2026-10-03 探针验证「带指令 0 警告/去指令即报」；2026-10-12 复核补充：react-hooks 编译器规则的**抑制半径**与 ESLint 的 next-line 语义不一致，见下方台账「探针副产物」）。61 条 vs 原 68 条：oxlint 的 refs/set-state-in-effect 移植更保守（-7），无新增类别。耗时 30s → **0.3s**。
- `no-undef`/`no-unused-vars` 对 TS 关闭（tsc 把关全局与未使用代码）。
  注意 `.oxlintrc.json` 里的 `"@typescript-eslint/no-unused-vars": "off"` 是 **oxlint 的规则命名空间**，
  不是旧 `typescript-eslint` 包的幽灵依赖、也不是死键——探针实证（2026-10-12，用 `-c` 双份配置对照，不动现行配置）：
  把 core `no-unused-vars` 临时置 `error` 后，带该键的 TS 未使用变量文件 **0 错**、去掉该键即报 **1 错**。
  现行配置里 core 规则本身是 `off`，所以删掉该键**当下**不改门禁结果，但会改掉「一旦启用 core 规则时 TS 是否被拦」的口径
  ——这正是 2026-10-09 TS7 收口时判定它承重的原因，禁止「顺手清理」。

**lint disable 台账（源码内 `eslint-disable` 注释现行 2 条；2026-10-12 逐条探针复核时为 3 条，三期-H 交付后 `useChartSeries.ts` 一条归零）**

复核方法：把该行的 disable 注释删掉、其余不动，跑 `npx oxlint <该文件>` 看新增诊断——「不能删」必须有机械证据，不接受口头理由。

| 位置 | 规则 | 删掉后新增 | 为何保留 |
|---|---|---|---|
| `src/components/Chart.tsx:108` | `react-hooks/exhaustive-deps` | 1 条（missing deps: `bars` `symbol` `interval` `decimals` `exchange` `timeframeId` `chartType` `logScale` `onRendererReady`） | 该 effect 是**引擎挂载/卸载生命周期**，依赖必须为 `[]`；补齐依赖会让 Canvas 引擎随每批行情 dispose/recreate，渲染循环与视口状态全丢——属行为变更，非 lint 修复 |
| `src/features/market/useChartSeries.ts` | ~~`react-hooks/exhaustive-deps`~~ | — | **已归零**（三期-H，2026-10-12）：该指令删除后连带显形的 6 条 `react(refs)` + 1 条 `react(set-state-in-effect)` 全部由代码结构消解，不靠指令抑制。改造后 `npx oxlint src/features/market/useChartSeries.ts` 0 错 0 警告且文件内零 disable；行为零变更经单测 + 27 面黄金截图 + E2E `--retries=0` 实证。详见 `docs/PLAN-PHASE3.md` §2-H |
| `src/features/layout/ChartWorkspace.tsx:175` | `react-hooks/purity` | 1 条（`Date.now()` 渲染期读取） | 回放 bar 缺失瞬态的墙钟占位；改 effect+state 会触发 set-state-in-effect 且首帧取旧值，从 store/末柱派生会改变该瞬态显示值——两条替代路径均已核实为行为变更（理由同见该处 L172–174 注释） |

**探针副产物（oxlint 1.87 的指令作用域，与 ESLint 语义不一致）**：在 `.ts` 自定义 hook 文件里，一条 react-hooks 指令会抑制**同文件其余行**的编译器规则诊断——把 `useChartSeries.ts:223` 的指令移到同文件任意其他位置（含文件末尾）后，refs/purity/set-state 诊断仍全部消失；删掉指令则报出。而在 `.tsx` 双组件合成件里，指令只对紧邻下一行生效。机制未证实（疑与该函数是否走 React Compiler 路径有关），已在 OPEN-DECISIONS 登记为待查项。


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
- 公开 API 签名冻结，重构保持调用点零改动（golden：27 面截图 + 1344 单测 + 63 E2E）；additive 扩展需带默认值与回读口（三期-B2 的 `setTradingVisible` / `tradingVisible` 即按此口径）

## 已知状态与待办

- **E2E 日历用例已修（2026-10-09）**：`interactions.spec.ts` 两处「日历弹层」用例原以 `button[aria-label^="2026-"]` 的 `.first()` 取日格，当日历首行含上/下月补位或区间外日期时命中 `disabled` 格导致点击永久等待——根因是 mock 数据区间由 `Date.now()` 逐日漂移（非应用回归）。现改为 `getByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/, disabled: false })`：可访问名即 ISO 日期串（该形态只有日期格具备，导航/触发按钮不带），且不再依赖年份字面量。
- **E2E 去 flaky 已收口（2026-10-09）**：`watchlist.spec.ts 期货分类可搜到合约` 此前偶发 30s 超时、重试即过，登记为「依赖外网搜索源」——实跑定位后根因是**用例缺就绪门**：`/` 是 window keydown 快捷键（`useTvShortcuts` 的 effect 挂载后才有监听），用例在 `goto('/')` 之后立即按键，按键偶发丢失 → 弹层根本没开，等待的是弹层里的「国内期货」按钮，而非搜索结果。现补上与其他用例一致的就绪断言（`/[1-9][0-9,]* 根/` 可见）再按键。同时把东财合约全集与搜索联想改为 `page.route` 固定桩：期货分类搜索的语义是「本地按合约全集过滤」，网络只负责供料，钉死供料后断言只考察应用逻辑；这还顺带修掉一个定时炸弹——原断言写死 `/rb26/`，真实合约随主力换月会消失，桩数据不会。验证：`--repeat-each=4 --retries=0` 四连过；全量 `--retries=0` **57 例全过**（黄金截图 27 面零 diff）。
- **形态家族画线已修（2026-10-09）**：谐波四工具（gartley/bat/butterfly/crab）的比率标签无条件索引 `pts[4]`，而放置中的 `__preview` 走同一渲染路径，锚点不足 5 个时抛 TypeError；异常从 `pipeline.draw()` 逃出后 `ChartController` 的 rAF 循环不再自我重挂，**整张画布永久冻结**——用户侧表现为「ABCD 分类下其他划线工具没效果」，刷新页面才恢复。现整段比率标签以 `pts.length >= HARMONIC_LABELS.length` 守卫（不足时只画已有折线与锚点字母，同时避免越界点的 price 兜底 0 算出假比率）。回归：`tests/unit/drawing-pattern-render.test.ts`（9 工具 × 1..5 锚点逐档不抛错）。
- **rAF 帧循环已加固（2026-10-09）**：`ChartController.start()` 原把 `requestAnimationFrame(loop)` 排在帧体之后，帧体（尤其 `pipeline.draw()`）一次抛错就再也不挂帧 → 整张画布永久冻结，须刷新页面。现改为「先挂下一帧再干活」，单帧异常只丢这一帧。不吞异常：错误仍上抛到 `window.onerror`（syncBus 的 console.error 口径只用于隔离外部 handler，本处是引擎自身缺陷，需要响亮暴露）。回归双跑：`tests/unit/chart-raf-loop.test.ts`（假帧队列逐帧驱动，6 例——含「连续 5 帧异常不终止」「dispose 后不再挂帧」「重复 start 不叠加」）+ `tests/e2e/drawing.spec.ts` 真浏览器注入异常用例。两者按旧顺序实测均失败（旧实现第 1 帧抛错即死），非空断言。

- **TS7 迁移缺口已收口（2026-10-09，判定为文档口径缺口而非代码缺口）**：二期各批交付记录里的「TS6 typecheck 降级等效验证」是从 2026-10-08 一次**宿主环境故障**（TS7 原生二进制拒绝加载 bcrypt.dll → panic + exit 2，当次以 `npx -p typescript@6.0.3 tsc` 等效验证）复制来的措辞，被后续批次当模板沿用。实测现状：`typescript` 单依赖 = 7.0.2（无 `npm:` 别名）、平台二进制 `@typescript/typescript-win32-x64/lib/tsc.exe` 就位、`tsc --version` = 7.0.2、`npm run typecheck` 0 错（1.96s）/ `npm run build` 内联同一条 tsc 0 错，`--verbose` 重跑 stderr 无 panic → 门禁一直跑的就是 TS7 原生，本节上条基线声明为真。TS JS API 消费者为零（lint=oxlint、转译=Vite 8/Rolldown、E2E=Playwright 自带转译；`typescript` 包的 `exports["."]` 只指向 `lib/version.cjs`）。**易误判点**：`.oxlintrc.json` 的 `"@typescript-eslint/no-unused-vars": "off"` 是 oxlint 的规则命名空间（不是旧 npm 包，也不是死键）——探针证实它确实压制 TS 文件的 core `no-unused-vars`，未使用代码改由 tsc `noUnusedLocals/noUnusedParameters` 把关，删除会让门禁口径改变。**宿主故障复现判据**：TS7 的失败形态是 panic 打 stderr 且 exit 2，不得按「有输出即放行」处理；等效替代链在 TS7 单依赖下已不存在（无 tsc6 二进制），需要临时验证时用 `npx -y -p typescript@6.0.3 tsc -b tsconfig.json tsconfig.node.json --noEmit`。详见 `docs/PLAN-PHASE2.md` 二期-G 交付记录与 OPEN-DECISIONS 登记行。
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

命名约定：`docs/` 下按**体裁**前缀命名，全大写连字符式——`SPEC-`（规格）/ `PLAN-`（规划）/
`AUDIT-`（差距与风险评估）/ `DESIGN-`（施工设计）/ `DECISION-`（决策材料），
`docs/decisions/` 存**已裁决**（`ADR-NNN-*`）与未决登记册。体裁即文件名，不再靠 `P1`/`pixel` 这类批次代号表意。

| 文件 | 内容 |
|---|---|
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | 开发计划与 1:1 对照清单（§3 为功能验收基线） |
| [docs/PLAN-PHASE2.md](docs/PLAN-PHASE2.md) | 二期七批次规格与交付记录；§3 二期「明确不做」清单、§5 决策点 D1/D2/D3 裁决（D1 不引入后端） |
| [docs/PLAN-PHASE3.md](docs/PLAN-PHASE3.md) | **三期规划（2026-10-12 三个决策点全部裁决完毕）**：批次 A–H 的范围/出处/人日，§3 明确不做结转 + 能力边界转正表，§4 裁决留档（D1 档 0 关闭重评 / D4 MTF 不做 / D6 收敛）；**三期-A 已交付**（§2-A），**三期-H 已交付**（§2-H 门禁盲区清偿），**三期-B0 已交付**（§2-B：设置态单一来源 + 偏好落盘），**三期-B1 已交付**（§2-B：图表设置「模板」页 + 模板 store，事件页撤项）；**剩余功能面 = B 余约 4–6 → C → D（约 12–18 人日）** |
| [docs/SPEC-TV-ALIGNMENT.md](docs/SPEC-TV-ALIGNMENT.md) | TV 对齐 v2.0 主规格；**§12 变更记录 = 项目决策登记表** |
| [docs/SPEC-PHASE1-FEATURE-BREADTH.md](docs/SPEC-PHASE1-FEATURE-BREADTH.md) | 一期「功能广度」批次（原 `SPEC-P1`）规格与交付记录 |
| [docs/SPEC-PHASE1-CLOSEOUT.md](docs/SPEC-PHASE1-CLOSEOUT.md) | 一期「收官」批次（原 `SPEC-P2`）规格与交付记录 |
| [docs/AUDIT-TV-FEATURE-GAP.md](docs/AUDIT-TV-FEATURE-GAP.md) | 功能维度差距分析（TV × tradingPA，P0/P1/P2 池的来源） |
| [docs/AUDIT-TV-UI-GAP.md](docs/AUDIT-TV-UI-GAP.md) | UI / 交互像素维度差距分析（设置对话框深度、右键菜单广度、token 收敛等缺口的登记处） |
| [docs/AUDIT-ARCHITECTURE-REFACTOR.md](docs/AUDIT-ARCHITECTURE-REFACTOR.md) | 技术改造点与架构风险评估（只读分析，M0-M7 收尾期） |
| [docs/DESIGN-VOLUME-PROFILE.md](docs/DESIGN-VOLUME-PROFILE.md) | Volume Profile 数据管线与集成架构设计（配套 ADR-001） |
| [docs/PLAN-TECH-DEBT-CLOSEOUT.md](docs/PLAN-TECH-DEBT-CLOSEOUT.md) | 技术债收尾施工蓝图（历史存档，2026-09-30 已全部交付） |
| [docs/decisions/OPEN-DECISIONS.md](docs/decisions/OPEN-DECISIONS.md) | 未决项登记册（只追加 + 就地关闭） |
| [docs/decisions/ADR-001-volume-profile-kline-approx.md](docs/decisions/ADR-001-volume-profile-kline-approx.md) | Volume Profile kline 近似裁决 |
| [docs/DECISION-PHASE3-BACKEND.md](docs/DECISION-PHASE3-BACKEND.md) | **三期 D1 决策材料 + 裁决结果（§4.1）**：自建后端的收益/代价对照与分档（档 0–3）；2026-10-12 用户逐条答复五问（全「否」）→ **D1 维持档 0 并关闭重评入口**，§3「反向选项」表转正为能力边界口径 |
| [.workbuddy/memory/](.workbuddy/memory/) | 工作日志与踩坑记录（`pitfalls.jsonl`，未入版本库） |
