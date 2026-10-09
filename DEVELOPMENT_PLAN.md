# TradingView 图表平台 1:1 复刻 — 开发计划

> 版本：v1.5 ｜ 日期：2026-10-09
> 目标：以完整平台形态，1:1 复刻 TradingView 的图表功能（图表类型 / 周期 / 指标 / 画线工具 / 实时行情 / 平台能力）。
> v1.2 回填说明（2026-09-30）：§3 清单按代码现状勾选——M0-M7 之后，TV-ALIGNMENT v2.0（P0 八项）与 P1 六个批次（A–F）已交付：指标 63 个、图表类型 18 种、周期 22 档 + 自定义间隔、Pine 迁 `src/indicators/pine/`（12 模块）。
> v1.3 回填说明（2026-09-30 复核）：**P2 收官批次（A/B/C/D）已全部交付并入版本库**（6056eb4+1e194fc ／ d77b8b7 ／ 5cd9f5e ／ 23294a8），详见 docs/SPEC-P2.md §7 与 docs/SPEC-TV-ALIGNMENT.md §12；§3 清单据此重新勾选。本版复核实测：内置指标 64 个、图表类型 18 种、周期 22 档、画线工具 30 个；门禁 typecheck 0 错 + lint 0 错 + 单测 959 + E2E 54（27 面黄金截图零 diff）+ 构建 8 chunk（最大应用块 445 kB，合计 gzip 224.31KB）。
> v1.4 回填说明（2026-10-09 复核）：**二期（PHASE-2）七个批次 A／B1／C1／C2／D／E／F／G 已全部交付**（901d5fe…d1b2e64），详见 docs/PHASE2-PLAN.md §2 各批交付记录；§3 清单原留空的画线形态家族与「图标与表情」两项已由二期-C 关闭，至此 §3 无未勾项。本版复核实测：画线工具 30 → **45**、指标 64、图表类型 18、周期 22 档 + 自定义间隔；门禁 typecheck 0 错 + lint 0 错 0 警告 + **单测 79 文件 1288 例全过** + E2E 56 例（55 过 + 1 例网络 flaky 重试即过，**27 面黄金截图零 diff**；复跑中发现并修掉 1 例用例脆弱：`interactions.spec.ts` 两处日历用例按年份字面量取日格，mock 区间随 `Date.now()` 漂移后命中 `disabled` 补位格致永久等待，已改按可访问名 ISO 形态 + `disabled: false` 选取——非应用回归）+ build 通过。三个决策点 D1/D2/D3 已于 2026-10-08 裁决锁定（**D1 不引入自建后端** → 分享落地页／云同步／B2 推送维持「明确不做」，后端立项放三期评估），见 docs/PHASE2-PLAN.md §5。
> v1.5 回填说明（2026-10-09 热修）：**形态家族画线冻结修复**。二期-C1 的谐波比率标签无条件索引 `pts[4]`，而放置中的 `__preview` 与已落定画线走同一条渲染路径；锚点不足 5 个时抛 TypeError，异常从 `pipeline.draw()` 逃出后 `ChartController` 的 rAF 循环不再自我重挂（ChartController.ts:425→431），整张画布永久冻结——用户侧表现为「ABCD 分类下其他划线工具没效果」。修复为整段比率标签按 `pts.length >= HARMONIC_LABELS.length` 守卫，不足时只画折线与锚点字母（同时消除越界点 price 兜底 0 的假比率）；新增 `tests/unit/drawing-pattern-render.test.ts` 覆盖 9 个形态工具 × 1..5 锚点逐档不抛错。复核实测：**单测 80 文件 1299 例全过**（+1 文件 +11 例）、typecheck 0 错、lint 0 错 0 警告、E2E 56 例（55 过 + 1 网络 flaky，**27 面黄金截图零 diff**）、build 7 chunk、最大应用块 495.47 kB（gzip 141.17 kB）。**遗留**：单次绘制异常仍能打死 rAF，加固（draw 抛错后仍重挂帧）登记为下一批独立项。

## 进度

- [x] **M0 脚手架 + 引擎原型（第 1 周）已完成**
  - 工程：Vite + React 18 + TS + Zustand，`npm run dev` / `build` / `typecheck` 全部通过
  - 引擎：`CanvasManager`（DPR/Resize）、`Viewport`（平移/锚点缩放/边界钳制）、`PriceScale`（自动适配/刻度）、`ChartRenderer`（rAF 合帧 + 网格 + 蜡烛 + 价格/时间轴 + 拖拽平移 + 滚轮缩放）
  - 验证：浏览器实测——缩放锚点漂移 0px、拖拽平移数值精确、控制台无错误、生产构建 49KB gzip
  - 开发环境调试句柄：`window.__chartRenderer`（仅 DEV 构建存在，供 E2E 使用）
- [x] **M1 核心引擎（第 2–4 周）已完成**
  - 数据层：`BarSeries`（时间升序容器、增量更新、二分查找）
  - 十字光标：吸附 K 线、虚线、价格/时间轴标签、左上角 OHLCV + 涨跌幅图例
  - LOD：spacing < 4px 切换按像素列聚合的细线模式，单次 path 描边
  - 性能：10 万根 K 线同屏（spacing 0.00466 铺满宽度）帧时间 3–9ms，常规视图 <1ms
  - 实时路径：`updateBar` 同时间戳替换 / 新时间戳追加（App 内置 800ms 模拟跳动）
  - 修复：clamp 右边界漏减 visibleCount 导致可平移进空视图；缩放下限超过"数据铺满"所需间距导致数据挤右半屏
- [x] **M2 图表类型与周期（第 5–6 周）已完成**
  - 周期：19 档（1s–1M），`aggregateBars` 纪元对齐 + 周一对齐周 + 自然月，成交量守恒，10 万根 1m → 1H 聚合 1668 根实测
  - 图表类型 12 种：蜡烛/竹线/线形/面积/基线/空心/HA/Renko/Kagi/LineBreak/PnF/Range（后 5 种经 `transforms.ts` 由源数据变换，Renko/箱体尺寸按 ATR(14) 自适应）
  - 对数价格轴（log 空间取整刻度，实测刻度等比分布）
  - 多面板：主价格面板 + 成交量副图（可开关），每面板独立价格轴，十字光标/垂直拖拽按悬停面板生效
  - 顶部工具条：周期/图表类型/对数/成交量切换，实时联动
  - 修复：LineBreak 窗口基准误用 window[0] 导致永不触发；实时更新不再把视口拽回右边缘（仅贴边时跟随）
- [x] **M3 指标体系（第 7–9 周）已完成**
  - 指标框架：声明式 schema（参数/plot 样式/回看）、窗口化计算（只算可见范围+上下文）
  - 31 个内置指标 5 大类：趋势 13（MA 系/Ichimoku/Supertrend/PSAR/枢轴）、震荡 9（RSI/Stoch/CCI/MFI/AO/UO/MACD）、波动、通道 4（BB/Keltner/Donchian/Envelopes）、成交量 4（OBV/VWAP/CVD/VOLMA）
  - 计算金标准用例验证通过（SMA/EMA/RSI/BOLL/MACD/Stoch）
  - 渲染：主图叠加（BB 填充带）+ 独立副图面板（histogram 零轴分色），图例展示叠加指标值
  - UI：指标面板（分类+搜索）、参数设置对话框、激活 chips、模板存/取 localStorage
- [x] **M4 画线工具（第 10–12 周）已完成**
  - 画线框架：世界坐标（time+price）存储与缩放平移无关；JSON 序列化导入导出
  - 12 种工具：趋势线/射线/水平线/垂直线/箭头/信息线（涨跌幅标签）/平行通道/矩形/椭圆/路径/文本/斐波那契回撤
  - 交互：工具状态机（落点/预览）、命中测试（线条/手柄/包围盒）、整体与单手柄拖拽、磁吸吸附 OHLC（实测精确吸附最高价）
  - 撤销/重做命令栈（拖拽为单步）、Delete/Ctrl+Z/Ctrl+Y/Esc/Enter 快捷键
  - UI：左侧工具工具栏、对象树（显隐/锁定/删除/清空）、导画线/入画线
- [x] **M5 实时数据（第 13 周）已完成**
  - Binance REST 分页历史（1000/页）+ K线 WS 订阅（指数退避重连，3 次失败降级 REST 3s 轮询）
  - LiveDataFeed 编排：IndexedDB 缓存优先渲染 → 历史 → WS 实时 → 左滑懒加载 → 缺口回补
  - App 双模式：实时（默认）/ 模拟（失败自动降级），符号切换、状态指示灯、重连
  - 实测：真实 BTCUSDT/ETHUSDT 1m 数据、懒加载 +1000 根视口零漂移、缓存落盘
- [x] **M6 平台功能（第 14–15 周）已完成**
  - 多图表布局 1/2/4/6/8（单元格独立符号/周期/类型）、跨图表十字光标+视口联动（syncBus 限频总线）
  - 自选股面板（搜索/增删/切换/localStorage）、价格警报（创建/触发/通知/持久化，实测触发）
  - 复盘模式（逐 K 线播放/步进）、截图导出 PNG、修复布局按钮不可达 bug
- [x] **M7 打磨与测试（第 16 周）已完成**
  - 单元测试：Vitest 44 例全过（指标金标准/聚合/变换/视口钳制/对数往返/画线撤销栈/序列化）
  - E2E：Playwright 冒烟 7 例全部通过（加载/类型切换/指标/画线/布局/复盘/主题，系统 Chrome 通道、串行执行 10.2s）
  - 主题：深浅切换（画布 + body + 全部 UI 面板，CSS 变量双主题）
  - 性能：10 万 K 线同屏 3–9ms、常规视图 <1ms、4 面板+4 指标 1–5ms
- [x] **TV-ALIGNMENT v2.0 + P1 六个批次已完成（2026-09-28 ~ 09-30；本条 2026-09-30 回填）**
  - TV 对齐（P0 八项）：快捷键全映射（`hooks/useTvShortcuts.ts`，Alt+A/W/N/R/L/P/S、Ctrl+Alt+H、Ctrl+P 等）／ 前往日期（`features/market/GoToDateDialog.tsx`）／ 收盘倒计时（`engine/countdown.ts`，51 条单测）／ 6 种图表类型补齐（CHART_TYPES 18 种）／ 2m·3m·45m·3H + 自定义间隔（`features/market/CustomIntervalDialog.tsx`、`IntervalInputDialog.tsx`、`registerTimeframe`）／ 斐波那契家族 6 变体（fib/fib-extension/fib-fan/fib-arc/fib-timezone/fib-auto）／ 画线克隆·多选·Shift 锁轴（`engine/drawing/DrawingLayer.ts`）／ 布局保存加载（`store/layoutStore.ts` + `features/layout/LayoutSaveMenu.tsx`）
  - P1：指标 33→63（P1-A 净增 30；Anchored VWAP 当时挂起 OPEN-DECISIONS，已由 P2-B 交付并关闭该条）；Pine 迁 `src/indicators/pine/`（12 模块，if/for/while 控制流 + 32 个 ta 函数）；警报 4 条件/指标值触发/编辑/声音（P1-C）；模拟交易 limit/stop/stop-limit 挂单（`features/trading/paperEngine.ts` + `orderTrigger.ts`，P1-D）；命令面板 Ctrl+P（P1-E）；Volume Profile 按 ADR-001 kline 近似交付（`engine/profile/volumeProfile.ts`，P1-F）
  - 门禁：`npm run typecheck` 0 错误；单测 544/544；E2E 47/47（详见 docs/SPEC-TV-ALIGNMENT.md / docs/SPEC-P1.md 变更记录）
- [x] **P2 收官批次已完成（2026-09-30；本条 v1.3 回填）**（docs/SPEC-P2.md，已入版本库）
  - P2-A Pine 绘图指令完整化（6056eb4 + 1e194fc）：bgcolor/barcolor 渲染接线（`computeExtra` 窗口旁路）+ plotshape/plotchar（7 shape × 3 location）+ alertcondition（警报面板「Pine 条件」分区）
  - P2-B 画线家族扩展（d77b8b7）：文字 4（便签/价格标签/锚定文本/箭头标记）／测量／几何 3（多边形/圆弧/曲线）／江恩 3（扇形/江恩线/江恩箱）／艾略特波浪／Anchored VWAP
  - P2-C 平台补全（5cd9f5e）：syncBus 三通道（品种/周期/画线同步）／单元格最大化（Alt+Enter、双击）／布局边缘拖拽调比／control_bar 五按钮／符号搜索键盘导航 + 收藏分组；App.tsx 650→237
  - P2-D Compare 叠加 + 画线水平线警报（23294a8）
  - 批次门禁：typecheck + 单测 830/830（P2-D 时点，其后增至 959）+ E2E 48/48 + build
- [x] **二期（PHASE-2）七批次已完成（2026-10-08 ~ 10-09；本条 v1.4 回填）**（docs/PHASE2-PLAN.md，三个决策点 D1/D2/D3 已裁决锁定）
  - 二期-A 数据面扩展（901d5fe）：外汇——新浪 `NewForexService` 直连 JSONP，日 K 行格式 `date,open,low,high,close` 经 USDCNH 全历史 3109 行双重校验实证定案；场内 ETF 零代码即可用（东财 suggest → 腾讯全链路，510300 端到端实测）；可转债不在东财 suggest 索引、净值基金无免费源——不做
  - 二期-B1 实时性（116400d）：轮询调度改造（决策核 `store/pollSchedule.ts` 纯函数）——盘中 3s、连续失败 ×2 退避封顶 60s、盘外/页面隐藏**零网络请求**（仅挂 30s 本地重估闹钟）；`useQuotePolling` 改 setTimeout 链式避免堆叠，LiveDataFeed 降级轮询与 compare 补 hidden 门控。B2（自建后端推送）依 D1 裁决不放二期
  - 二期-C 画线收尾（C1 1e15104 ／ C2 08b5ac4）：**画线工具 30 → 45**。C1 形态家族 9 种（ABCD／谐波 gartley·bat·butterfly·crab 带四腿比率校验／头肩顶底／三角收敛扩散）+ fib 通道·螺旋；C2 预测形态／圆形／价格注记／图标标记（D3 口径：SVG 矢量 8 种，`iconMarks.ts` 单一 path 源供 canvas Path2D 与选择器共用，非 emoji）+ Shift+空白 Marquee 框选多选。每新家族独立 math/render 模块
  - 二期-D Pine 扩展（b598611）：`switch`（subject 与条件双形态、臂体按语句解析）／`varip ≡ var`（向量化离线模型无实时回滚，语法层保留）／strategy 骨架（新 `pine/strategy.ts` StratSim：entry/close/exit 三调用、向量化逐 bar 结算、`strategy.position_size/netprofit/equity` 内置序列）／ta 扩充 `pivothigh`·`pivotlow`·`vwap`（UTC 日界重置）。完整回测维持 SPEC-TV-ALIGNMENT「不做」裁定，本批为最小骨架
  - 二期-E 警报增强（1155466）：entering/exiting channel 条件（穿越族语义、`threshold2`=上沿）／警报按品种分组／触发历史（新 `alerts/alertHistory.ts`，localStorage 独立键 100 条 FIFO）／通知去重聚合（`notifyPlan`：同警报 60s 去重、多触发合并单条，仅作用于通知层）
  - 二期-F 平台体验（e74b260）：依 D1「无后端」裁决收敛为移动端 chrome 断点适配（新 `hooks/useViewport.ts` `useNarrowViewport`，matchMedia ≤768px）——右侧面板改固定覆盖层、顶栏次要入口收起；**桌面宽户口径零像素变化**。快照分享落地页与云同步维持不做
  - 二期-G 工程与性能（d1b2e64）：Session Volume Profile（`volumeProfile.ts` 增 `mode: range|session` + `computeSessionProfiles`，Model 双缓存槽，`drawSessionVolumeProfile` 段末 bar 右对齐）／1M 根数据面探针（`million-bars.test.ts` 固化为回归预算：构建 364ms、万次二分 13.1ms、1500 根视口+VP 0.19ms；画布全管线 1M 压测需浏览器环境，登记边界）
  - 批次门禁：typecheck 0 错 + lint 0 错 0 警告 + 单测 79 文件 1288 例全过 + build（二期 D–G 四批按此四项收口）；E2E 全量复跑于 2026-10-09（56 例，见上条 v1.4 实测）

---

## 1. 技术选型（已确认）

| 决策项 | 选型 | 理由 |
|---|---|---|
| 前端框架 | React 18 + TypeScript | 生态最丰富，TradingView 自身前端亦用 React |
| 构建工具 | Vite | 冷启动快，HMR 友好 |
| 图表渲染 | **自研 Canvas 2D 引擎**（框架无关） | 只有自研才能完全掌控坐标换算、图层、画线交互，实现 1:1 |
| 状态管理 | Zustand（UI 层）+ 引擎内部订阅制（渲染态不进 React） | 高频行情更新不能触发 React 重渲染 |
| 数据源 | 交易所公开 API（REST 历史 + WebSocket 实时，默认对接 Binance，适配器模式可换源） | 免后端、实时性有保障 |
| 本地缓存 | IndexedDB | 历史 K 线持久化，减少重复请求 |
| 测试 | Vitest（单测）+ Playwright（E2E） | 指标数值、渲染快照、交互流程 |

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────┐
│  UI 层（React）：顶栏 / 工具栏 / 侧边面板 / 对话框      │  ← 低频交互
├─────────────────────────────────────────────────────┤
│  交互层：平移缩放 / 十字光标 / 画线手柄 / 磁吸 / 快捷键   │
├─────────────────────────────────────────────────────┤
│  渲染引擎（Canvas 2D，命令式直绘，不经过 React）         │
│    图层合成：K线 → 指标 → 画线 → 光标 → 浮层            │
│    坐标系统：time/price ↔ 像素（linear / log）          │
│    视口管理：可见裁剪 + LOD 聚合 + 离屏静态层            │
├─────────────────────────────────────────────────────┤
│  计算层：指标引擎（声明式 schema + 增量计算 + 缓存）      │
├─────────────────────────────────────────────────────┤
│  数据层：REST 分页 / WS 实时 / 周期合成 / IndexedDB      │
└─────────────────────────────────────────────────────┘
```

**核心原则：渲染循环与 React 解耦。** 行情推送 → rAF 合帧 → 引擎局部重绘；React 只负责界面 chrome 和低频状态。

---

## 3. 功能拆解（1:1 对照清单）

### 3.1 图表类型（Series Types）
- [x] 蜡烛图 Candles
- [x] 竹线图 OHLC Bars
- [x] 线形图 Line
- [x] 面积图 Area
- [x] 基线图 Baseline
- [x] 空心蜡烛 Hollow Candles
- [x] Heikin Ashi（平均K线）
- [x] Renko（砖形图）
- [x] Kagi（卡吉图）
- [x] Line Break（新价图）
- [x] Point & Figure（点数图）
- [x] Range（区间K线）
- [x] 柱状图 Columns / 高低图 High-low / 阶梯线 Step line / 带标记线形 Line with markers / HLC 面积 HLC area / 成交量蜡烛 Volume candles（P0-4 补齐，CHART_TYPES 合计 18 种）

### 3.2 时间周期（Timeframes）
- [x] 秒级：1s / 5s / 15s / 30s
- [x] 分钟级：1m ～ 59m 任意（档位表已含 2m / 3m / 45m，P0-5）
- [x] 小时级：1H / 2H / 3H / 4H / 6H / 8H / 12H（3H 为 P0-5 补齐）
- [x] 日 / 周 / 月（1D / 3D / 1W / 1M）；年线 1Y 未入默认档位
- [x] 自定义间隔 + 底层 1m 数据向上聚合合成（`registerTimeframe` + CustomIntervalDialog / IntervalInputDialog）

### 3.3 坐标与缩放
- [x] 价格轴：线性 / 对数切换
- [x] 自动缩放 / 手动缩放 / 百分比模式
- [x] 时间轴：拖拽平移、滚轮缩放、滚到边界懒加载历史
- [x] 分屏：主图 + N 个副图（各自独立价格轴）

### 3.4 指标体系
- [x] 指标框架：声明式 schema（inputs / styles / plots / overlays），主图叠加 & 副图两种模式
- [x] 内置指标（实际 64 个：P1-A 净增 30 至 63，P2-B 补 Anchored VWAP 至 64；OPEN-DECISIONS 该条已 RESOLVED）：
  - 趋势：SMA / EMA / WMA / DEMA / TEMA / HMA / VWMA / Ichimoku / Supertrend / Parabolic SAR / Alligator
  - 震荡：MACD / RSI / Stoch / Stoch RSI / CCI / Williams %R / MFI / Awesome Oscillator / Accelerator
  - 通道：Bollinger Bands / Keltner Channels / Donchian Channels / Envelopes
  - 波动：ATR / NATR / Bollinger Width / Standard Deviation
  - 量能：Volume / OBV / VWAP / Volume Profile / CVD / Anchored VWAP（P2-B 实装，锚点经画线锚定落点写入 params.anchorTime）
  - 其他：ADX/DMI / Aroon / Ultimate Oscillator / Know Sure Thing / Coppock / Pivot Points 等
- [x] 指标参数对话框 + 样式设置（颜色/线宽/填充）
- [x] 指标值 tooltip（悬停显示各指标当前值）
- [x] 指标模板：保存/加载整套指标组合
- [x] 自定义指标 DSL（Pine Script 子集：input / ta.xxx（32 个）/ plot / plotshape / plotchar / bgcolor / barcolor / alertcondition / if-for-while / 用户函数，解释执行；`security` 多周期引用按 SPEC-P2 §3 明确不做）

### 3.5 画线工具（Drawing Tools）
- [x] 线条：趋势线 / 射线 / 水平线 / 垂直线 / 箭头 / 信息线
- [x] 通道：平行通道
- [x] 斐波那契：回撤 / 扩展 / 扇形 / 弧线 / 时区 / Auto Fib（P0-6 补齐 6 变体）+ 通道 / 螺旋（二期-C1 1e15104，螺旋为 TV 简化口径，登记 OPEN-DECISIONS）
- [x] 百分比线（非 TV 原生工具，取中文行情软件经典八分法语义；默认三档 0/50/100 可编辑；2acf0c2 + ae28860）
- [x] 形态：XABCD 谐波 4 变体（比率校验）/ 头肩顶底 / ABCD / 三角收敛扩散（二期-C1 1e15104）
- [x] 几何：矩形 / 椭圆 / 路径（既有）+ 多边形 / 圆弧 / 曲线（P2-B d77b8b7）+ 圆形（二期-C2）
- [x] 文字：文本（既有）+ 便签 / 锚定文本 / 价格标签 / 箭头标记（P2-B）+ 价格注记（二期-C2）
- [x] 测量：Shift+点击浮层（bar 数 / 价差 / 百分比），Esc 取消（P2-B）
- [x] 图标与表情（二期-C2 按 D3 裁决口径交付：SVG 矢量图标标记 8 种，canvas Path2D 与选择器共用 path 数据源，非 emoji——P0 红线一致；口径登记 OPEN-DECISIONS）
- [x] 艾略特波浪 / 江恩扇形 / 江恩线 / 江恩箱（P2-B）+ 预测形态（二期-C2）
- [x] 交互能力：选中 / 拖拽移动 / 缩放手柄 / 顶点编辑 / 磁吸（弱磁吸/强磁吸 OHLC）/ 锁定 / 隐藏 / 克隆 / 删除（P0-7 补齐 Ctrl+拖动克隆、Ctrl+点击多选、Shift 锁轴、方向键微调）+ Shift+空白拖拽 Marquee 框选多选（二期-C2，绑定口径登记 OPEN-DECISIONS）
- [x] 对象树管理面板、撤销/重做命令栈、导入/导出（JSON）

### 3.6 平台功能
- [x] 自选股列表 + 全局品种搜索
- [x] 多图表布局：1 / 2 / 4 / 6 / 8 格（任意格数自定义未支持，P2-C 评估）
- [x] 图表间联动：十字光标同步、时间范围同步（既有）+ 品种 / 周期 / 画线同步（P2-C，syncBus 三 channel + sourceId 防环 + 30Hz 限频）
- [x] Compare 叠加对比：顶栏按钮叠加第二条价格序列（percent 同坐标系 / 独立订阅 + 30s 轮询 / 图例第二行 / 左缘翻页；仅单图布局、最近 500 根，P2-D）
- [x] 价格警报：触发条件（价格 4 条件 greater/less/crossUp/crossDown + 指标值触发 + Pine alertcondition + 画线水平线触及（P2-D）），浏览器通知 + 声音 + 编辑 / 频率 / 过期（P1-C）
- [x] 复盘模式（Bar Replay）：逐K线回放
- [x] 图表模板 / 主题（深色 / 浅色）保存到 localStorage
- [x] 截图导出（PNG）
- [x] 完整快捷键体系（TradingView 默认映射，`hooks/useTvShortcuts.ts`）
- [x] 详情面板（OHLCV、涨跌幅、指标值：图例区展示，悬停跟随光标）

---

## 4. 关键技术方案

### 4.1 自研渲染引擎
- Canvas 2D + `devicePixelRatio` 高清适配
- **视口裁剪**：只渲染可见 K 线；可见数量超阈值时按像素做 LOD 聚合（10 万根 K 线仍 60fps）
- **离屏分层**：静态层（K 线/指标）与动态层（光标/拖拽中的画线）分离，按需重绘
- `requestAnimationFrame` 合帧调度，合并同一帧内的多次重绘请求

### 4.2 数据管线
- REST：`GET /klines` 分页拉取（每页 1000 根），向左滚动触底续拉
- WebSocket：订阅 kline 频道实时推送，合并进当前周期缓存
- **周期合成器**：以 1m 底层数据向上聚合任意高层周期，内存环形缓冲
- IndexedDB 缓存历史数据；断线自动重连 + gap 检测回补

### 4.3 指标引擎
- 声明式指标 schema，纯函数计算，输出 `number[]` 系列
- 增量计算：新 K 线到达只重算尾部区间，全量重算走 Web Worker 避免阻塞
- 数值精度：float64 + 与 TradingView 金标准对齐（误差 < 0.01%）

### 4.4 画线系统
- 统一数据模型：`{ type, points: [{time, price}], style, options }`，**世界坐标存储**（缩放平移不影响画线位置）
- 每种工具注册 anchor（手柄）定义与命中测试规则
- 序列化为 JSON，持久化到 localStorage / 可导出

### 4.5 状态管理
- Zustand：UI 状态、布局、设置、模板
- 引擎内部状态用普通 class + 订阅，**不触发 React 更新**

---

## 5. 里程碑计划（单人全职约 16 周；2～3 人团队可压缩至 8～10 周）

| 阶段 | 周期 | 交付物 | 验收标准 |
|---|---|---|---|
| **M0 脚手架 + 引擎原型** | 第 1 周 | 项目骨架、目录规范、引擎最小闭环（画布/DPR/坐标/rAF） | 能在画布上画出时间-价格网格并平移缩放 |
| **M1 核心引擎** | 第 2–4 周 | 数据层、坐标系统、蜡烛/线/面积图、十字光标、价格轴/时间轴、视口裁剪 | 静态数据全交互浏览，10 万根 K 线流畅 |
| **M2 图表类型 + 周期** | 第 5–6 周 | 全周期、全图表类型、Heikin Ashi、对数坐标、分屏副图 | 对照 3.1 / 3.2 / 3.3 清单逐项通过 |
| **M3 指标引擎** | 第 7–9 周 | 指标框架、~60 内置指标、叠加/副图、设置对话框、模板 | 指标数值与 TradingView 误差 < 0.01% |
| **M4 画线工具** | 第 10–12 周 | 全套工具、手柄编辑、磁吸、对象树、撤销重做、导入导出 | 对照 3.5 清单逐项通过 |
| **M5 实时数据** | 第 13 周 | WS 接入、实时K线跳动、历史懒加载、IndexedDB 缓存、断线重连 | 端到端延迟 < 1s，弱网自动恢复 |
| **M6 平台功能** | 第 14–15 周 | 自选股、多布局、图表联动、警报、复盘、截图导出、快捷键 | 平台全流程走通 |
| **M7 打磨收尾** | 第 16 周 | 性能优化、主题、兼容性、E2E 测试、Bug 收敛 | 拖拽/缩放稳定 60fps，主流浏览器通过 |

---

## 6. 技术难点与对策

| 难点 | 对策 |
|---|---|
| 10 万+ K 线渲染性能 | 视口裁剪 + LOD 聚合 + 离屏静态层，只重绘脏区域 |
| WS 高频推送与重绘平衡 | rAF 合帧（每帧最多一次重绘）+ 脏矩形局部更新 |
| 任意周期数据合成 | 统一 1m 底层聚合器，周期定义参数化 |
| 画线交互复杂（缩放/旋转/磁吸/命中） | 世界坐标存储 + 每工具注册 anchor 与命中规则 + 命令栈 |
| 跨图表联动 | 事件总线 + 共享 timeRange 状态 |
| 指标数值与 TV 对齐 | 金标准用例测试（固定输入输出比对） |
| TradingView 细节极多 | 维护 1:1 对照清单（本文档第 3 章），逐项验收 |

---

## 7. 目录结构建议

```
tradingPA/
  src/
    engine/            # 渲染引擎（框架无关，可独立发布）
      canvas/          #  画布管理 / 图层 / DPR / 离屏缓冲
      scale/           #  坐标换算（time/price ↔ px）
      series/          #  各图表类型渲染器
      indicators-view/ #  指标渲染
      drawing/         #  画线渲染 + 手柄交互
      crosshair/       #  十字光标 + tooltip
      viewport/        #  视口 / 缩放 / 平移
    data/
      feed/            #  REST / WS 适配器（Binance 等）
      aggregate/       #  K 线周期合成
      cache/           #  IndexedDB
    indicators/
      core/            #  指标引擎
      builtin/         #  内置指标定义
    store/             #  Zustand（UI / 布局 / 设置）
    components/        #  React UI chrome
    features/          #  平台功能（watchlist/alerts/replay/layout）
    hooks/
    types/
    styles/
  tests/
    unit/              #  指标数值金标准测试
    e2e/               #  Playwright 交互流程
```

---

## 8. 风险与对策

1. **1:1 的细节无限性** — TradingView 交互细节数百处，需以第 3 章清单为验收基线，允许非关键体验细节（动画曲线、tooltip 排布）差异化，关键交互（坐标换算、K线绘制、画线行为）必须一致。
2. **自研引擎工作量** — 以 M1 为架构验证点：若 10 万 K 线 + 全交互达标，后续阶段均为增量扩展，风险可控。
3. **数据源稳定性** — 交易所 WS 可能限频/断流；适配器模式 + 重连退避 + gap 回补 + 本地缓存兜底。
4. **浏览器兼容** — Canvas 2D API 兼容性良好；重点验证 Safari 的 DPR 与离屏 canvas 行为。

---

## 9. 验收总标准

- 第 3 章功能对照清单 100% 覆盖（逐项打勾验收）
- 10 万根 K 线拖动/缩放稳定 60fps（Chrome Performance 面板验证）
- 指标数值与 TradingView 对比误差 < 0.01%
- 实时行情端到端延迟 < 1s
- Chrome / Edge / Firefox / Safari 最新版全通过
