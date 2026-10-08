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
4. 函数级规模红线（oxlint 原生规则，随 lint 执行）：单函数 ≤**60 条语句**、≤**10 个参数**（2026-10-08 由「单文件 ≤300 逻辑单元」自定义脚本改口径——文件级口径对缺陷零捕获、最大文件 ChartController（546 单元）三次复评均裁决「纯委托门面健康」，函数级才直接度量巨型函数这一真实风险；实测全仓 3863 个函数 99.7% ≤30 条、最大 59，故阈值取 60 零基线）。存量 7 个帧编排/分发类大函数经 `.oxlintrc.json` overrides 放宽至 120 并逐条登记（RenderPipeline.draw 97 / useTvShortcuts onKey 107 / drawLegendBlock 88 / drawIndicator 80 / parser dispatch 73 / parseShapeDirective 70 / PaneRenderer.draw 64；放宽为提阈值而非关闭，>120 仍拦）。历史沿革：≤300 行（Prettier 折行致失真）→ ≤300 逻辑单元（2026-09-30 用户裁决 c，scripts/check-file-size.mjs + allowlist，已完成 6→1 项拆分使命）→ 函数级 oxlint 规则（2026-10-08 用户裁决 C，脚本与 allowlist 退役）。注：SPEC-P1/P2、tech-debt-plan 及 §12 历史条目仍保留当时的「≤300 行/逻辑单元」表述，属历史记录）
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
- 每批次完成必须 `npm run typecheck && npm run lint && npm test && npm run test:e2e` 全绿才能进下一批（规模红线已内嵌 lint：max-statements 60 / max-params 10）
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
# 1. 机器无关门禁一键跑 + E2E（全绿才算批次完成）
npm run verify            # = typecheck（app + node 双项目）+ lint + format:check + test
npm run test:e2e          # Windows 上须先自起 dev server（见 README「E2E 在 Windows 上」节）

# 2. 生产构建（产物预算基线：**224.31KB gzip / 732.9KB raw / 8 chunk——2026-09-30 代码分割后实测**。
#    构成：应用 445.04 + react 142.20 + radix 69.89 + lucide 37.73 + vendor 37.53 + zustand 1.50 KB
#    （gzip 132.78 / 45.56 / 21.72 / 7.86 / 13.99 / 0.78）。较分割前单块 222.93KB gzip 多 1.38KB
#    为 8 个 chunk 的头部/重复导出开销，属预期；收益是 **>500KB 单 chunk 警告消除**且第三方库可独立缓存。
#    历史：09-28 记 172KB、09-29 记 197.8KB、09-30 分割前 222.93KB——预算随 P1/P2 功能累积上移；
#    体积只认同日同环境对照，跨日漂移不作回归判据）
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
| 2026-09-30 | **日历桶时区分裂修复**（数据层查阅发现）：aggregate.ts 周/月桶按 UTC 归桶而 liveBar.ts 按浏览器本地归桶，UTC+8 下本地周一的日 K 泄入上一周桶（sina 期货/美股 1W/1M 本地聚合路径），且聚合周 K 时间戳与报价对齐时间永不相待→末柱被静默丢弃；crypto 1D 报价同样因本地午夜口径被丢弃。修复：新增 data/tz.ts（calendarTzOffsetMinutes：crypto=0/CN=本地），aggregateBars/alignBarTime/applyQuote/nextCalendarClose 增加可选 tzOffsetMinutes 参数（默认 0=UTC，crypto 与 ChartCell 种子行为零变化）；sina/tencent 聚合传本地偏移；useChartSeries 按 instRef 市场传参；CloseCountdown.setCalendarTzOffset 经 ChartController.setCalendarTzOffset ← useChartCommands（market prop 既有链路）下发，修复 CN 周/月收盘倒计时偏差。新增 tests/unit/calendar-tz.test.ts 17 例（绝对时间构造、TZ 无关）：旧口径泄漏复现 + 新口径单桶 + 负时区 + 亚秒归零 + applyQuote 两市场端到端 + 倒计时切换重算。门禁：typecheck + 单测 580/580（563 存量零回归）+ E2E 47/47 | 数据正确性：周/月/日桶口径三分（聚合/实时补末柱/倒计时）统一 | src/data/*、src/engine/countdown.ts、src/engine/renderer/ChartController.ts、src/hooks/useChartCommands.ts、src/features/market/useChartSeries.ts、tests/unit/calendar-tz.test.ts |
| 2026-09-30 | **P2-A① 交付**（6056eb4）：bgcolor/barcolor 渲染接线。core 契约新增 IndicatorDef.computeExtra?（与 compute 同窗口、同脏缓存周期；WindowCacheEntry 缓存 extra；BarPaint 通用形状，core 不依赖 pine 类型）；pine/program.ts 的 computeExtra 按入窗 bars 引用精确取数（lastPaintRun 槽位），修复图例窗/绘制窗交替时 WeakMap 元数据串窗；新 drawPinePaint.ts：bg 相位条件列背景色带（alpha 0x26）+ bar 相位蜡烛体覆绘（几何与 drawCandles 一致，仅蜡烛族类型）；PaneRenderer 两 call point（bg 先于 K 线/bar 后于），computeWindow 与 drawIndicator 同键一帧一算。门禁：typecheck + 单测 589/589 + E2E visual/smoke/pine 31/31 | SPEC-P2 P2-A① | src/indicators/core/*、src/indicators/pine/program.ts、src/engine/renderer/{drawPinePaint,PaneRenderer}.ts |
| 2026-09-30 | **P2-A②③ 交付**（1e194fc）：plotshape/plotchar（7 shape × 3 location 含 absolute 价格定位）+ alertcondition。编译门禁放宽为 plots/hlines/shapes/alerts 四者有一（纯警报/纯标记脚本合法）；computeExtra 联合旁路 [paint, shapes, alerts]；新 drawPineShapes.ts（162 行）PaneRenderer 单 call point；pine/alerts.ts 注册表（dry-run 前登记/失败清除/同 id 覆盖）；AlertPanel「Pine 条件」分区一键添加 + useAlertWatcher pineAlertSamples 并入同一 watcher（无新定时器）。关键设计：条件序列走 computeExtra 窗口脏缓存而非全局槽位——watcher 命中脏缓存时不会读到图例窗 cond（专项测试钉死）。新增 39 例；既有 pine 89 + alert-logic 15 零回归。门禁：typecheck + 单测 785/785 + E2E 47/47 | SPEC-P2 P2-A②③ | src/indicators/pine/*、src/engine/renderer/{drawPineShapes,PaneRenderer}.ts、src/features/alerts/* |
| 2026-09-30 | **P2-B 交付**（d77b8b7）：画线家族 11 工具 + AVWAP，几何纯函数与 canvas 绘制全分离（textMath/textRender、measureMath/measureRender、shapeMath/shapeRender、gannMath/gannRender、elliottMath/elliottRender）。AC-B1 全链路（落点/编辑/命中/序列化/对象树/撤销/多选/磁吸）经 136 新测覆盖；AC-B2 测量浮层三行 + Esc 取消；AC-B3 AVWAP 锚定落点状态机（anchorDrop.ts + ChartController 接线，选 bar 模式/改色不丢锚/切工具放弃）。黄金截图零 diff（20 面全走 harness 路径，工具栏 6→8 组结构性不可见——已核实 openHarness）。已知边界：多边形顶点「增」的 UI 接线未做（insertPolygonVertex 等纯函数已交付+单测，工具态点击边插入需 DrawingGesture.place 钩子，留待下批次）；AVWAP 重挂需重新落点（锚点仅存实例）。ChartController 因此增至 621 行——§12 既定裁决条件「门面长回逻辑时再拆」触发，拆分为在案任务 | SPEC-P2 P2-B | src/engine/drawing/*、src/features/drawings/*、src/indicators/builtin/avwap.ts |
| 2026-09-30 | **P2-C 交付**（5cd9f5e）：平台补全 + **App.tsx 裁决项关闭**。syncBus 三 channel（onSymbol/onInterval/onDrawings，sourceId 防环 + 30Hz rAF 限频沿用，零 React 介入）；单元格最大化（Alt+Enter/双击标题区，maximizedCell 进快照）；边缘拖拽调比（动态 fr + 原子双轨 + MIN_TRACK_RATIO 钳制，commitMeta 落盘）；control_bar 五按钮；符号搜索收藏分组置顶。App.tsx 650→237：状态下沉 chartConfigStore/uiStore，装配拆 TopBar/ChartWorkspace/ChartDialogs；原 useLayoutEffect 补 ref 的 <1 帧竞态被 zustand 同步读结构性消除；layoutSnapshot meta 域（v1 旧档归一化）。门禁：typecheck + 单测 785/785 + vite build（循环导入模块图可解析）+ E2E 47/47。新登记红线项：SymbolSearchDialog 488（既有 461 + 收藏分组净增 27，拆分需 features/market 新白名单）、LayoutSaveMenu 319（既有违背未动） | SPEC-P2 P2-C + App.tsx 裁决关闭 | src/store/*、src/features/layout/*、src/App.tsx |
| 2026-09-30 | **P2-D 交付**（23294a8）——P2 收官：Compare 叠加（AC-D1）：chartConfigStore.compareSymbol；useCompareSeries.tsx（dataRegistry 一次性 500 根 + 30s 轮询，alignByTime 精确对齐/断线）；drawCompare.ts（非 percent 副坐标独立域 + 8% 留白、percent 模式与主序列同坐标系）；图例第二行经 **setLegend 既有公开 API 进环**（LegendInfo.compare + drawLegend + RenderPipeline 透传）——零引擎公开 API 改动（并行红线拆分进行中的兼容设计）；TopBar Compare 按钮仅单图布局；无序列零开销。画线水平线警报（AC-D2）：alertLogic AlertSource line 分支 + alertPersist 持久化补齐；useAlertWatcher 画线桥（ChartWorkspace 登记 exportDrawings getter + onDrawingsChanged 广播，useSyncExternalStore 快照 diff 缓存）；采样语义=市场价 vs 水平线价（拖动随下 tick 同步）；AlertPanel 分区默认 crossUp。新增 35 例（compare 18 + alert-line 17）。门禁：typecheck + 单测 830/830 + build。已知边界：对比仅最近 500 根、多图表无 Compare、水平线清单拖拽瞬间不实时广播（采样不受影响） | SPEC-P2 P2-D，P2 四批全部交付 | src/features/market/useCompareSeries.tsx、src/engine/renderer/{drawCompare,legendTypes,drawLegend,RenderPipeline,PaneRenderer,drawCrosshair}.ts、src/features/{layout,alerts}/*、src/store/chartConfigStore.ts |
| 2026-09-30 | **ChartController 红线拆分交付**（78b6f49）：按 09-30 P2-B 条目触发的「门面长回逻辑时再拆」条件执行——AVWAP 编排迁出 `avwapAnchor.ts`（65 行，AvwapAnchorDrop + 5 成员窄 host 契约，内部持 anchorDrop 状态机）+ `placingRules.ts`（earlyFinishMinPoints 纯函数）；ChartController 五调用点薄委托化，公开 API 零变化，621→599。599 为纯搬迁下限（host 字面量装配 15 行 + polygon/elliott 放置逻辑不随迁）；**接受 599 并记录**：红线修复实质（编排迁出、门面恢复纯委托）已达成，进一步压缩需删文档或碎片化公开 API——与 09-29 门面裁决同一理由。行为经 drawing-avwap 15 例 + 新建 avwap-anchor 10 例实证 | P2-B 连带红线修复 | src/engine/renderer/{ChartController,avwapAnchor}.ts、src/engine/drawing/placingRules.ts |
| 2026-09-30 | **在案项处置轮**（用户指令「继续处理在案项」，六提交）：① SymbolSearchDialog 488→228（symbolSearchStyles/SymbolSearchRows/symbolSearchFilter 三模块，DOM token 级 diff 零变化）+ LayoutSaveMenu 319→204（layoutSaveMenuStyles）——P2-C 登记的两处红线违背关闭；② 多边形顶点增删 UI 接线（polygonEdit.ts 纯函数 + DrawingGesture.place 钩子，点边插入/点顶点删除/≤3 拒绝不入撤销栈/单步撤销/磁吸两档，20 例含指针级端到端）；③ 水平线拖拽合帧广播（dragBroadcast.ts 门襟 + ChartController.requestDrawingsNotify，变价才请求、每帧至多一次、水平拖动零广播，13 例含假定时器合帧）；④ AVWAP 锚点持久化（engine→store 参数写回通道 setIndicatorParamsCallback + indicatorStore.setAnchorTime，两段相等短路防回环——同会话重建/布局切换不丢锚，跨刷新经指标模板恢复，8 例）；⑤ Compare 左缘翻页（createCompareFeed 纯内核，barsBefore + klineCache.merge + 守卫与主 series 逐字同构，5 例）；⑥ ChartController 合帧状态机再提取（drawingsNotifyCoalescer，628→622，门面恢复纯委托）；⑦ tsconfig 纳入 tests/unit 类型检查（lib ES2022 + mock-ctx 窄签名，顺带修出 4 个真问题：minuteBars NaN 时间/函数类型当数组展开/夹具缺 close/custom id 比较）。终验：typecheck（含 tests）零错误 + 单测 876/876 + E2E 48/48 | 在案项清零（ChartController 622 为在卷门面） | src/**、tests/**、tsconfig.json |
| 2026-09-30 | **图表交互精修四迭**（用户反馈，两提交 bbc1ab6 + c1bc430）：① fib 回撤/扩展水平线不再伸至画布缘——fibMath.fibLevelEndX 共享纯函数（span=max(锚距,24px)，endX=min(chartW,最右锚+span)，锚摆幅度外再延一个摆幅），drawLevelLabel 贴线右端外侧（溢出钳制+右对齐切换），hitTestFib 同函数保持命中与渲染一一对应；扇形/弧线/时区不动（fib 78 例更新+边界新增）。② 选中画线/指标弹出 TV 式浮动工具栏——引擎侧 selectionPopup.ts（SelectionPopupTracker 画线/指标互斥单选、双空→null、同值不重推）+ hitTestIndicator.ts（折线段距≤6px/histogram 柱体/断点不连段/隐藏 plot 跳过，computeWindow 同窗复用脏缓存）；DrawingGesture 8 选中变更点 + 公开 API 经 notifyDrawings 汇聚发射；InputController 空白处接线；ChartController 净增 13 行（635，红线余量内）+ rAF 脏帧重算锚点（平移/缩放后工具栏跟随）。③ React 侧 SelectionToolbar（93 行全 token）：画线=设置/克隆/删除（setSettingsFor/duplicateDrawing/removeSelectedDrawing 既有 API），指标=设置/删除（uid→store id 回表，与图例 handler 同 store action）。④ IndicatorPanel 从画布容器移至 TopBar 指标按钮正下方下拉（附带移除 topBarStyle overflowX:auto——overflow 会裁掉 absolute 浮层）；ActiveIndicatorChips 删除，指标管理统一收口工具栏+图例+面板。E2E 6 处 chips 断言迁移（listIndicators poll + 图例齿轮/副图面板按钮确定性路径）。门禁：typecheck + 单测 902/902 + E2E 48/48 + build | 用户交互反馈精修 | src/engine/**、src/features/{indicators,layout}/*、src/components/Chart.tsx、tests/** |
| 2026-09-30 | **浅色模式两项显示修复**（用户反馈，桌面浏览器+Playwright 双实测）：① 左侧划线面板弹出层（flyout/底部菜单）文字与图标在浅色下不可见——根因：菜单项非选中态 `color: selected ? 'var(--text-on-accent)' : undefined` 把 itemStyle 的 `var(--text)` 静默覆盖为 undefined，标签/图标失去显式颜色（深色下靠继承白色可见故未暴露）；修为显式 `var(--text)`。② 右侧价格轴「自动」恢复区块浅色下黑底——根因：`lightTheme.tooltipBg` 为深色值（#131722，该令牌本供光标轴标签深底白字专用），PaneRenderer autoBtn 复用了它；theme 新增 `autoBtnBg` 令牌（深色 #1e222d 与原值一致保像素中性、浅色 #ffffff）。门禁：typecheck + 单测 902/902 + E2E 48/48（黄金 20 面零 diff） | 用户反馈精修 | src/features/drawings/DrawingToolbarMenus.tsx、src/engine/theme.ts、src/engine/renderer/PaneRenderer.ts |
| 2026-09-30 | **百分比线 + 工具栏图标 TV 化 + 指标模板 TV 化**（用户需求「百分比划线/图标对齐 TV/模板界面对齐 TV」，两提交 54303cd + 4c3f6fa）：① 新增百分比线画线工具——TV 无同名原生工具，取中文行情软件经典八分法语义 + 本项目 fib 家族架构：percentMath（PERCENT_LEVELS + percentPrice 纯函数）/percentRender 分离，7 档水平线组（12.5%–87.5%）+ 右端「百分比 价格」标签；线长/标签策略复用 fibLevelEndX/drawLevelLabel（与 fib 回撤一致的合理长度，不伸画布缘）；命中回撤式；入「预测和测量工具」组。② 左侧划线工具栏图标 TV 化——tvIcons/tvIconsDraw/tvIconsFib 三文件 39 个手绘 SVG（24 viewBox、stroke 1.5、currentColor、round cap/join），覆盖全部 32 ToolbarItem + 底部控件 7 + caret；fib 家族 6 图标与百分比线（三横线+%）明确区分；lucide-react 不卸载（顶栏/面板/对话框仍用，仅工具栏换自绘，最小改动原则）。③ 指标模板 TV 化——indicatorTemplates.ts 持久化层：多命名模板 CRUD（重名追加序号不覆盖）、旧单槽 key 迁移为「默认模板」、坏数据逐条兜底 + MAX 50；TemplateSection 内嵌 IndicatorPanel 底部（TV 指标对话框 Templates 形态：名称输入+保存/模板行+相对时间+应用/重命名/删除/空态引导）；TopBar 两模板按钮移除，管理收口进面板。注：网络资料抓取受限（WebSearch 订阅限制、tradingview.com 不可达、Bing 仅泛化结果），TV 形态依据项目 UI_GAP 已引用的官方规格先例 + 既定交互范式。门禁：typecheck + 单测 931/931 + E2E 48/48 + 浏览器实测（flyout/百分比线放置渲染/模板命名保存列表） | 用户需求（画线扩展 + TV 对齐） | src/engine/drawing/*、src/features/drawings/*、src/features/indicators/*、src/store/*、src/features/layout/TopBar.tsx |
| 2026-09-30 | **百分比线三迭调整 + fib 分割线设置**（用户反馈，2acf0c2）：① 百分比线移入「江恩和斐波那契工具」组（fib-auto 后、gann-fan 前）；② 默认档位改经典三档 0%/50%/100%（PERCENT_LEVELS=[0,0.5,1]）；③ 分割线设置（TV fib 设置输入页 levels 列表形态）——Drawing.levels?: number[]（undefined=工具默认档、数组=可见档位集合）+ defaultLevelsFor；DrawingLayer.updateLevels（快照整组替换单步撤销）+ ChartController 薄委托；DrawingLevelsEditor（144 行）：每档数值输入（×100 显示 ÷100 提交）+ 删除（≥1 档保护）+ 添加档位（空行聚焦），实时生效无确定按钮；parseLevelTexts 五条校验（非法值整批不写/空行跳过/去重保序/round 1e-6 去毛刺/无有效档 null）。渲染与命中统一取 d.levels ?? 默认常量。覆盖 fib/fib-extension/percent-line 三工具；fan/arc/timezone/gann/elliott 暂不支持自定义档（defaultLevelsFor 返回 null，对话框不显示分区——已记录边界）。门禁：typecheck + 单测 959/959 + E2E 48/48 + 浏览器实测（删 23.6% 实时消失/加 150% 实时出现） | 用户反馈精修 | src/engine/drawing/*、src/features/drawings/*、src/engine/renderer/ChartController.ts |
| 2026-09-30 | **档位编辑器双列布局**（ae28860）：DrawingLevelsEditor 的分割线档位列表由单列改 `grid` 双列（`1fr 1fr`，columnGap sm / rowGap xs，单元格 minWidth 0 + input flex:1），删除按钮与 % 后缀随行；「添加档位」按钮保持通栏。aria-label／校验规则（非法值不写、重复跳过、≥1 档保护）／实时生效语义零变化。门禁：typecheck + 单测 959/959 + 浏览器实测（fib 7 档双列渲染） | 用户反馈精修（布局） | src/features/drawings/DrawingLevelsEditor.tsx |
| 2026-09-30 | **共享 DialogHeader 抽取**（5902f68）：Modal（11 处调用）与 ChartSettings/IndicatorSettings/Shortcuts 三个手写对话框各自复制的 44px 标题栏（左标题 + 右关闭）收敛为 `ui/primitives.tsx` 的 `DialogHeader`；Modal 主体内边距改由 `modalBodyStyle` 承担，消除「容器 padding + 头部 margin」两处叠加；删除三处重复的 headerStyle/titleStyle/closeStyle 与 lucide X 导入。CommandPalette / SymbolSearchDialog 保留自绘标题（输入框即标题，无标准头部）。净 -82 行；IndicatorSettingsDialog 401→370 行（向 300 行红线收敛） | 重复代码收敛（对话框标题栏四处→一处） | src/ui/primitives.tsx、src/features/indicators/IndicatorSettingsDialog.tsx、src/features/settings/{ChartSettingsDialog,ShortcutsDialog}.tsx |
| 2026-09-30 | **文档复核同步**（本轮查阅产出，零代码改动）：① 本表修复——合并重复的「日历桶时区分裂修复」条目（原两处为同一条）、把「图表交互精修四迭」行按提交时间（bbc1ab6/c1bc430 15:09）移至「在案项处置轮」之后（单测数 876→902→902→931→959→959 恢复时间单调，此前表序错位造成「959 回落到 902」的误读）、补记 ae28860 与 5902f68；② DEVELOPMENT_PLAN v1.2→v1.3——P2 行由「待启动／未入 git」改为四批已交付，§3.5/§3.6 按代码现状重新勾选，指标口径 63→64；③ OPEN-DECISIONS 关闭 Anchored VWAP（补 Resolution 列，按登记册「就地关闭」规则）。注：本表历史条目中的行号引用随本次增删失效，追溯请以提交时间为准 | 文档与代码/仓库事实不一致（P2 交付状态、AVWAP 状态、单测口径、重复条目） | docs/**、DEVELOPMENT_PLAN.md |
| 2026-09-30 | **工具链补全 + 红线拆分（四文件）**（本轮查阅产出）：① 首次引入 lint/format 工具链——`.gitattributes`（`* text=auto eol=lf`，把行尾策略固化进仓库，摆脱对 core.autocrlf 的依赖；index 本就全 LF，`git add --renormalize` 实测零改动）、`.editorconfig`、ESLint 9 扁平配置（`eslint.config.js`：定位只补 typecheck 与测试都管不到的一类——hooks 调用/依赖规则与 import 卫生，**刻意不启风格规则**，避免与既有 3 万行形成噪声对抗）、Prettier 配置与 `lint`/`lint:fix`/`format`/`format:check` 脚本；新门禁一次跑出 4 个错误并全部真修（`pine/interpreter.ts` 的 `this` 别名改父链递归、`volumeProfile.test.ts` 的 `(panes.length=0)\|\|push` 常量真值表达式改块体、`data.test.ts` 两处 `let`→`const`）。② 红线拆分：IndicatorSettingsDialog 401→287（+indicatorSettingsStyles 89）、ChartContextMenu 361→282（+chartContextMenuStyles 85）、ReplayBar 341→228（+replayBarStyles 117）、watchlistStore 304→170（+watchlistModel 52 / watchlistPersist 117——模型→落盘→store 单向依赖，避免「persist 要 DEFAULT_COLUMNS、store 要 load/save」的运行时循环）；四文件全部降至 300 行以下，调用点零改动（类型/列定义按原路径再导出，13 处 import 未动）。③ 新增 README（项目入口，此前缺失）。门禁：typecheck 0 错 + lint 0 错（32 条 exhaustive-deps/only-export-components 为存量警告基线）+ 单测 959/959 + E2E 48/48（21 面黄金截图零 diff = 拆分像素中性）+ build 222.94KB gzip。**红线未裁决违背清零**（余 ChartController 637 = 已裁决门面，行数由 622 修正记为 637） | 300 行红线违背清零 + 项目缺 lint 门禁/README | eslint.config.js、.gitattributes、.editorconfig、.prettierrc.json、.prettierignore、README.md、package.json、src/indicators/pine/interpreter.ts、src/features/{indicators,market,replay}/*、src/store/watchlist*、tests/unit/{volumeProfile,data}.test.ts |
| 2026-09-30 | **代码分割 + hex 清债 + 画线家族黄金面**（本轮查阅产出，三项一起收口）：① **代码分割**（`vite.config.ts` → `build.rollupOptions.output.manualChunks`）：必须用**函数式**按解析路径分块——对象式列 `'react'`/`'react-dom'` 实测只得到 0.03kB 空壳块（React 实际经 `react/jsx-runtime` 与 `react-dom/client` 入图，不命中裸包名）。产出：应用 444.75 + react 142.20 + radix 69.89 + lucide 37.73 + vendor 37.53 + zustand 1.50 kB，**>500kB 单 chunk 警告消除**（原单块 732.26kB）；零动态 import，边界不改模块求值顺序。② **hex 清债**：新增 `src/engine/palette.ts`（28 色 + 恒白 `white`，命名即色值、alpha 后缀原样保留），`indicators/builtin/*` 12 文件 + `engine/drawing/types.ts` 共 **180 处**默认色、渲染路径 **8 处** fallback/默认参数迁入；canvas 内 `'#ffffff'`×3 → `PALETTE.white`；UI 层 `'#fff'`×8 → 语义 token（`var(--on-updown)`×6 + 新增 `--on-warn`×2，两主题值均 #ffffff，零视觉变化）。全仓 `.ts/.tsx` hex **259 → 90**，剩余全部有归属：theme token 定义 40 / palette 定义 29 + 1 注释 / Pine `color.*` 语言常量表 19 / 代码注释 1（另有 `global.css` 46 处 CSS 变量定义，是 UI token 的唯一落点）。**使用点零 hex 字面量**——canvas 渲染路径、UI 层、指标与画线默认值一律经 palette / token 取值，P0 规则由「声明」变为「可 grep 审计」。③ **画线家族黄金面**（补 P2-B 覆盖空档）：harness 新增 `importDrawings`（走对象树同款 `serializeDrawings`→`deserializeDrawings` 通道，不绕几何/命中/渲染链路）、`barAnchor`（锚点从真实种子 bar 取，钉在可见区内）、`toolDefaultStyle`（样式取 `DRAWING_TOOLS` 单一数据源）；新增 6 面覆盖 **25 个工具**（线类 6 / 通道与形状 4 / 文字类 5 / 几何进阶 3 / 江恩与艾略特 4 / 测量与斐波那契 4），黄金面 **21 → 27**。门禁：typecheck + lint 0 错 + 单测 959/959 + E2E **54**（53 通过 + 1 flaky 重试通过；**27 面黄金截图零 diff**，其中 21 面既有基线零 diff 即调色板 188 处替换的像素中性证明）+ build 无 >500kB 警告 | 存量债务三项：单 chunk >500kB / canvas hex 无审计口径 / P2-B 画线家族无像素安全网 | vite.config.ts、src/engine/palette.ts、src/indicators/builtin/*、src/engine/{drawing,renderer}/*、src/features/{trading,replay,rightbar}/*、src/styles/global.css、tests/e2e/harness/visual-harness.ts、tests/e2e/visual-regression.spec.ts、tests/e2e/__screenshots__/* |
| 2026-09-30 | **Prettier 全仓格式化**（26ccd52）：把工具链引入时留下的「只装工具不重排」欠账做完——177 个受检文件未格式化 → `format:check` 转绿。触及 176 文件、162 处内容变更（另 14 文件仅 stat 残留：worktree/index/HEAD 三者 blob 哈希相同，已核实无内容变更）。**边界（量化而非偏好）**：markdown 与 `docs/` 继续排除——Prettier 表格对齐会把每个单元格填充到该表最长行宽度，而本表单元格长约 2500 字符，实测本文档 44KB → 123KB（**2.79 倍**）、OPEN-DECISIONS.md 1930 → 4069 字节，纳入即不可读。附带收益：工作区行尾由「268 LF + 38 CRLF 混合」归一为 **318 全 LF**，与 `.gitattributes` 的 `* text=auto eol=lf` 一致。同批新增 `.git-blame-ignore-revs`（登记本提交 + 启用方式 + 收录判据「必须已用黄金截图证明零行为变化」）。门禁（格式化后重跑）：typecheck 0 错 + lint 0 错 + 单测 959/959 + E2E 54/54（**27 面黄金截图零 diff = 格式化像素级中性**）+ build | 工具链欠账收尾；OPEN-DECISIONS 该条转 RESOLVED | 全仓 src/**、tests/**、根配置文件、.prettierignore、.git-blame-ignore-revs、README.md、docs/decisions/OPEN-DECISIONS.md |
| 2026-09-30 | **第四轮审查修复批次**（六提交，按严重度排序执行）：**① 阻断——累积型指标窗口重算**（fe0700a）：`computeWindow` 把入参切成 `slice(from-lookback, to+1)`，而 OBV/VWAP/CVD/ADL/Chaikin/AVWAP 的数值是自数据起点累计的绝对量、累加器又在 compute 内初始化 → 同一根 bar 的值随窗口而变（运行时实测 OBV 全量末值 −3 vs 切片窗口 104；ADL −332.67 vs −2546.00），且**图例走 (i−50,i) 而绘制走 (from,to)，同一条线的两个数不相等**，警报采样用 (to−1,to) 更窄窗口拿局部累计值比全序列阈值。修法：`IndicatorDef.cumulative` 声明 + `ctxFrom = 0`；AVWAP 顺带根治原 `lookback:5000` 的「锚点出窗即退化」补丁。新增 `tests/unit/indicator-window-invariance.test.ts`（19 例）——全仓唯一断言窗口不变性的地方（既有 `computeWindow(bars,10,20)` 属脏缓存用例，同窗口比对，结构上抓不到），已验判别力：回退后 8/19 失败、覆盖 6 个指标。**② 高——指标数值四修**（adb6125 + 65fe59a）：MACD 信号线由 SMA 改 EMA（与 TV 标准及同仓 Pine `ta.macd` 的 `dea = EMA(dif,signal)` 对齐；原金标准用例用单调 ramp，SMA/EMA 都会收敛，故另加非收敛数据 + 独立 EMA oracle 且自检判别力的专项用例）；Fisher 补 Ehlers 递归项 `+0.5·f[1]` 并把 Trigger 改为上一根 Fisher（原 `fisher` 缺递归、`trigger` 反而是半个 Fisher）；ADX 改取 DX 稠密尾段平滑（原把未就绪段补 0，种子被摊薄到 1/sm——单边上涨时首值 20 而非 100；ADX 此前**无任何金标准用例**）；`lookback` 按「窗口型参数上限之和（封顶 1000，排除 annual 等非窗口参数）」重算，**50 个 def** 修正（sma 200→500、macd 100→400、ichimoku 120→700 等），原状态下把周期拉满时可见区左侧整段 undefined。**③ 崩溃/卡死**（187b83d）：renko/pnf 的 `while` 在 brickSize=0 时条件恒真（`>= 0`）死循环、离群价配小砖爆迭代（ChartState 的 `atr(...) \|\| close*0.001` 在全 0 价时恰产出 0，而 `?? 1` 不拦 0）→ 加 `safeBox` 规整 + `MAX_OUTPUT_BARS=20000` 输出上限；`Chart.tsx` 前插判定原只看「旧首柱时间在新数组 index>0」，而换品种时两序列共用时间栅格必然命中 → 抽为纯函数 `components/chartPrepend.ts`，要求同标的同周期 + 后缀逐根时间一致。**④ 回放泄露未来价**（4d1926b）：`visibleRange` 已按 replayIndex 截断，但最新价线/轴徽章/图例仍取真实末柱 → 新增单一事实源 `ChartState.currentIndex/currentBar`，PaneRenderer 与 RenderPipeline 改取之。**⑤ 基础设施**（55a92f3）：klineCache 连接改单例（原每次 get/put 新开且从不 close，put 由 5–30s 轮询每拍触发）+ 内容指纹/5s 间隔写入节流；新增 `npm run audit`（本机 npmmirror 不实现安全审计端点，直接 `npm audit` 报 NOT_IMPLEMENTED，等于项目从无可用依赖漏洞检查）。**验证纪律**：每个修复都验证过回归测试的判别力（回退实现即失败），而非仅「改完测试通过」。门禁：typecheck + lint 0 错 + format:check 绿 + 单测 **999/999** + E2E 54/54（27 面黄金零 diff）+ build。**未修项已按主题登记入 OPEN-DECISIONS** | 第四轮独立代码审查（引擎/数据 + 指标/功能/状态 两路并行） | src/indicators/{core,builtin,pine}/*、src/data/{transforms,cache}/*、src/components/{Chart,chartPrepend}、src/engine/renderer/{ChartState,RenderPipeline,PaneRenderer,ChartController}、package.json、README.md、tests/unit/*、docs/decisions/OPEN-DECISIONS.md |
| 2026-09-30 | **红线改度量口径：行 → 逻辑单元**（用户裁决选 c）：原「单文件 ≤300 行」一直在测量**格式产物**而非文件规模——Prettier 折行（printWidth 120）后 >300 行的文件由 1 个变 9 个，而 `ChartController.ts` 在 printWidth 100/120/140/160 下分别是 868/840/829/827 行，即它在任何排版下都超标，原 637 行只是手写长行的假象；反向漏报同样严重——`indicators/builtin/trend.ts` 物理行仅 270（行数排名第 29）却逻辑单元排全仓第 4。新口径 **逻辑单元数** 用 TypeScript AST 统计语句 + 声明 + 类成员 + 对象字面量成员，与排版完全无关（折行/缩进/空行/注释均不影响）。实测分布：236 文件、中位 80、p90 191、p95 229、p99 368、最大 542；上限取 **300**（介于 p95 与 p99 之间，命中 6 个 = 2.6%），另设物理行 ≤900 宽松护栏。落地 `scripts/check-file-size.mjs`（`npm run check:size`）+ `scripts/file-size-allowlist.json` 存量例外清单（每项带理由与登记出处）——与 ESLint 警告基线同一思路：存量债务枚举化、有界化，门禁只拦**新增**超标并提示可移除的旧条目，而非为门禁全绿做大爆炸拆分。已验门禁判别力：临时造一个 320 单元文件即被拦下并退出码 1。口径同时写入 §4 锁定条目、§9/§11 批次门禁、README 施工红线；已交付批次的规格（SPEC-P1/P2、tech-debt-plan）保留当时的「≤300 行」表述并已在 §4 注明为历史记录。6 个存量超标文件的拆分批次已登记 OPEN-DECISIONS | 第四轮审查暴露「红线测量格式而非规模」；用户裁决选改度量口径 | scripts/check-file-size.mjs、scripts/file-size-allowlist.json、package.json、eslint.config.js、README.md、docs/SPEC-TV-ALIGNMENT.md（§4/§9/§11）、docs/decisions/OPEN-DECISIONS.md |
| 2026-10-08 | **未决项清零批次**（用户指令「处理全部的未决项」，5 个并行 agent + 主 agent 收口，OPEN-DECISIONS 仅剩 aggTrades VP 增强 1 项——依赖 Binance aggTrades 端点当前网络不可达，维持 OPEN）。交付内容按主题：**① 引擎交互三项**（第四轮审查引擎层）：ChartState.applyData 末尾无条件 crosshair.clear() 移除（清除收敛到真正的序列替换入口 setData/setChartType + 前插重映射，实时 tick 不再反复抹掉十字光标与轴标签）；PanZoomGesture 拖拽开始锁定目标面板 + 仅纵向分量 dy≠0 才置 pane.manual（纯水平拖拽不再永久关 autoscale）；drawIndicator band 改逐连续段填充，上/下带任一 undefined 即断开（BOLL 带左缘不再连到 0 价）。**② 交易/警报口径裁决后修复**：越界下单时间钳到最近一根 bar（保留交互，标记不再永不绘制）；checkTpSl 开盘跳穿按开盘价成交 + 同 bar 双触先判 SL（保守优先）；clearTriggered 只清「已触发且已停用」（every 运行中警报不再被误删）；AlertEditDialog 保存保留原 active（已暂停警报不被静默恢复）。**③ Pine 四项**：validator lookback 参数化周期估算（input.int 取 maxval 上界 + fundef 分支 + 两遍遍历函数体）；input.int 兜底 min:1 + 运行期错误广播（pineRuntimeErrors/subscribePineRuntimeErrors）与 UI 出口（IndicatorSettingsDialog 警示条 + PineEditorPanel 控制台）；标识符解析用户变量优先；if 的 NaN/na 为假。**④ 数据层**：aggregate dayBucketStart 多日档（1D/3D/自定义 N 日）按 tzOffsetMinutes 本地日历归桶，alignBarTime 复用同源（末柱时间戳可对上），tz=0 退化纪元对齐零行为变化。**⑤ 低优先清尾 10/10**：订单表只淘汰终态单；保本单不计亏损 + 全胜 profitFactor 定值 0；警报源空 plot 不静默降级；回放可播放到最后一根；MFI 双链路口径按 TV 定义统一（双方 0→中性 50，已记录的有意偏离）；pineStore.save 清 DRAFT_ID；useGroupHold 移出/失焦清理；watchlistPersist 坏档枚举校验。**⑥ 文件规模拆分批 6/6**：trend/momentum/momentum-osc/oscillators 四指标文件按族拆为 13 个文件、taFunctions 拆为 ta-shared/ta-overlap/ta-momentum/ta-math（共享层独立避免循环 import），IndicatorDef 常量名与 registry 注册顺序零改动；ChartController 第三次复评维持门面不拆（约八成为不可再削减的委托面），allowlist 仅剩其 1 项。门禁（2026-10-08 实测）：typecheck 0 错 / lint 0 错 61 警告（基线零漂移）/ check:size 无新增超限 / format:check 绿（顺带修复 2 个存量不合规文件）/ 单测 62 文件 1090 例全过 / E2E 53 过 + 1 例期货搜索网络 flaky（重试通过）+ **27 面黄金截图零 diff**（专项复跑 27/27）/ build 7 chunk 最大应用块 453.49 kB。新登记未决项 1：pineStore.remove() 同类 pine alerts 登记残留（删除路径未清） | 用户指令处理全部未决项 | src/indicators/{pine,builtin,registry}*、src/data/{aggregate,liveBar,aggregatePath}.ts、src/engine/renderer/{ChartState,PanZoomGesture,drawIndicator,InputController}.ts、src/features/{alerts,trading,replay,drawings,pine,indicators,watchlist}*、src/store/{alertStore,pineStore,replayStore,watchlistPersist}.ts、scripts/file-size-allowlist.json、tests/unit/*、docs/decisions/OPEN-DECISIONS.md、README.md |
| 2026-10-08 | **技术债清偿批次**（用户指令「全部开工完成」，4 个并行 agent + 主 agent 收口）：① **Pine 修复组合**——`pineStore.remove()` 删除脚本时同源清理 pine alerts 登记（save 路径 10-08 已修、remove 路径漏网）；布尔运算族 NaN/na 语义按 TV v5 重写（`not na = true`、`false and na = false`、`true and na = na`、`true or na = true`、`false or na = na`，binBool 不预传播 undefined、not 改 map 取代跳过洞的 lift）——第四轮只修 if 的漏网项，金标准评估零例需更新（无布尔用例），新增 pine-boolean-na 18 例。② **水印渲染接线**（UI_GAP P2 死开关）：新建 drawWatermark.ts（TV 式「代码 · 周期」居中大号半透明，字号随面板缩放、超宽收缩至面板 90%）+ RenderPipeline 接线（开关读既有 watermarkVisible，关闭提前 guard 零开销，置于面板内容之上、画线/交易/光标层之下）+ theme watermark token 双主题等强度；文本复用 setLegend 下发的 LegendInfo，无新增公开 API。③ **UI token 收敛**（UI_GAP P1）：37 个 .tsx 的 144 处图标 size + 34 处 borderRadius + 7 处 CSS 图标槽 → icon/radius token 引用，逐值对应**零像素变更**（UI_GAP「5 档混用 13/14/15/17/19」系 09-28 过期观测，实测现存仅 12/14/16/18 与 3/4/6/8 两族四档、与 token 定义完全一致）；ToolbarSelect prop 同名遮蔽用 `icon as iconSize` 别名解决；奇数值（圆角 0/1/7/2、LayoutGrid 控件高度 18、loading 尺寸 24、色板方块 10）有意保留并列册。④ **设置对话框深度**（UI_GAP P1 最大缺口）：价格坐标 left/none 引擎支持（chartPanes 三态几何纯函数 chartAreaWidth/chartAreaOffsetX + ChartState priceAxisPos 状态 + PaneRenderer/InputController/drawAxes/crosshairOverlay/drawVolumeProfile 全链随侧 + ChartSettingsDialog Scales 页启用左/无并删「引擎侧支持中」提示）+ 时间坐标 12/24 小时制（formatTime hour12，日内 H:mm AM/PM，0→12 AM、12→12 PM）；**chrome 层收口**：agent 交付的面板层正确但 chrome 层仍按右锚几何的半成品由主 agent 补线——RenderPipeline 的时间轴/边框/十字光标/图例块/联动参考线/选 K 预览/画线层/交易层全部按轴侧偏移，图例块 translate 后 studyRects 维持局部坐标（HoverController/InputController 同口径判定），SyncBridge.drawReferenceLine 增 offsetX 参数，cursor.decideCursor 增 chartLeft（左轴区 ns-resize），InputController 新增 chartX() 统一把图表区输入换算局部坐标（画线放置/命中/交易命中/指标选中/悬停/滚轮锚点/右键落点/选 K）。默认 right/24h → 全部既有路径零像素变化。门禁（2026-10-08 实测）：typecheck 0 错 / lint 0 错 61 警告（基线零漂移）/ check:size 无新增超限（ChartController 559 单元仍唯一例外）/ format:check 绿 / 单测 65 文件 **1145** 例全过（+55）/ E2E 53 过 + 1 例期货搜索网络 flaky（重试通过）+ **27 面黄金截图零 diff**（chrome 改动后专项复跑 27/27）/ build 7 chunk 最大应用块 456.61 kB（<500 kB）。新登记未决项 1：`ops.eq`（==）遇 na 返回 na 而 TV v5 为 false（比较族，与已修布尔族同源，1-3 行）。已知残留（裁决保留）：`zoom()` 缩放锚点仍为画布中心（改图表区中心会使默认态锚点偏移 32px，违背零像素验收） | 用户指令清偿全部技术债（UI_GAP 三 P1 + 一 P2 + Pine 两细项） | src/indicators/pine/series.ts、src/store/pineStore.ts、src/engine/theme.ts、src/engine/renderer/{drawWatermark,RenderPipeline,chartPanes,ChartState,drawAxes,crosshairOverlay,PaneRenderer,InputController,HoverController,SyncBridge,cursor,ChartController}.ts、src/features/settings/ChartSettingsDialog.tsx、src/** 37 个 .tsx（token 收敛）、tests/unit/{pine-boolean-na,pine-store,watermark,price-axis-pos,time-format,chart-state}.test.ts、docs/decisions/OPEN-DECISIONS.md、README.md |
| 2026-10-08 | **规模红线口径三迁收口：check:size 退役，换 oxlint 函数级规则**（用户裁决 C：砍掉自定义脚本、不换 max-lines、以函数级原生规则接棒）。背景数据（实测）：四轮审查约 30 项发现中零项由文件规模导致；最大文件 ChartController（546 逻辑单元）三次复评均裁决「纯委托门面健康」；全仓 3863 个函数中 99.7% ≤30 条语句、max-statements 最大 59、max-params 最大 10——文件级口径的信号密度低于其维护成本（194 行自定义脚本，历史上随工具链迁移重写两次：TS JS API→Babel→oxc-parser）。交付：① `.oxlintrc.json` 新增 `max-statements: ["error", 60]` 与 `max-params: ["error", 10]`（零基线，即刻生效）；② 存量 7 个帧编排/分发类大函数（RenderPipeline.draw 97 / useTvShortcuts onKey 107 / drawLegendBlock 88 / drawIndicator 80 / pine parser dispatch 73 / parseShapeDirective 70 / PaneRenderer.draw 64）经 overrides 放宽至 120 并逐条登记——提阈值而非关闭，探针实证 >120 仍被拦；③ 删除 `scripts/check-file-size.mjs` + `scripts/file-size-allowlist.json`（scripts/ 目录整体退役）与 `npm run check:size`；④ README/§4/§9/§11 门禁表述同步（批次出口标准去掉 check:size）。排除的备选（已核实）：折叠进 oxlint 自定义规则——oxlint 1.86 无用户自定义规则插件 API；`max-lines` 替代——重新引入 Prettier 折行敏感性（2026-09-30 改口径的根本原因）。判别力探针：127 语句函数被拦（全局 60）、放宽文件内 130 语句被拦（120）/115 放行。门禁：typecheck 0 错 / lint 0 错 61 警告（基线零漂移）/ format:check 绿 / 单测 65 文件 1145 例全过 | 用户指令执行方案 C；规模红线从「文件级代理」升级为「函数级直标」 | .oxlintrc.json、package.json、scripts/（删除）、README.md、docs/SPEC-TV-ALIGNMENT.md（§4/§9/§11/§12）、docs/decisions/OPEN-DECISIONS.md |
| 2026-10-08 | **验证规则与工具配置审计补齐**（用户指令重新检查全部验证规则与工具配置）：**① 类型检查覆盖缺口闭合（本轮最重要发现）**——实证 `tsc -b` 只构建根 `tsconfig.json`（src + tests/unit），`tsconfig.node.json` 是从未被构建的**死配置**，且其 include 也只有 vite.config.ts；导致 `vite.config.ts`、`playwright.config.ts`、`tests/e2e/**` 三类文件**完全不在类型检查范围**（探针实证：向 playwright.config.ts 注入 `const PORT: string = Number(...)` 类型错误，typecheck 通过）。修复：`tsconfig.node.json` 扩include 至三处 + `paths: {"@/*": ["./src/*"]}` + DOM lib（e2e 的 page.evaluate 回调）+ `types: ["node"]`；`typecheck`/`build` 改双项目构建 `tsc -b tsconfig.json tsconfig.node.json`；新增 devDep `@types/node@^22`（e2e 与配置的 `node:url`/`process` 类型来源）。顺带修出两个被掩盖的既有问题：vite.config.ts 的 `/// <reference types="vitest" />` + `from 'vite'` 增强方式在严格检查下不生效（`test` 键报 TS2769），改用标准 `import { defineConfig } from 'vitest/config'`；`visual-harness.ts` 一处隐式 any 随 paths 修复自然消解。闭合实证：向 smoke.spec.ts 注入 `const BAD: number = "x"`，typecheck 报错。**② 门禁聚合**：新增 `npm run verify`（typecheck + lint + format:check + test 一键跑，机器无关；E2E 因 Windows dev server 前提保持独立）。**③ 配置清理**：`.oxlintrc.json` overrides 移除已随 scripts/ 退役的死模式 `scripts/**/*.mjs`；`.editorconfig` 补 `max_line_length = 120` 对齐 Prettier printWidth；`playwright.config.ts` 加 `trace: 'on-first-retry'`（flaky 排查不必重跑全量）；`package.json` 固化 `engines: node >=22.22.2`（jsdom@30 要求，原仅 README 文字记录）。门禁：verify 全绿（tsc 0 错 / lint 0 错 61 警告基线不变 / format:check 绿 / 单测 65 文件 1145 例）/ build 通过（最大应用块 456.61 kB，与审计前一致——本轮零运行时行为变更） | 用户指令审计验证规则与工具配置 | tsconfig.node.json、package.json、vite.config.ts、.oxlintrc.json、.editorconfig、playwright.config.ts、README.md、docs/SPEC-TV-ALIGNMENT.md（§12） |
| 2026-10-08 | **二轮配置审计：依赖卫生 + 截图重基线机制 + 严格度对齐**（用户指令再次全面复查）：① **依赖漏洞复发并修复**——`npm run audit` 实测 1 项 high：传递依赖 `source-map-js@1.2.1`（jsdom→css-tree 与 vite→postcss 双路 dedupe，GHSA-68fv-2mgg-jv7q event-loop DoS），`npm audit fix --registry=registry.npmjs.org` 升至 1.2.2，复检 **found 0 vulnerabilities**（注意：`npm audit fix` 不带 `--registry` 会被本机 npmmirror 的 NOT_IMPLEMENTED 端点挡住，必须带官方 registry，与 audit 脚本同因）。② **死依赖清理**——`oxc-parser` 的唯一消费者 check-file-size.mjs 已于上轮退役，`npm uninstall` 移除。③ **semver 兼容依赖更新**（`npm update`，manifest 范围不变）：radix dialog 1.2.0 / tooltip 1.3.0 / dropdown-menu 2.1.25 / tabs 1.1.22、lucide-react 1.52.0、@vitejs/plugin-react 6.1.2、vite 8.3.3、oxlint 1.87.0、jsdom 30.1.2。残留 outdated 仅跨主版本（@types/node 26 线对 Node 26 / jsdom「latest 29.1.1」低于已装 30）——按 engines 锁 22 线不动。**oxlint 1.86→1.87 警告基线零漂移实证**（仍 61 条：exhaustive-deps 19 / refs 14 / refresh 13 / set-state 11 / purity 3 / use-memo 1）。④ **黄金截图重基线机制补缺**——新增 `npm run test:e2e:update`（playwright --update-snapshots）+ README 纪律注明（仅有意渲染变更时用、同提交审查 diff、禁止顺手全量更新；此前重基线只有 §12 历史文字、无可执行入口）。⑤ **双项目严格度对齐**——tsconfig.node.json 补 `noUnusedLocals`/`noUnusedParameters`（探针实证零连带错误，与 tsconfig.json 一致）。门禁：typecheck 0 错 / lint 0 错 61 警告 / format:check 绿 / 单测 65 文件 1145 例 / build 通过 / **E2E 54/54 全过**（含往常 flaky 的期货搜索，27 面黄金截图零 diff——依赖更新行为中性的实证） | 用户指令二轮审计；README「0 漏洞」表述已漂移需修正 | package.json、package-lock.json、tsconfig.node.json、README.md、docs/SPEC-TV-ALIGNMENT.md（§12） |
| 2026-10-08 | **GitHub Pages 部署落地**（用户指令推送仓库 + 打包部署成 gitpage）：① `.github/workflows/deploy.yml`——push main / workflow_dispatch 触发，两 job：build（checkout → setup-node 22.22.2 + npm cache → `npm ci` → **`npm run verify` 门禁先行（红则终止部署）** → `npm run build` → `touch dist/.nojekyll` → upload-pages-artifact）与 deploy（deploy-pages@v4，environment github-pages）；permissions 最小化（contents:read / pages:write / id-token:write），concurrency=pages 防并发部署互踩。② `vite.config.ts` base 自动推导：Actions 环境取 `GITHUB_REPOSITORY` 的 repo 段 → `/tradingPA/`，本地与普通构建保持 `/`（实证两种产物资源路径 `/assets/…` vs `/tradingPA/assets/…`）；单页应用无路由无需 SPA 回退。③ `package.json` 新增 `build:pages`（`vite build --base=/tradingPA/`，跨平台无 env 语法依赖，本地预演用）。④ README 新增「GitHub Pages 部署」节（触发方式、一次性仓库设置 Settings→Pages→Source=GitHub Actions、新浪代理路径在 Pages 不可用的已知边界）。遗留（需用户在 GitHub UI 操作）：Pages Source 设为 GitHub Actions | 用户指令推送 + Pages 部署 | .github/workflows/deploy.yml、vite.config.ts、package.json、README.md、docs/SPEC-TV-ALIGNMENT.md（§12） |
