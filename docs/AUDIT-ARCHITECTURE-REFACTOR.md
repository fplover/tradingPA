# tradingPA 技术改造点与架构风险评估（Phase 1，只读分析）

> 作者：首席架构师 高见远 ｜ 日期：2026-09-28 ｜ 范围：M0-M7 收尾期，「TV 一手规格对齐」下一步前的技术改造决策输入
> 方法：通读核心源码（engine/ 全量、store/ 全量、features/ 关键模块、tests/ 全量）+ 联网调研 TradingView charting_library / lightweight-charts 架构（官方 API 文档 + DeepWiki 架构分析）。本文只读分析，未改任何代码。

---

## 0. 总体判断

引擎底座（Viewport / PriceScale / BarSeries / CanvasManager / drawXxx 纯函数族）分层是健康的，这也是 10 万 K 线 3-9ms/帧的根基。真正的问题集中在两点：

1. **ChartRenderer.ts 1594 行**——交互控制、状态持有、绘制编排、画线代理、交易代理五类职责焊死在一个类里，且无集成测试兜底。它是后续所有 TV 对齐交互工作的修改面，也是最大回归风险源。
2. **测试网只兜数值、不兜视觉**——TV 对齐是像素级工作，当前 44 单测 + 7 E2E 里没有一层能防"改完刻度/图例/光标后发现视觉回归"。

结论：**先建对齐安全网（视觉回归 + drawXxx ctx-mock 单测），再小步拆分 ChartRenderer，同步做 syncBus 时间空间联动与 computeWindow 脏缓存**。Pine 与模拟交易两个计划外模块不做主动重构，只做止损性处理。

---

## 1. 技术改造评估总表

| # | 改造点 | 涉及文件 | 当前问题 | 改造方案 | 风险等级 | 与 TV 对齐的关联 | 建议顺序 |
|---|--------|----------|----------|----------|----------|------------------|----------|
| 1 | ChartRenderer 1594 行拆分 | src/engine/renderer/ChartRenderer.ts（1594 行）；影响 src/components/Chart.tsx、src/App.tsx、src/features/rightbar/RightSide.tsx、各对话框 | 单文件超规范 5 倍；输入处理约 455 行（L745-1200）、draw() 约 246 行（L1255-1501）、画线 API 委托约 170 行、交易侵入约 100 行、10+ 个 setXxxCallback；交互态（dragging/priceDragging/dragDrawing/tradeDrag/placing）与渲染态（panes/chartType/legendOptions）同住一类；studyRects 由 drawLegendBlock 回写、输入层读取，存在渲染→输入反向耦合 | 保留 ChartRenderer 为门面类（公开 API 签名不变，Chart.tsx 近零改动），按职责切出 8 个模块，切分边界见 §2.1 映射表；先抽无状态的（SyncBridge/autoscale/hitTest/cursor），再抽输入手势状态机，最后拆 draw 编排 | 高 | 高：后续所有交互对齐（TV 指针语义、触控板手势、画线磁吸、面板操作）的修改面从"整个 1594 行类"收敛到具体手势模块 | 3（须在 #2 测试网就位后动工，分 4 个可独立验证提交） |
| 2 | 对齐安全网：视觉回归 + 渲染单测 | tests/e2e/（现有 7 spec）、src/engine/renderer/drawSeries.ts、drawAxes.ts、drawCrosshair.ts、drawDrawings.ts、drawTrading.ts | 44 个 Vitest 全在数值/逻辑层；drawXxx 七个纯函数无任何单测（无 ctx mock）；Playwright 未用 toHaveScreenshot 截图 diff；ChartRenderer 输入→状态迁移无集成测试；Pine 519 行编译器无编译用例 | ① Playwright 关键视图截图 diff（主题/图表类型/指标/画线/十字光标/图例/时间轴各 1-2 张黄金图，固定 DPR 与动画）；② 轻量 canvas 2d mock（记录 path/fillText/stroke 调用序列）对 drawXxx 做结构断言；③ jsdom + 合成 PointerEvent 的 ChartRenderer 输入集成测试（平移/缩放/画线放置/命中）；④ Pine tokenizer/parser/eval 黄金用例 | 低（新增测试；截图 flaky 需治理：锁 DPR、禁动画、等字体） | 极高：这是所有像素级对齐工作的前置安全网，没有它不敢改渲染代码 | 1（最高优先，独立于其他改造） |
| 3 | syncBus 事件模型与限频改造 | src/store/syncBus.ts（23 行）、src/components/Chart.tsx（L316-336）、src/engine/renderer/ChartRenderer.ts（L537-562、L1461-1477）、src/data/BarSeries.ts（fractionalIndexAt L75-91 已存在未用） | ① 回环防护靠隐式不变式（setSyncViewport 不触发 viewportCommitCb），无事件来源标记，未来在联动 setter 里加提交逻辑即回环；② 限频写在 Chart.tsx 闭包里（32ms 硬编码），每个 Chart 实例各写一遍；③ crosshair 参考线用 indexOfTime 精确匹配（L1463），跨周期图表时间戳不落在 bar 上就画不出线；④ 视口联动广播 {first, spacing} 是索引空间而非时间空间，跨周期/跨品种联动会错位；⑤ handler 同步执行无 try/catch，一个抛错中断其余订阅者 | ① syncBus 事件加 sourceId，接收方忽略自己发出的事件（显式防环）；② 限频上移进 syncBus（统一 rAF 合帧/30Hz，一处实现）；③ crosshair 参考线与接收侧改用 BarSeries.fractionalIndexAt 插值定位（函数已存在，直接调用）；④ 视口联动载荷从 {first, spacing} 升级为 {fromTime, toTime} 时间范围，各端按自己的 series 换算 first/spacing（TV 即时间轴同步语义） | 低（syncBus 23 行，调用点集中在 Chart.tsx 与 L537-562/L1461-1477 两处） | 高：直接对齐 TV 跨图表时间轴同步语义，是多图表布局对齐的核心机制 | 4（与 #1 第 1 步可并行；#1 拆出 SyncBridge 后本项更顺） |
| 4 | 指标计算脏缓存 | src/indicators/core/instance.ts（computeWindow L76-81）、src/engine/renderer/drawIndicator.ts（indicatorRange L128-148、indicatorValuesAt L151-165）、src/engine/renderer/ChartRenderer.ts（autoscalePrice/autoscaleIndicators/legend 每帧调 computeWindow） | computeWindow 每次调用都 bars.slice + 全量 compute，无任何缓存：每帧对每个可见指标重算（平移/缩放时数据未变也重算）；图例每帧再多算一次（indicatorValuesAt）；autoscale 每帧再算一次（indicatorRange）。当前 3-9ms 预算掩盖了浪费 | computeWindow 增加缓存键（bars 引用 + 最后 bar time + from/to + params 版本），命中直接返回 outputs；indicatorRange/indicatorValuesAt 复用同一次 computeWindow 结果（同帧内按 (uid, from, to) 合并） | 中（触碰指标数值正确性；现有金标准单测可兜底回归） | 中：TV 的 DataLayer 管理数据生命周期，脏缓存是其基础设施；释放的每帧预算为"更多同屏指标 + 实时/回放同开"留余量 | 5 |
| 5 | 画线剪刀图标字符化 | src/engine/renderer/ChartRenderer.ts（drawScissors L1581-1594） | 用 Unicode 字符 '✀'（U+2700）当功能图标绘制，各平台字体回退不同导致渲染不一致，正是团队 P0「禁止 emoji/字符作功能图标」要防的问题 | 改为 SVG path 内联绘制到 canvas（或离屏 canvas 预渲染一次），与前端 lucide-react 图标体系统一 | 低 | 低（视觉正确性，非新特性） | 6（顺手修） |
| 6 | Pine 编译器止损（不重构） | src/indicators/pine/compile.ts（519 行）、src/store/pineStore.ts（L62-67 模块级副作用） | ① 519 行单文件（tokenizer+parser+compiler+eval 四段），evalExpr switch 30+ case，扩展函数要改 ALLOWED_FNS、evalExpr、series.ts 三处；② 运行期 compute 抛错会穿到 rAF 循环打断整帧；③ pineStore 顶层 import 即编译+全局注册表写入，不利测试隔离；④ 常量/序列参数语义（numArg 取序列末值当周期）与 TV Pine 不同且无声明 | 不做主动重构（计划外模块，对齐期不投入）。只做止损：run() 编译成功后立即用空 bars dry-run compute 一次，把运行期错误前置到编译期错误列表；在编辑器面板明示"Pine v5 子集"边界 | 低 | 无（计划外模块；dry-run 只是防止它中断主渲染循环） | 7 |
| 7 | 模拟交易渲染器侵入剥离 | src/engine/renderer/ChartRenderer.ts（tradeVisual/tradeDrag/tradeCbs/hitTestTrading/updateTradeDrag 约 100 行 + draw() 内 drawTrading L1387-1395）、src/features/trading/*、src/engine/renderer/drawTrading.ts | 交易交互逻辑寄生在图表渲染器核心里，是 ChartRenderer 膨胀第二大来源；TV 的对标结构里交易是独立 Broker/Trading Platform 模块，图表侧只有下单浮窗与持仓线渲染；挂单触发/TP-SL 同 bar 双触等简化语义无声明 | 随 #1 拆出 TradeGesture 交互模块（交互侧收敛）；绘制保留 drawTrading 纯函数（已框架无关）。逻辑层 paperEngine 不动（纯逻辑、有单测、健康）。是否保留整个模块由产品决策，架构上至少不再侵入核心 | 中（触碰回放下单主链路，需 E2E 护航） | 低（计划外模块；但剥离直接缩小 #1 的回归面约 15%） | 8（与 #1 第 3 步同批做） |
| 8 | 交互层/渲染层解耦（状态评估结论） | src/engine/renderer/ChartRenderer.ts 全类 | 坐标/数据类已解耦（Viewport/PriceScale/BarSeries 独立且有单测）；但 ChartRenderer 把交互控制（事件→改 viewport/priceScale/drawingLayer→invalidate）、状态持有、绘制编排焊死；无显式 Model 层（TV lightweight-charts 四层中的 Model 层缺位） | 见 #1 拆分：ChartState 承担 model、InputController+Gesture 承担 GUI 交互、RenderPipeline 承担渲染编排，形成显式三层 | 高（即 #1 的风险） | 高（解耦是 #1 的目的本身） | 随 #1 |

---

## 2. 重点改造点详述

### 2.1 ChartRenderer 拆分：具体切分边界

原则：门面类保留、公开 API 签名不变（Chart.tsx / App.tsx / RightSide / 各对话框的调用点零改动或近零改动）；按职责而非按事件切分；每个新文件 ≤300 行、单一职责；一次拆一个模块、一个可验证提交。

当前 1594 行的职责分布（实测行号）：

| 区块 | 行号范围 | 约行数 | 内容 |
|------|----------|--------|------|
| 字段声明（含画线/交易/联动/拖拽状态） | L55-149 | 95 | 五类职责的字段混住 |
| 构造与 createPane | L151-169 | 19 | 装配 |
| 公开配置 setter | L171-294 | 124 | 15+ 个 setXxx 薄封装 |
| 指标管理 | L296-358 | 63 | pane 数组操作 |
| applyData/materialize（图表类型变换） | L360-401 | 42 | 数据变换 |
| rAF 循环 | L403-436 | 34 | 生命周期 |
| 回放/选线/截图/视口 API | L438-572 | 135 | 混合关注点 |
| 画线 API + hitDrawings | L574-743 | 170 | DrawingLayer 委托 + 命中 |
| **输入处理（bind/onXxx/hover/拖拽）** | **L745-1200** | **456** | **最大区块** |
| **draw() 帧编排** | **L1255-1501** | **247** | **第二大区块** |
| autoscale/drawPriceSeries | L1504-1578 | 75 | 价格域自适应 |
| drawScissors | L1581-1594 | 14 | 工具函数 |

目标结构与切分边界（全部留在 `src/engine/` 内，保持框架无关，React 仍只负责挂载）：

```
src/engine/
  chart/
    ChartController.ts    门面：公开 API 全量委托，只装配与转发，不写业务逻辑   ~250 行
    ChartState.ts         图表级状态：PaneState 模型、panes、chartType/logScale/
                          autoScaleOn/percentOn/gridVisible/hideStudies/drawingsHidden/
                          drawingsLocked/legendOptions、selectedPane、layout()      ~180 行
  input/
    InputController.ts    事件绑定/解绑 + 指针事件路由（按命中区分派到各手势）     ~160 行
    PanZoomGesture.ts     拖拽平移 / 价格轴拖拽 / 面板分隔条缩放 状态机            ~150 行
    DrawingGesture.ts     画线工具放置 / 预览 / 整体与单手柄拖拽 状态机            ~160 行
    TradeGesture.ts       交易线（挂单/持仓/TP-SL）拖拽状态机                     ~110 行
    hitTest.ts            hitDrawings + hitPaneButtons（从 ChartRenderer 迁出）    ~80 行
    cursor.ts             光标决策纯函数（updateHoverCursor 逻辑）                ~50 行
  render/
    RenderPipeline.ts     draw() 帧编排：layout→per-pane→axes→crosshair→legend→联动线 ~230 行
    autoscale.ts          autoscalePrice / autoscaleIndicators / ensurePriceScaleReady ~100 行
  sync/
    SyncBridge.ts         跨图表联动边界：setSyncCrosshair/setSyncViewport/
                          getViewport/onViewportCommit/onCrosshairTime             ~90 行
```

迁移映射（旧位置 → 新模块）：

| 新模块 | 迁入来源（ChartRenderer.ts 行号） | 依赖方向 |
|--------|----------------------------------|----------|
| ChartState | L27-43（PaneState）、L58-93（配置字段）、L167-169（createPane）、L288-294（resetPriceScale）、L1204-1214（layout） | 被所有人依赖，不依赖任何人 |
| SyncBridge | L121-129（联动字段/cb）、L494-497、L537-562、L1461-1477（参考线绘制） | 依赖 Viewport；持有 sourceId（#3） |
| autoscale.ts | L1216-1232（ensurePriceScaleReady）、L1504-1541（autoscalePrice/Indicators） | 依赖 ChartState + drawIndicator |
| hitTest.ts | L702-725（hitDrawings/hitPaneButtons） | 依赖 DrawingLayer + drawDrawings + drawTrading |
| cursor.ts | L952-963（updateHoverCursor） | 纯函数，无依赖 |
| PanZoomGesture | L787-937 中 dragging/priceDragging/paneResize 分支、L1067-1091 的 up 清理 | 持有 Viewport + ChartState 引用 |
| DrawingGesture | L825-828、L890-907、L938-939、L966-984、L727-743 | 持有 DrawingLayer + ChartState 引用 |
| TradeGesture | L852-879、L940-941、L1035-1065 | 持有 tradeVisual + tradeCbs |
| InputController | L745-1200 的 bind/unbind + onPointerDown/Move/Up/Leave/Wheel/DoubleClick/ContextMenu 路由骨架 | 组合上述手势；只做路由不写分支逻辑 |
| RenderPipeline | L1255-1501（draw） | 依赖 ChartState + 全部 drawXxx 纯函数 |
| ChartController | 类骨架 + 全部公开方法改为委托 | 组合上述全部 |

拆分提交序列（每步可独立验证：typecheck + 单测 + 视觉回归截图不变）：

1. 抽 SyncBridge + autoscale（无交互状态，最安全）
2. 抽 hitTest + cursor（纯函数化）
3. 抽三个手势状态机 + InputController（改造核心，须有 #2 的集成测试兜底）
4. 抽 ChartState + RenderPipeline，ChartRenderer 收成纯门面（纯搬迁，行为不变）

不做的事（out-of-scope，防镀金）：不改公开 API 签名；不引入双 canvas 分层（预算内无必要，见 §2.5）；不重写 Viewport/PriceScale（健康且有单测）；不把 Chart.tsx 的 React 接线逻辑挪进引擎。

### 2.2 交互层与渲染层解耦现状评估

已解耦（健康，勿动）：
- Viewport（平移/锚点缩放/边界钳制/复盘边缘）：独立纯逻辑，7 个单测覆盖钳制与锚点
- PriceScale（线性/对数换算、刻度生成）：独立，往返测试在
- BarSeries（增量/前插/二分/小数 index）：独立，5 个单测在
- CanvasManager（DPR/Resize/beginFrame）：独立
- 渲染原语 drawSeries/drawAxes/drawCrosshair/drawIndicator/drawDrawings/drawTrading/seriesRenderers：全部是 (ctx, data, viewport, priceScale, geo) 纯函数，view/renderer 分离与 TV lightweight-charts 同构

未解耦（问题）：
- ChartRenderer 的 onPointerDown/Move/Up/Wheel 直接改 `this.viewport` / `pane.priceScale` / `this.drawingLayer` / `this.tradeDrag` 并调 invalidate：交互即渲染调度，二者无边界
- 交互态与渲染态同住一类（见 §2.1 字段行）
- 命中区数据流反向：studyRects 由 drawLegendBlock 在 draw() 内回写，输入层 onPointerMove/Up 读取——渲染产生输入所需状态，隐式双向依赖
- 光标决策（updateHoverCursor）与事件处理同文件，每 pointermove 直接写 canvas.style.cursor（有 dirty check，可接受但位置错）

对标 TV lightweight-charts 四层（Public API facade / GUI widget 树 / Model：ChartModel+DataLayer / Rendering：view+renderer+双 canvas+invalidation mask）：

| TV 层 | tradingPA 对应 | 差距 |
|-------|----------------|------|
| Public API facade | Chart.tsx props + ChartRenderer 60+ 公开成员 | 大体对应，但方法面宽且无分组（配置/数据/画线/指标/联动/交易混排） |
| GUI Layer（ChartWidget/PaneWidget/mouse-event-handler） | ChartRenderer（controller 与 widget 二合一） | 缺 widget 层级；输入直接改 viewport/priceScale |
| Model Layer（ChartModel/DataLayer） | Viewport+PriceScale+BarSeries 散落 + PaneState/联动/回放态寄居 ChartRenderer | 无统一 model 层 |
| Rendering（view/renderer + 双 canvas + 四级 invalidation） | drawXxx 纯函数 + 单 canvas + boolean dirty | view/renderer 已同构；双 canvas 与 None/Cursor/Light/Full 分级 invalidation 未做（预算内不必须） |
| DataLayer conflation（spacing<0.5px 合并数据点） | drawSeries 线形 LOD | 蜡烛模式 spacing<4 的 LOD 策略需对照 TV 复核 |

结论：解耦是半成品——底层零件健康，但 ChartRenderer 一个类把 TV 三个层的职责焊死。每次新增 TV 交互都要在这一个文件里改，回归面=全类。这是拆分的第一动因。

### 2.3 syncBus 限频与事件模型评估

现状（23 行，两通道：crosshair(time) / viewport({first,spacing})）：
- crosshair 限频在 Chart.tsx L323-328（每 Chart 实例闭包变量 lastEmit，32ms 硬编码）
- viewport 走 onViewportCommit（仅 pointerup/wheel 结束发，天然低频，无限频）
- 回环防护：靠 setSyncViewport/setSyncCrosshair 不触发 commit 回调这一隐式不变式
- handler 同步 for 循环分发，无 try/catch、无队列

问题清单（按对齐影响排序）：
1. **视口联动是索引空间而非时间空间**：广播 {first, spacing}，不同周期/品种的图表直接套用会错位。TV 语义是时间轴同步（可视时间范围一致）。这是多图表布局对齐 TV 的核心差距。改造：载荷升级为 {fromTime, toTime}，接收端用自己的 series 换算（BarSeries.fractionalIndexAt 已就位）。
2. **crosshair 参考线精确匹配**：L1463 用 indexOfTime，时间戳不落在 bar 上即无参考线。改用 fractionalIndexAt 插值，一行级改动，直接收益跨周期联动。
3. **回环防护隐式**：加 sourceId，接收方忽略自发事件。
4. **限频分散在 React 层**：上移进 syncBus，统一 30Hz rAF 合帧；同时给 viewport 通道也加（后续若支持拖拽中实时广播）。
5. handler 抛错隔离：for 循环包 try/catch，单订阅者异常不中断其余。

判断：当前实现支撑 M6 已交付的"同周期 mock 数据 4 面板联动"够用；支撑后续对齐（跨周期联动、触控、事件溯源）不够，但缺口都是小改动，总计预估 1 个提交内完成。

### 2.4 Pine 编译器架构健康度（计划外模块）

优点（值得保留的决策）：
- 编译成标准 IndicatorDef 复用副图/图例/设置对话框/模板主管线——正确的复用，没有另起炉灶
- 编译期校验（ALLOWED_FNS + validate + 行号错误）把错误前置
- 常量以广播序列实现（toSeries(v,n)），与系列运算统一

问题（按危险度排序）：
1. **运行期 compute 抛错穿到 rAF 循环**：evalExpr 的 throw（如未定义标识符的边角、除零路径）会从 def.compute → computeWindow → drawIndicator → draw() 打断整帧绘制，且每帧重试。止损方案：run() 成功后 dry-run compute 一次（空 bars 或小样本），错误前置到编译期错误列表。低成本的沉默逻辑错误防线。
2. **519 行单文件四段合体**（tokenizer/parser/compile/eval），evalExpr switch 30+ case；扩展一个 ta.* 函数要改 ALLOWED_FNS、evalExpr、series.ts 三处。属结构债，非缺陷；对齐期不投入。
3. **参数语义与 TV Pine 有差异且无声明**：numArg 取序列末值当周期常量（`ta.sma(close, someSeriesVar)` 会静默取末值，TV 是逐 bar 生效）。编辑器需明示"Pine v5 子集"边界，防止用户写静默出错。
4. **pineStore 模块级副作用**（L62-67：import 即编译+全局注册表写入）：vitest 多文件共享注册表，测试隔离受影响；localStorage 损坏时静默忽略可接受。
5. plot 语句行级解析（正则+字符串扫描），多行 plot 调用解析失败——子集边界，声明即可。

结论：健康度中等偏上（复用主管线是正确决策），不做主动重构。只做 #6 的 dry-run 止损 + 编辑器边界声明。

### 2.5 模拟交易架构健康度（计划外模块）

优点：
- paperEngine 329 行纯逻辑、无框架依赖、有单测（订单/挂单/持仓/TP-SL/报告）
- tradeStore 用 version 计数触发 React，规避可变对象直接进 state 的问题

问题：
1. **架构位置错误（核心问题）**：ChartRenderer 内核被交易侵入约 100 行（tradeVisual/tradeDrag/tradeCbs/hitTestTrading/updateTradeDrag）+ draw() 内 drawTrading 调用。TV 对标结构里，交易是独立 Broker 模块，图表侧只有下单浮窗与持仓线。这是 ChartRenderer 膨胀第二大来源。处置：随 #1 拆出 TradeGesture；drawTrading 纯函数保留。
2. **拖拽改价路径的 React 放大**：pointermove → onOrderMove → store version+1 → TradePanel 全树重渲染。可优化为手势内只更新 renderer 内部状态、commit 时同步 store（TradeGesture 抽出后自然可做）。
3. **简化语义无声明**：limit 单触价即成交（不等回补）、TP/SL 同 bar 双触按代码顺序取 TP。作为模拟交易可接受，需在面板明示。
4. entries/exits 每根回放 bar O(n) 重建（slice 200）——量小无感，记录备查。

结论：逻辑层健康，架构位置错误。不做逻辑重构，做侵入剥离（#7）。模块去留由产品决策；从 TV 1:1 目标看，它是净偏离项。

### 2.6 性能预算余量评估

现状口径（DEVELOPMENT_PLAN M1/M7 实测）：10 万 K 线同屏（spacing 0.00466）3-9ms/帧；常规视图 <1ms；4 面板 + 4 指标 1-5ms。rAF 预算 16.7ms，余量约 50%。

每帧热点（按实测代码路径）：
1. **computeWindow 无缓存**（instance.ts L76-81）：每帧每指标 slice + 全量重算；autoscale（indicatorRange）、legend（indicatorValuesAt）、drawIndicator 同帧对同窗口重复计算 2-3 次。这是最大的隐性浪费，也是 #4 的靶子。
2. autoscalePrice：每帧 O(visible bars) 扫描 low/high，叠加指标参与域计算。
3. updateCrosshair（每 pointermove）：hitDrawings + hitTestTrading + legend computeWindow。拖拽平移时每帧一次。
4. 单 canvas 全量重绘：dirty flag + rAF 合帧避免空转；十字光标移动也触发全帧（TV 的 Cursor 级只重绘 top canvas）。预算内不必须改。
5. 已就位的优化：蜡烛 LOD（spacing<4 像素列聚合）、raw() 零拷贝、单 path 描边。

结论：**有余量，但"每帧全量重算指标 + 同帧重复计算"是明确浪费**。#4 脏缓存落地后，同屏指标数与实时+回放同开的对齐特性才有充足预算。双 canvas 分层与分级 invalidation 列为"预算吃紧再启用"的储备项，本期不做。

### 2.7 测试体系覆盖能力评估

现状：Vitest 44 例（engine/viewport/PriceScale/BarSeries、data、indicators 金标准、drawing 撤销栈与序列化、paperEngine、math）+ Playwright 7 E2E（smoke/drawing/interactions/pine/settings/watchlist）。

覆盖矩阵：

| 层 | 数值/逻辑 | 视觉/渲染 | 集成/交互 |
|----|-----------|-----------|-----------|
| engine 坐标（Viewport/PriceScale/BarSeries） | 强（12 例） | 无 | 无 |
| 渲染原语 drawXxx（7 个纯函数） | 无 | 无 | 无 |
| ChartRenderer（输入→状态→帧） | 无 | 无 | 无（仅 E2E 间接） |
| 指标 | 强（金标准） | 无 | E2E 1 例 |
| 画线 | 中（撤销栈/序列化） | 无 | E2E 1 例 |
| Pine 编译器 | 无（519 行零单测） | 无 | E2E 1 例 |
| syncBus | 无 | 无 | 无 |
| 模拟交易 | 强（paperEngine） | 无 | 无 |

缺口与对策（即 #2）：
1. **无视觉回归**（最高优先）：TV 对齐=像素级工作。Playwright toHaveScreenshot 黄金图（固定 DPR=1、禁 CSS 动画、等待 webfont 就绪），覆盖：深浅主题、6 类图表类型、叠加/副图指标、画线选中态、十字光标+图例、时间轴刻度、4 面板布局。flaky 治理：只对 canvas 元素截图、容忍度阈值从 0 起逐案校准。
2. **drawXxx 无 ctx-mock 单测**：轻量 mock 记录 beginPath/moveTo/lineTo/fillText/stroke/fill 序列，断言轴刻度数量与位置、图例字段、蜡烛路径点数。把"像素级对齐"变成可断言的结构。
3. **ChartRenderer 无输入集成测试**：jsdom + 合成 PointerEvent/WheelEvent（canvas 2d context 需 stub），断言 pointerdown→dragging→视口 first 变化、画线三点放置后 DrawingLayer 状态。这是 #1 拆分的兜底。
4. **Pine 零单测**：黄金脚本 + 期望输出数组（含错误行号用例）。
5. **syncBus 零测试**：防环、限频、unsubscribe。

结论：**对"继续 TV 对齐"支撑不足**——当前测试网兜得住数值，兜不住视觉，而对齐工作 80% 的产出是视觉。测试网是对齐期的第一优先级基础设施。

---

## 3. 对齐友好度判断

先做（有直接对齐收益）：
1. **#2 视觉回归 + drawXxx ctx-mock 单测 + ChartRenderer 输入集成测试**——所有像素级对齐的前置安全网；没有它，任何渲染改动都是盲飞
2. **#3 syncBus 时间空间联动 + sourceId + 插值定位**——直接对齐 TV 跨图表时间轴同步；改动小、调用点集中
3. **#1 ChartRenderer 拆分（测试护航后）**——把后续每次交互对齐的回归面从 1594 行类收敛到具体模块
4. **#4 computeWindow 脏缓存**——释放每帧预算；数值金标准可兜底

可延后（纯重构，对齐无直接收益）：
- ChartRenderer 门面化收尾（在手势抽出后收益递减；不为假设的未来扩展性预付）
- 双 canvas 分层 + 四级 invalidation（3-9ms 预算下的储备项）
- Viewport 时间空间映射重构（数据量未到，先做 #3 的载荷升级即可）

建议不动（对齐期零投入）：
- **Pine 编译器结构重构**（#6 只做 dry-run 止损与边界声明）
- **paperEngine 逻辑层**（健康且有单测；只做渲染器侵入剥离 #7）
- **Viewport / PriceScale / BarSeries / CanvasManager**（健康、有单测、性能达标）

## 4. 分期实施路线

| 阶段 | 内容 | 出口判据 |
|------|------|----------|
| A：对齐安全网 | #2 全部（视觉回归、ctx-mock、输入集成测试、Pine/syncBus 单测） | 黄金截图集入库；对 ChartRenderer 做一次无害重构（如改注释/常量）验证截图网敏感 |
| B：小步拆分 | #1 提交 1-2（SyncBridge、autoscale、hitTest、cursor）+ #3 syncBus 改造 + #5 剪刀图标 | typecheck + 单测 + 视觉回归全绿；syncBus 时间空间联动物理验证（跨周期两图） |
| C：核心拆分 | #1 提交 3-4（手势状态机、ChartState、RenderPipeline、门面化）+ #7 交易手势剥离 | 同上；回放下单 E2E 通过 |
| D：性能 | #4 脏缓存 + 同帧 computeWindow 合并 | 指标金标准全过；帧时间不劣化（目标 4 面板+4 指标 ≤3ms） |

## 5. 技术约束清单（给后续执行的硬约束）

1. 引擎保持框架无关：拆出的模块不得 import React / zustand / DOM 事件以外的浏览器 API；Chart.tsx 仍是唯一挂载点
2. 公开 API 签名冻结：拆分期间 ChartRenderer 公开方法签名不变，调用点（Chart.tsx / App.tsx / RightSide / 对话框）零改动
3. 每个拆分提交必须附带：typecheck + `npm test` + 视觉回归截图无 diff 三项证据
4. syncBus 改造后必须保留：来源方不收自己事件、未订阅方零影响、unsubscribe 完整
5. 图标约束（团队 P0）：canvas 内功能图标一律 SVG path/预渲染，禁止 Unicode 字符（现 drawScissors 的 '✀' 为存量违规，随 #5 修复）
6. 禁止紫色→粉色渐变方案；技术选型不预设，规则优先

---

## 附：调研来源

1. TradingView 官方 Charting Library API Reference（tradingview.com/charting-library-docs/latest/api）：三模块划分（Charting Library / Datafeed / Broker），IChartingLibrary Widget / IChart 两级 API，事件订阅模型——tradingPA 的 renderer 公开面与 sync 事件设计对标基准
2. DeepWiki《tradingview/lightweight-charts》架构总览与 Core Rendering Architecture：四层架构（Public API facade / GUI widget 树 / Model：ChartModel+DataLayer / Rendering：view-renderer 分离）、双 canvas 分层（base/top）、四级 invalidation（None/Cursor/Light/Full）、data conflation（spacing<0.5px 合并）——tradingPA 渲染管线与 LOD 的对标基准
3. CSDN《TradingView Charting Library 深度解析：多框架集成架构与实战指南》：模块化架构（核心渲染引擎/数据管理/组件/配置/扩展接口五域）与关注点分离设计哲学——交叉验证
