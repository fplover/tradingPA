# Spec - tradingPA P2 收官批次 v1.0

> 生成日期：2026-09-30
> 基于：GAP_ANALYSIS_TV_vs_tradingPA.md（P2 池）+ SPEC-P1 交付后 advisory + OPEN-DECISIONS.md
> 状态：已确认（用户 2026-09-30 指令「完成 P2」）

---

## 1. 产品定义

- **一句话描述**：P1 后的 P2 长尾收官——Pine 绘图指令完整化、画线家族扩展、多图表联动与布局补全、Compare 叠加、警报画线触及
- **核心问题**：GAP 清单中剩余的可落地项（排除外部数据依赖项）

## 2. MVP 范围（锁定）

| 批次 | 模块 | 内容摘要 | 落点 | 预估 |
|---|---|---|---|---|
| P2-A | Pine 绘图指令完整化 | ① bgcolor/barcolor 渲染接线（pinePaint 条件序列画到 K 线背景/蜡烛，经 drawIndicator/新增 drawPinePaint，单调用点进 RenderPipeline）② plotshape/plotchar（条件标记图形）③ alertcondition（编译期注册条件，供警报面板选源） | `src/indicators/pine/`、`src/engine/renderer/drawIndicator.ts`、RenderPipeline 单点 | 4-6d |
| P2-B | 画线家族扩展 | ① 文字类 4 种：便签/价格标签/锚定文本/箭头标记 ② 几何 3 种：多边形/圆弧/曲线（贝塞尔）③ 江恩 3 件：扇形/江恩线/江恩箱 ④ 艾略特波浪 5-3 标注 ⑤ 测量工具（Shift+点击浮层：bar 数/价差/百分比）⑥ Anchored VWAP（OPEN-DECISIONS 关闭项：点击锚定 bar + 指标 def，复用画线锚点交互） | `src/engine/drawing/`、`drawDrawings.ts`、`features/drawings/`、`indicators/builtin/avwap.ts`+registry | 12-16d |
| P2-C | 平台补全 | ① 多图表联动扩展：品种同步/周期同步/画线同步（syncBus 三 channel，绕开 React，sourceId 防环沿用）② 单元格最大化/折叠（Alt+Enter、双击窗格）③ 布局边缘拖拽调比（grid 比例动态化）④ 底部控制条 control_bar（缩放/左右导航按钮）⑤ 符号搜索键盘导航（↑/↓/Enter）+ 收藏分组 | `syncBus.ts`、`layoutStore.ts`、`components/`、`features/layout/`、`SymbolSearchDialog.tsx`、`App.tsx`、`hooks/useTvShortcuts.ts` | 10-14d |
| P2-D | Compare + 画线警报 | ① Compare/叠加：顶栏按钮叠加第二条价格序列（归一化百分比坐标 + 图例第二行 + 独立数据订阅）② 警报画线触及：水平线价格 level 作为警报源（接 alertStore 条件源 + useAlertWatcher 采样，不进引擎） | 数据层新增 compareSeries、`useChartSeries`、图例、`alertStore`、App 顶栏 | 6-9d |

**波次**：Wave 1 = P2-A + P2-B + P2-C 三流并行（文件白名单互斥；P2-B 禁触 RenderPipeline/App.tsx）；Wave 2 = P2-D（等 P2-C 回传释放 App.tsx）。

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 |
|---|---|
| Bar Magnifier / 除权财报 marks | tick/基本面数据源依赖，免费源不匹配 |
| Spreads 公式品种 | 多序列公式解析改造 5-8d，用户价值未验证 |
| request.security() MTF | 跨周期数据管线 5-8d，Pine 高级特性，社区脚本覆盖率低 |
| 16 格布局 / 交易所前缀直连 | TV 付费差异化卖点，复刻优先级低 |
| 局部擦除 / 图标贴纸 | 交互细分成本 3-4d，低价值长尾 |
| Pine strategy() / array-matrix-table | 与复盘交易定位重叠（历次已裁定） |

## 4. 技术架构与 P0 规则（沿用，全程有效）

lucide-react 图标 / CSS token 禁 hex / 渲染不进 React / 单文件 ≤300 行 / syncBus 防环 / typecheck+单测模块门禁 / 批次出口全量门禁。

## 5. 验收标准（EARS 摘要）

| 编号 | 模块 | 验收标准 | 优先级 |
|---|---|---|---|
| AC-A1 | Pine | While 脚本含 bgcolor/barcolor/plotshape，系统**必须**在 K 线背景/蜡烛/标记位渲染对应视觉 | P0 |
| AC-A2 | Pine | While 脚本含 alertcondition，系统**必须**在警报面板可选该条件为源 | P1 |
| AC-B1 | 画线 | While 用户选择任一新画线工具（10 种 + AVWAP），系统**必须**完成落点/编辑/命中/序列化/对象树管理全链路 | P0 |
| AC-B2 | 画线 | While 使用测量工具，系统**必须**显示 bar 数/价差/百分比浮层且 Esc 取消 | P0 |
| AC-B3 | 画线 | While 点击 AVWAP 锚定 bar，系统**必须**计算锚点至最新 bar 的 VWAP 并随实时 bar 更新 | P0 |
| AC-C1 | 联动 | While 多图表开启品种/周期/画线同步，修改任一单元格**必须**同步到其余单元格且无回环抖动 | P0 |
| AC-C2 | 布局 | While 双击/Alt+Enter 窗格，系统**必须**最大化/恢复；拖拽边缘**必须**调整比例且刷新后持久 | P1 |
| AC-C3 | 搜索 | While 符号搜索弹窗，↑/↓/Enter**必须**完成选择，收藏分组置顶 | P1 |
| AC-D1 | Compare | While 添加对比序列，系统**必须**以归一化坐标叠加渲染且图例显示第二行 | P0 |
| AC-D2 | 警报 | While 水平线被选为警报源且价格触及，系统**必须**按条件触发 | P0 |

## 6. 出口门禁

`npm run typecheck && npm test && npm run test:e2e` 全绿 + P0 三扫零 + 分模块提交（`feat(p2/A1)` 格式）+ Spec 变更记录更新。

## 7. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-09-30 | Spec 创建，用户指令「完成 P2」 | P2 启动 | 全项目 |
| 2026-09-30 | **P2-A 交付**（6056eb4 + 1e194fc）：① bgcolor/barcolor 渲染接线——IndicatorDef.computeExtra 窗口旁路契约（与 compute 同脏缓存周期，BarPaint 通用形状 core 不依赖 pine 类型）+ drawPinePaint 双相位（bg 先于 K 线/bar 后于，bar 仅蜡烛族）；关键修复：paint 条件序列按入窗 bars 引用取数，图例窗/绘制窗交替不串窗。② plotshape/plotchar（7 shape × 3 location，absolute 价格定位；编译门禁放宽为 plots/hlines/shapes/alerts 四者有一）+ drawPineShapes 单 call point。③ alertcondition：pine/alerts.ts 注册表 + AlertPanel「Pine 条件」分区 + useAlertWatcher pineAlertSamples 同机制采样（条件序列走 computeExtra 脏缓存，watcher 命中不串窗——专项测试钉死）。新增单测 48 例；门禁 typecheck + 785/785 + E2E 47/47 | P2-A 完成 | src/indicators/{core,pine}/*、src/engine/renderer/*、src/features/alerts/* |
| 2026-09-30 | **P2-B 交付**（d77b8b7）：画线家族 11 工具 + AVWAP——文字 4（note/price-label/anchored-text/arrow-mark）、measure 测量（浮层三行 + Esc 取消）、几何 3（polygon/arc/curve）、江恩 3（fan/line/box）、艾略特波浪；几何纯函数与 canvas 绘制全分离（6 组 math/render 模块）；AVWAP 指标 + anchorDrop 锚定落点状态机（选 bar 模式/改色不丢锚/切工具放弃）。drawingToolGroups 6→8 组贴 TV 结构。AC-B1/B2/B3 全链路经 136 新测覆盖（放置/序列化/命中/撤销/磁吸/多选）。黄金 20 面零 diff（harness 路径结构性豁免，已核实）。已知边界：多边形顶点「增」UI 接线待下批（纯函数已交付）；AVWAP 图表重挂需重新落点 | P2-B 完成 | src/engine/drawing/*、src/features/drawings/*、src/indicators/builtin/avwap.ts |
| 2026-09-30 | **P2-C 交付**（5cd9f5e）：syncBus 三 channel（品种/周期/画线，sourceId 防环 + 30Hz 限频，零 React）+ 单元格最大化（Alt+Enter/双击）+ 边缘拖拽调比（原子双轨 + 落盘持久）+ control_bar 五按钮 + 搜索收藏分组置顶。**App.tsx 650→237**（§12 在案裁决项关闭）：状态下沉 chartConfigStore/uiStore，装配拆 TopBar/ChartWorkspace/ChartDialogs；原 <1 帧竞态结构性消除。门禁 typecheck + 785/785 + vite build + E2E 47/47。新登记红线：SymbolSearchDialog 488、LayoutSaveMenu 319（既有） | P2-C 完成，App.tsx 裁决关闭 | src/store/*、src/features/layout/*、src/App.tsx |
| 2026-09-30 | **P2-D 交付**（23294a8）——**P2 四批全部完成**：Compare 叠加（chartConfigStore.compareSymbol + useCompareSeries 独立订阅/30s 轮询 + drawCompare 副坐标独立域、percent 模式同坐标系 + 图例第二行经 setLegend 既有 API 进环，零引擎公开 API 改动）+ 画线水平线警报（alertSource line 分支 + useAlertWatcher 画线桥 useSyncExternalStore + AlertPanel 分区默认 crossUp；市场价 vs 水平线价，拖动随 tick 同步）。新增 35 例。门禁 typecheck + 单测 830/830 + build。已知边界：对比仅最近 500 根/多图表无 Compare/水平线清单拖拽瞬间不实时广播（采样不受影响）。同批完成 ChartController 红线拆分（78b6f49，621→599，§12 记录） | P2-D 完成，P2 收官 | src/features/market/useCompareSeries.tsx、src/engine/renderer/{drawCompare,legendTypes,drawLegend,RenderPipeline,PaneRenderer}.ts、src/features/{layout,alerts}/* |
