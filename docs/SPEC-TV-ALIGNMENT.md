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

# 2. 生产构建（产物 ≤ 预算，当前 49KB gzip 基线）
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
