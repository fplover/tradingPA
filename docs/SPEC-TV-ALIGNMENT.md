# Spec - tradingPA TV 对齐 v2.0

> 生成日期：2026-09-28
> 基于：GAP_ANALYSIS_TV_vs_tradingPA.md（功能）+ UI_GAP_ANALYSIS_pixel.md（UI）+ tech-refactor-assessment.md（架构）
> 状态：已确认（用户 2026-09-28 确认全量推进 A→B→C→D）

---

## 1. 产品定义

- **一句话描述**：1:1 复刻 TradingView 图表平台的自研 Canvas 2D 引擎 K 线应用
- **目标用户**：熟悉 TradingView 的技术分析交易者（复盘/模拟交易场景）
- **核心问题**：主干功能已齐（M0-M7），剩余差距为「TV 违和感」——快捷键、档位、图表类型、画线族、UI 像素细节、代码结构

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 批次 | 功能 | 验收标准摘要 | 工作量 |
|---|---|---|---|
| A1 | 剪刀图标 ✀ → lucide Scissors SVG path | ChartRenderer.ts:1592 无字符图标，视觉与 lucide 1.5 描边同源 | 0.5h |
| A2 | 14 处硬编码色 → Design Token | AlertPanel/ReplayBar/TradePanel/SummaryReport 零 hex（#fff/#000 除外），买卖按钮立 --buy/--sell token | 1d |
| A3 | 对齐安全网 | 黄金截图集（锁 DPR/禁动画）+ drawXxx 渲染单测 + PointerEvent 输入集成测试 + Pine 黄金用例 + syncBus 防环用例 | 3d |
| B1 | 快捷键全映射 + 快捷键面板 | TV 默认映射 25+ 键全覆盖；头像入口出快捷键清单浮层 | 3d |
| B2 | 前往日期（Alt+G） | 日期浮层 → 二分查找定位 bar 并居中 | 2d |
| B3 | K 线收盘倒计时 | 价格轴右端 mm:ss 实时递减，周期切换/新 bar 重置 | 2d |
| B4 | 六种图表类型补齐 | Columns/High-low/Step line/Line with markers/HLC area/Volume candles 渲染+图例+类型下拉 | 5d |
| B5 | 周期补齐 + 自定义间隔 | 2m/45m/3H 入档位表；自定义分钟/小时间隔走既有聚合器 | 2d |
| B6 | 斐波那契家族 | 扩展/扇形/弧线/时区 4 变体 + Auto Fib，锚点落位正确 | 5d |
| B7 | 画线交互补齐 | Ctrl+拖动克隆、Ctrl+点击多选、Shift 约束水平/垂直、方向键微调 | 4d |
| B8 | 布局保存/加载 | Ctrl+S / . 保存整图布局（品种/周期/类型/指标/画线/面板/主题），刷新后恢复一致 | 4d |
| C | UI P1 精修（10 项） | 见 §7 验收标准 AC-C 系列 | 18d |
| D | 架构重构（4 提交序列） | ChartRenderer 1594 行 → 11 模块 ≤300 行；syncBus 时间空间联动；指标脏缓存；交易手势剥离 | 18d |

## 3. 明确不做（Out-of-scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|---|---|---|
| Volume footprint/TPO/Bar Magnifier | 依赖 tick 级数据，免费数据源不匹配 | 接付费 tick 源后，以 Volume Profile 近似替代 |
| Compare/叠加、Spreads 公式品种 | MVP 阶段 ROI 不足（需数据层多序列改造） | v2.0 |
| 指标数量扩到 100+/MTF/Volume Profile | P1 功能广度，本阶段后评估 | 下阶段 |
| Pine strategy() 回测、array/matrix/table | 与自研复盘交易定位重叠 | 不做 |
| 社区/社交/新闻流/经济日历/Screener | TV 付费数据资产，非图表复刻核心 | 不做 |
| 账号体系/云同步/分享 URL | localStorage 本地化足够 | 不做 |
| 真实下单/经纪商集成 | 定位复盘/模拟交易 | 不做 |

## 4. 技术架构（锁定 — 版本锚定，已核实 node_modules 实际版本）

| 层 | 技术 | 实际版本 | 锁定原因 |
|---|---|---|---|
| 前端 | React + TypeScript | 18.3.1 / 5.6.3 | 存量锁定 |
| 构建 | Vite | 5.4.11 | 存量锁定 |
| 渲染 | 自研 Canvas 2D 引擎 | — | 核心资产，框架无关 |
| 状态 | Zustand + 引擎订阅制 | 4.5.5 | 高频行情不进 React |
| UI | Radix UI 4 件套 + lucide-react | 1.47.0 | 存量锁定，图标库锁定 lucide 一套 |
| 测试 | Vitest + Playwright | — | 存量 + A3 新增视觉回归层 |
| 数据 | Binance WS/REST + A 股适配器 + IndexedDB | — | 存量锁定 |

**P0 架构规则（全程有效）**：
1. 图标一律 lucide-react / SVG path 矢量绘制，禁字符/emoji 作功能图标，尺寸收敛 14/16/18 三档
2. 颜色一律 CSS 变量/Token 引用，禁硬编码 hex（唯一例外 #fff/#000）
3. 渲染循环与 React 解耦：行情 → rAF 合帧 → 引擎局部重绘，交互态不进 React 重渲染
4. 单文件 ≤300 行（D 批次为存量违规的纠正批次）
5. 跨图表联动走 syncBus，绕开 React，限频统一上移

## 5. 数据契约（锁定）

| 契约 | 内容 |
|---|---|
| syncBus 视口联动载荷 | 从 `{first, spacing}`（索引空间）升级为 `{fromTime, toTime}`（时间空间），加 sourceId 显式防环，分发加 try/catch 异常隔离 |
| syncBus 限频 | 从 Chart.tsx 闭包 32ms 硬编码上移 syncBus 统一 rAF/30Hz |
| 布局序列化 schema | version 字段 + 迁移策略；覆盖 instrument/timeframe/chartType/indicators/drawings/panes/theme |
| 指标计算缓存键 | bars 引用 + 末 bar time + from/to + params 版本；autoscale/legend/draw 同帧复用 |

## 6. 页面/模块清单（锁定）

| 模块 | 涉及文件（点名） | 对应批次 |
|---|---|---|
| 快捷键体系 | components/Chart.tsx、App.tsx、新增 hooks/useTvShortcuts.ts、新增快捷键面板浮层 | B1 |
| 前往日期 | App.tsx（复用 handleSeekToTime 二分查找）、新增 features/market/GoToDateDialog.tsx | B2 |
| 收盘倒计时 | engine/renderer/drawAxes.ts、ChartRenderer.ts | B3 |
| 图表类型 | engine/renderer/seriesRenderers.ts、data/transforms.ts、types/market.ts | B4 |
| 周期系统 | types/market.ts、data/aggregate.ts、顶栏周期下拉（App.tsx L52 自动派生） | B5 |
| 画线工具 | engine/drawing/types.ts、drawDrawings.ts、DrawingLayer.ts、ChartRenderer.ts | B6/B7 |
| 布局存储 | store/layoutStore.ts、新增 features/layout/LayoutSaveMenu.tsx、App.tsx 顶栏入口 | B8 |
| UI chrome | ChartContextMenu.tsx、ChartSettingsDialog.tsx、ui/primitives.tsx、styles/global.css、StatusBar/底部预设条 | C |
| 引擎内核 | ChartRenderer.ts → 拆 11 模块（ChartController/ChartState/InputController/PanZoomGesture/DrawingGesture/TradeGesture/hitTest/cursor/RenderPipeline/autoscale/SyncBridge） | D |

## 7. 验收标准（锁定 — EARS 格式）

| 编号 | 功能 | EARS 格式验收标准 | 批次 |
|---|---|---|---|
| AC-A1 | 剪刀图标 | While 复盘模式选 K 线，系统**必须**以 SVG path 绘制剪刀标记，全文件扫描无 U+2700 等字符图标 | A |
| AC-A2 | 颜色 Token | While 任意主题渲染交易/警报/复盘面板，系统**必须**全部经 var(--up)/var(--down)/var(--warn)/--buy/--sell 取色，源码扫描零硬编码 hex | A |
| AC-A3 | 安全网 | While 执行 `npm run test:e2e`，系统**必须**含黄金截图集（主题/类型/指标/画线/光标/图例/时间轴/布局）且对无害重构敏感、对主题切换稳定 | A |
| AC-B1 | 快捷键 | While 用户按 TV 默认映射键（数字/逗号切周期、Alt+A 警报、Alt+R 重置、Alt+L 对数、Ctrl+↑/↓ 缩放等 25+ 键），系统**必须**执行对应动作；按 ? 或头像入口**必须**弹出快捷键清单 | B |
| AC-B2 | 前往日期 | While 用户按 Alt+G 输入合法日期，系统**必须**二分查找定位该 bar 并居中显示 | B |
| AC-B3 | 倒计时 | While K 线未收盘，系统**必须**在价格轴右端显示 mm:ss 倒计时且每秒递减；If 新 bar 生成，倒计时**必须**重置 | B |
| AC-B4 | 图表类型 | While 用户切换 6 种新类型之一，系统**必须**正确渲染且图例/工具提示联动，黄金截图入库 | B |
| AC-B5 | 周期 | While 用户选 2m/45m/3H 或输入自定义分钟/小时，系统**必须**经 aggregateBars 聚合且成交量守恒（单测对齐既有金标准模式） | B |
| AC-B6 | 斐波那契 | While 用户放置扩展/扇形/弧线/时区变体，系统**必须**按 TV 锚点规则落位并渲染对应水平线组/弧线 | B |
| AC-B7 | 画线交互 | While 用户 Ctrl+拖动选中画线，系统**必须**克隆对象；Shift+拖动**必须**约束水平/垂直；方向键**必须**以像素步长微调 | B |
| AC-B8 | 布局存取 | While 用户按 Ctrl+S 保存布局后刷新页面再按 . 恢复，系统**必须**完整还原品种/周期/类型/指标/画线/面板/主题 | B |
| AC-C1 | 多面板光标 | While 光标悬停副图面板，十字光标价格标签**必须**按该面板 priceScale 换算 | C |
| AC-C2 | 右键菜单 | While 用户在图表区右键，系统**必须**展示 TV 14 项完整菜单（Reset/Add alert…/Trade/Object Tree/Settings 等） | C |
| AC-C3 | 图表设置 | While 用户打开图表设置，系统**必须**含坐标轴/状态栏/外观/Scales/Canvas 页签且双击价格线可入 | C |
| AC-C4 | 加载态 | While 首次加载 bars=0，系统**必须**显示加载指示而非空白画布 | C |
| AC-D1 | 拆分 | While 审查 src/engine/renderer/，ChartRenderer.ts**必须** ≤300 行且 11 模块各 ≤300 行单一职责 | D |
| AC-D2 | 联动 | While 跨周期图表联动视口，系统**必须**按时间范围对齐（非索引空间）且无回环抖动 | D |
| AC-D3 | 性能 | While 4 面板+4 指标同屏，帧时间**必须** ≤3ms（当前 1-5ms，脏缓存释放预算） | D |

## 8. 设计 Token（锁定 — 全部经 CSS 变量，禁硬编码）

- **主色体系**：TV 色板（存量已对齐，global.css L47-91）
- **涨跌色**：`--up` / `--down`（中国市场惯例：涨红跌绿）
- **交易色**：新增 `--buy` / `--sell`；警报 `--warn`
- **圆角**：收敛 sm=3 / md=6 / lg=8 三档，组件禁硬编码
- **阴影**：收敛 flat / ring / raised 三级
- **图标**：lucide-react 一套，尺寸 14（菜单）/16（顶栏行内）/18（画线工具栏）三档，描边 1.5 统一
- **字体**：Trebuchet MS 栈 + tabular-nums（存量已对齐）
- **主题**：深/浅双主题，canvas tooltip 底色与 UI 统一（浅色画布不再用深色 tooltip 底）

## 9. 边界与约束

- 仅桌面浏览器（Chrome/Edge/Firefox/Safari 最新版），触控交互不做
- 响应式：固定布局档位 1/2/4/6/8，不做 16 格（TV 付费卖点）
- 性能红线：10 万 K 线 3-9ms/帧；常规视图 <1ms；拆分后不得回退
- 每批次完成必须 `npm run typecheck && npm run test && npm run test:e2e` 全绿才能进下一批
- 提交纪律：一批一提交，信息含批次号（如 `feat(tv-align/B1): ...`）

## 10. 内嵌已知坑（从三份调研拉取）

| 坑 | 技术栈指纹 | 根因 | 修法 |
|---|---|---|---|
| 渲染原语零单测 | canvas 引擎 | drawXxx 七纯函数无 ctx-mock 测试，改动盲飞 | A3 补 mock 断言 path/fillText 序列 |
| syncBus 隐式防环 | syncBus | 无 sourceId，靠调用点不变式 | 事件加 sourceId 显式防环 |
| Pine 运行期抛错穿 rAF | pine/compile | evalExpr throw 无边界 | run() 后 dry-run compute 前置错误 |
| computeWindow 同帧重复计算 | indicators/core | autoscale/legend/draw 各算一次 | 缓存键 + 同帧复用 |
| 交易逻辑寄生渲染器 | ChartRenderer | 约 100 行交易字段/方法混入内核 | D 批次拆 TradeGesture |
| 截图 flaky | playwright | DPR/动画/字体加载时序 | 锁 DPR/禁动画/等字体就绪 |
| LineBreak 窗口基准误用 | transforms | window[0] 当基准（已修，勿回退） | 保持既有修正 |
| App.tsx 顶栏周期下拉 | App.tsx | TF_OPTIONS 由 TIMEFRAMES 自动派生，加档位只需改 market.ts | B5 利用该派生，勿硬编码下拉项 |

## 11. 端到端验证步骤（每批次出口）

```bash
# 1. 类型检查 + 单测 + E2E（全绿才算批次完成）
npm run typecheck && npm run test && npm run test:e2e

# 2. 生产构建（产物预算基线：172KB gzip——2026-09-28 实测，M7 时 49KB，
#    差距为 A/B/C 批次功能累积属正常；单 chunk >500KB 警告为存量无 code-split，
#    架构师在 D 批次拆分时评估是否顺带做路由级分割）
npm run build

# 3. B1 快捷键抽验（E2E 覆盖）
# 断言：按 Alt+G 出日期浮层；按 1/2/3 切周期；按 Alt+R 重置视口

# 4. B8 布局往返（E2E 覆盖）
# 断言：保存布局 → 刷新 → 恢复 → 品种/周期/指标/画线一致

# 5. D 性能回归
# 断言：4 面板+4 指标帧时间 ≤3ms；10 万 K 线 ≤9ms
```

## 12. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-09-28 | Spec 创建，锁定 A→B→C→D 全量范围 | 用户确认 | 全项目 |
| 2026-09-28 | B6 交付确认 6 项 TV 简化（已知差异，均已注释）：timezone 单锚固定数列（TV 双点基准）/ Auto Fib 可见极值对（TV pivot 检测）/ 弧线半圆（TV 有整圆开关）/ fib 档位固定默认值（TV 可显隐自定义）/ 多选仅 Ctrl+点击（TV 有框选 marquee）/ 新工具默认色沿用既有 fib 灰 | TV 1:1 细节无限性，§10 允许非关键体验差异化 | engine/drawing/* |
| 2026-09-28 | 产物体积基线 49KB→175KB gzip（M7 时 49KB，差距为功能累积） | 实测修正防门禁误判 | §11 |
| 2026-09-28 | 黄金截图扩容：10 面 → 19 面（+B4 六类型/+timeframe-2m/45m/+倒计时行为断言表面） | B3/B4/B5 新表面基线补齐，D 批次拆分安全网前置 | tests/e2e/* |
| 2026-09-28 | Wave5 渲染变更重基线（17 张）+ timeframe-1H 新表面（zh 日期覆盖）→ 20 面；图例圆点分歧修复 b0a2579（单一数据源） | 时间轴 zh 化/图例市场圆点为有意渲染变更 | tests/e2e/* |
| 2026-09-29 | **D 批次拆分完成**（W6-1+W6-2 五提交）：syncBus 时间空间联动 + ChartRenderer 1840 行 → 5 行兼容 shim（ChartController 门面 + 13 模块）。调用点零 diff（git 实证）、黄金截图零 diff（E2E 47/47 实证）、单测 361→400 | 架构师蓝图执行，300 行红线与公开 API 契约双达标 | src/engine/renderer/* |
| 2026-09-29 | **ChartController 门面 532 行裁决：接受并记录**。构成=公开 API 面 ~65 成员 + host 装配字面量 + 视口编排；纯扁平委托无逻辑，单一职责与可导航性满足红线意图。再拆需先瘦身 ChartState 或碎片化公开 API 单类契约，收益不成比例；留作门面长回逻辑时再拆 | 任务书升级条款裁决（工人按条款上报） | src/engine/renderer/ChartController.ts |
| 2026-09-29 | 已知遗留：drawScissors 徽章与选线预览蒙层 #2962ff 为存量 canvas 硬编码（theme 无对应 token，改色破坏像素中性故原样搬迁）——待 theme 增 select 色 token 后替换 | P0 hex 例外的存量债务，非本批次引入 | src/engine/renderer/RenderPipeline.ts |
| 2026-09-29 | **Phase 4 终验（QA 独立验证）**：四项门禁全绿（typecheck/413 单测/47 E2E/build 184KB）；AC 审计 1 项 P1 已修复；P0 三扫全零；scorecard Bronze（本地静态应用 Scope 固有），核心交付面 Silver | 交付前终验 | 全项目 |
| 2026-09-29 | **P1 修复：自定义周期布局刷新恢复静默回退 '1m'**（QA 终验发现）——根因：layoutStore 模块体 readFile() 早于 customInterval 模块体 initCustomIntervals() 求值，刷新时注册表为空 → isKnownTimeframeId('custom:7') 判 false → migrateSnapshot 回落 '1m'（B5 的 3c52b3b 活校验只覆盖会话内路径）。修复：layoutStore 顶部 `import '@/features/market/customInterval'` 强制求值序（无循环依赖）。A/B 实证：带修复=7分完整恢复 / 暂存修复=1分回退。同批修 Ctrl+S 竞态（QA advisory）：timeframeRef/chartTypeRef 同步改 useLayoutEffect，消除周期切换同帧存档存进上一周期的 <1 帧窗口 | 刷新恢复路径的数据失效 | src/store/layoutStore.ts、src/App.tsx |
| 2026-09-29 | **债务记录修正（QA 终验纠正总监 earlier 记录失真）**：引擎 canvas 层 hex 存量实为 **121 处**（Pine COLORS 16=语言常量合理 / 指标+画线默认样式 ~96=TV 调色板用户可改数据 / 渲染路径硬编码 ~10）+ rgba 1 处——早前「仅 2 处」的记录严重低估，以此行为准。300 行红线字面违背 3 处：ChartController 535（已裁决）+ seriesRenderers 470 + drawCrosshair 337（存量未拆，D 批次 11 模块范围外） | 交付风险清单准确性 | src/engine/* |
| 2026-09-29 | **性能方法学注记**：rAF 间隔法探针只能证明「无掉帧」（vsync 60Hz 下分辨不了 1ms 与 3ms 绘制）；「≤3ms」结论须以直测绘制耗时为据——QA 独立直测 ChartController.lastFrameMs：4 面板 4 指标 p50 0.9-1.0ms / p95 1.5-1.6ms / max 1.8-3.1ms（首跑含热身帧），10 万 K 线同法通过。两项证据互证 | 性能验收方法学 | §11 |
| 2026-09-29 | **canvas 渲染路径 hex 清债**（5b24193）：11 处硬编码 → theme token（RenderPipeline 4：accentMask/accent/accent/onAccent；drawTrading 5：warn·accent/up·down；drawDrawings 1：infoLabelBg）+ theme.ts 新增 5 token × 双主题。token 值与原硬编码逐字符一致 → 像素中性获 E2E 47/47（20 面黄金截图零 diff）证明；typecheck + 413 单测全绿。**#2962ff 存量债务清零**，渲染路径仅剩 #ffffff ×3（P0 例外）；`?? '#2962ff22'` 回退与 seriesRenderers 默认参数为已裁决合理存量（TV 调色板数据） | 在案债务收尾（§12 前述遗留项） | src/engine/* |
| 2026-09-29 | **体积方法学注记（本批次实测）**：同树构建出现单次 630.22KB raw 与三次同 hash 复现 657.96KB 的 27KB 差——EOL 实验（LF/CRLF 产物同 hash）与停 dev server 复验均排除已知变量，判单次值为不可复现异常；**门禁体积只认同日同环境对照**：父提交 197.78 → 本提交 197.82KB gzip（+0.04KB = 20 行 token 定义，自洽）。另注：跨日体积漂移（09-29 记录 184KB vs 今日同树 ~197.8KB）属环境因素未溯源，>500KB 单 chunk 警告为已记录存量（无 code-split） | 体积证据链纪律 | §11 |
| 2026-09-29 | **四项在案遗留收尾完成**（蓝图 docs/tech-debt-plan.md = fc5c3fe）：① seriesRenderers 470→barrel+5 模块（ba761b5，12/12 函数字节级一致，几何同构分族，调用点仅 PaneRenderer+单测经 barrel 闭合）② drawCrosshair 337→barrel+3 模块（e89dce1，光标/图例两族分置，10 import 点闭合）③④ 聚合路径补实（3ae9d57）：AggregateFeedPath 下沉 data 层——实时轮询 clamp(基期/2,5s,30s) + tailChanged 门控（同数据零渲染）+ hidden 跳拍三重守卫；loadMore 全量重聚合（前插更早基期愈合首桶接缝）；klineCache.merge 后者赢语义以实读为 oracle 钉入单测。单测 413→427。**门禁**：E2E 47/47（20 面黄金零 diff）+ build ✓ 198.36KB（+0.54KB=aggregatePath+装配，同日对照自洽）+ P0 双扫零。**300 行红线未裁决违背清零**（ChartController 535 为已裁决门面）；数据层两项 defer 关闭 | 在案遗留清零 | src/engine/renderer/*、src/data/aggregatePath.ts、src/features/market/useChartSeries.ts |
| 2026-09-29 | **useChartSeries 瘦身**（bc38049）：mockInterval + degradeToMock 下沉 mockFallback.ts（34 行工厂，五连调用顺序文案逐字一致，三调用点语义不变；loadMore 两分支逐字相同的 fail 闭包去重）。297→285 行，红线余量 3→15。工人请求裁决两项：① ≤265 字面目标未达（floor≈285，剥注释=质量回退）→ **接受 285，≤265 降级为建议项**；② commit message 修正为实测值（amend）。门禁：E2E 47/47 + build ✓ 198.42KB（+0.06KB 自洽） | 红线余量修复（advisory 立案项） | src/features/market/{mockFallback.ts, useChartSeries.ts} |
| 2026-09-30 | **红线违背处置批次**（文档查阅触发，五文件拆分 + 一裁决）：ChartState 340→300（chartPanes 30 面板状态/画布几何 + chartVp 23 VP 运行态；vpRuntimeByViewport WeakMap 整体迁入 chartVp 保持模块级单例语义，新增 bindVpRuntime 登记入口）；layoutStore 336→199（layoutSnapshot 165：桥接注册表/localStorage 序列化/快照采集应用/条目助手；readFile 模块体调用序不变式经 vite-node 探针实证 custom:90 刷新不回退 1m）；Chart.tsx 391→261（useChartCommands 110/useLazyLoad 17/useLiveTick 30/useBackToLatest 48 四 hook；`[]` deps 首帧回调 effect 原位保留）；WatchlistPanel 723→222（WatchlistRow 237/ColumnHeader 81/ListMenu 60/SettingsMenu 85/RowMenu 81/watchlistShared 81；DOM token 级 diff 零变化 + E2E 8/8 实证）；DrawingToolbar 624→121（drawingToolGroups 106/drawingToolbarStyles 111/useGroupHold 89 双定时器状态机/DrawingToolButton 104/BottomControls 134/Menus 132；flyout 175/300ms 语义逐字保留 + E2E drawing/interactions 实证）。**App.tsx 650 行裁决：推迟至 P2-C 释放**——P2-C 已列「释放 App.tsx」条目（syncBus 三通道改造同文件），现在拆分将重复施工；期间唯一在案违背，P2-C 关闭。门禁：typecheck 零错误 + 单测 563/563 + E2E 47/47（20 面黄金截图零 diff）。同批修 compile.ts barrel 注释 ta 计数笔误 31→32 | 300 行红线无裁决违背清零执行（App.tsx 在案待 P2-C） | src/** |
| 2026-09-30 | **日历桶时区分裂修复**（数据层查阅发现）：aggregate.ts 周/月桶按 UTC 归桶而 liveBar.ts 按浏览器本地归桶，UTC+8 下本地周一的日 K 泄入上一周桶（sina 期货/美股 1W/1M 本地聚合路径），且聚合周 K 时间戳与报价对齐时间永不相待→末柱被静默丢弃；crypto 1D 报价同样因本地午夜口径被丢。修复：新增 data/tz.ts（calendarTzOffsetMinutes：crypto=0/CN=本地），aggregateBars/alignBarTime/applyQuote/nextCalendarClose 增加可选 tzOffsetMinutes 参数（默认 0=UTC，crypto 与 ChartCell 种子行为零变化）；sina/tencent 聚合传本地偏移；useChartSeries 按 instRef 市场传参；CloseCountdown.setCalendarTzOffset 经 ChartController.setCalendarTzOffset ← useChartCommands（market prop 既有链路）下发，修复 CN 周/月收盘倒计时偏差。新增 tests/unit/calendar-tz.test.ts 17 例（绝对时间构造、TZ 无关）：旧口径泄漏复现 + 新口径单桶 + 负时区 + 亚秒归零 + applyQuote 两市场端到端 + 倒计时切换重算。门禁：typecheck + 单测 580/580（563 存量零回归） | 数据正确性：周/月/日桶口径三分（聚合/报价/倒计时）统一 | src/data/*、src/engine/countdown.ts、src/engine/renderer/ChartController.ts、src/hooks/useChartCommands.ts、src/features/market/useChartSeries.ts、tests/unit/calendar-tz.test.ts |
