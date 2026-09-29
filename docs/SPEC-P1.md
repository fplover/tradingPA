# Spec - tradingPA P1 功能广度批次 v1.0

> 生成日期：2026-09-29
> 基于：docs/GAP_ANALYSIS_TV_vs_tradingPA.md（§1.1/§1.4/§1.7/§1.8/§1.9/§1.11）+ SPEC-TV-ALIGNMENT v2.0（已交付，规则沿用）
> 状态：已确认（用户 2026-09-29 选定全部 6 模块）

---

## 1. 产品定义

- **一句话描述**：在 TV 对齐 v2.0 交付基线上，补齐 P1 功能广度——指标库、Pine 脚本能力、警报、模拟交易、命令面板、Volume Profile。
- **目标用户**：熟悉 TradingView 的技术分析交易者
- **核心问题**：主干已齐且 TV 违和感已清零，本轮解决「功能广度」差距

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 批次 | 模块 | 内容摘要 | 落点（点名文件） | 预估 |
|---|---|---|---|---|
| P1-A | 指标扩充 ~30 个 | 按 GAP §1.4 高频清单补齐（ROC/TRIX/TSI/Vortex/Alligator/KST/Coppock/Fisher/CMO/DPO/BOP/NATR/Stdev/BBWidth/PercentB/Choppiness/MassIndex/HistVol/AnchoredVWAP/ChaikinOsc/ElderRay/Klinger/A&D/VolumeOsc/NetVolume/CorrCoeff/PPO/Aroon 族/McGinley 等），声明式 schema + 窗口化计算 + 金标准单测，先 diff registry 只补缺失 | `src/indicators/builtin/`、`src/indicators/registry.ts`、`tests/unit/indicators*.test.ts` | 10-15d |
| P1-B | Pine 控制流 + ta 扩容 | 语句节点 if/for、var 声明、用户自定义 function、~20 个 ta.*（wma/hma/vwma/dema/tema/atr/tr/macd/adx/cci/mfi/wpr/bb/kc/donchian/supertrend/psar/linreg/tsi/fisher/rma）、绘图指令 hline/bgcolor/barcolor；compile.ts 已超红线，新增逻辑必须拆新模块（tokenizer/parser/interpreter 分置），barrel 兼容 | `src/features/pine/`、`tests/unit/pine-compile.test.ts` | 9-14d |
| P1-C | 警报丰富化 | 触发条件补 greater/less（不依赖穿越）；作用对象扩展到指标值（副图指标 overbought/oversold 类）；警报编辑（改价/改条件/暂停）；触发频率 Once/Every time；过期时间；声音提示（Web Audio）；按品种分组可选 | `src/store/alertStore.ts`、`src/features/alerts/AlertPanel.tsx`、`App.tsx`（checkAlerts effect） | 9-14d |
| P1-D | 模拟交易 limit/stop | limit/stop/stop-limit 挂单 + 挂单列表 + 触价成交引擎（tick 穿越判定，涨跌停/gap 开盘按 TV 语义：limit 优价成交、stop 触发转市价）+ 撤单；paperEngine 纯函数化 + 单测 | `src/features/trading/`、paperEngine 及其单测 | 4-6d |
| P1-E | 命令面板 | 全局命令注册表（切周期/切类型/开指标/警报/布局/截图/主题/复盘等全部顶栏动作）+ 模糊匹配浮层 + 键盘导航（↑/↓/Enter/Esc）；Ctrl+P 唤起 + 顶栏按钮入口；与既有 `/`、Ctrl+K 符号搜索不冲突 | 新增 `src/features/command/CommandPalette.tsx` + `commandRegistry.ts`、`App.tsx` 接线 | 3-5d |
| P1-F | Volume Profile | 可见区间按价格分桶成交量分布（POC/VAH/VAL），独立副表面板；先经架构评估（Binance aggTrades 限频 vs kline 近似）定数据管线后实装 | 新增 `src/features/indicators/VolumeProfile*`、数据层适配评估 | 8-12d |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|---|---|---|
| 画线触及触发警报 | 命中测试接入警报轮询成本高，ROI 不足 | 下下批次 |
| Pine plotshape/alertcondition/request.security | 依赖 MTF 管线 | P2 |
| Pine array/matrix/table/strategy() | Spec v2.0 已裁定不做 | 不做 |
| Compare/叠加、Spreads | 数据层多序列改造 | v2.0 |
| Bar Magnifier / footprint | tick 数据依赖 | 接付费源后 |
| 警报邮件/push 渠道 | 需后端 | 不做 |

## 4. 技术架构（沿用 Spec v2.0 锁定，版本不变）

React 18.3.1 / TS 5.6.3 / Vite 5.4.11 / Zustand 4.5.5 / Radix + lucide-react 1.47.0 / Vitest + Playwright。

**P0 规则（全程有效）**：
1. 图标一律 lucide-react / SVG path，禁字符/emoji 图标（尺寸 14/16/18）
2. 颜色一律 CSS 变量/Token，禁硬编码 hex（例外 #fff/#000）
3. 渲染循环与 React 解耦；引擎状态不进 React
4. 单文件 ≤300 行；新文件单一职责；入口只装配
5. 每模块完成必须 `npm run typecheck` + 模块单测全绿；批次出口全量门禁

## 5. 验收标准（EARS 摘要）

| 编号 | 模块 | 验收标准 | 优先级 |
|---|---|---|---|
| AC-A1 | 指标 | While registry diff 后补齐 ≥28 个新指标，系统**必须**每个都有：schema 注册、窗口化计算、金标准单测（固定输入输出）、面板分类可见 | P0 |
| AC-A2 | 指标 | If 新指标计算与 TradingView 参考值偏差 > 0.01%，系统**必须**在单测中暴露 | P0 |
| AC-B1 | Pine | While 脚本含 if/for/var/自定义函数，编译器**必须**正确解释执行并产出 plot 序列 | P0 |
| AC-B2 | Pine | If 脚本运行期抛错，系统**必须**前置报错不穿透 rAF（沿用既有 dry-run 约定） | P0 |
| AC-B3 | Pine | 20 个新 ta.* 函数**必须**与指标引擎同源实现或有独立金标准用例 | P0 |
| AC-C1 | 警报 | While 价格 greater/less 条件成立，系统**必须**触发通知（含声音）；Once 模式触发后**必须**自动停用 | P0 |
| AC-C2 | 警报 | While 用户编辑既有警报（价/条件/暂停），保存后**必须**按新条件生效且刷新后持久 | P1 |
| AC-D1 | 模拟交易 | While 挂 limit 买单且行情价下穿限价，系统**必须**按限价或更优价成交并进持仓 | P0 |
| AC-D2 | 模拟交易 | While 挂 stop 单且触发价触及，系统**必须**转市价成交；挂单**必须**可撤销 | P0 |
| AC-E1 | 命令面板 | While Ctrl+P 唤起并输入关键词，系统**必须**模糊匹配命令并支持键盘执行 | P0 |
| AC-F1 | VP | While 可见区间有成交量数据，VP 面板**必须**渲染分桶直方图并标注 POC/VAH/VAL | P0 |

## 6. 波次计划

- **Wave 1（并行 4 流）**：P1-A 指标 ／ P1-B Pine ／ P1-C+P1-E 警报+命令面板（同占 App.tsx，单流避免冲突）／ P1-D 模拟交易；并行 1 位架构师做 P1-F Volume Profile 数据源评估（只读，产出设计）
- **Wave 2**：P1-F Volume Profile 按评估结论实装
- **出口门禁**：`npm run typecheck && npm test && npm run test:e2e` 全绿 + P0 三扫零 + 分模块提交（`feat(p1/A1): ...` 格式）

## 7. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-09-29 | Spec 创建，用户确认全 6 模块 | P1 启动 | 全项目 |
| 2026-09-29 | **P1-F0 评估完成**：VP 裁决 kline 近似（TV 同语义），否决 aggTrades（请求预算 7-27% 配额 + 端点不可达）；渲染裁决主图右侧横置直方图；工作量复估 6-8 人日。落档 DESIGN-volume-profile.md + ADR-001 | Wave 2 施工依据 | docs |
| 2026-09-29 | **Wave 1 四流交付**：P1-A 指标 30 个（registry diff 跳过已有 Aroon/ATR；Anchored VWAP 需锚定交互，落 OPEN-DECISIONS）；P1-B Pine if/for/var/用户函数 + 21 ta.*（taCore 与指标引擎同源）+ hline/bgcolor/barcolor（bgcolor/barcolor 渲染接线留 P2，pinePaint 旁路已就绪）；P1-C 警报 4 条件/指标值触发/编辑/频率/过期/声音 + schema v2 迁移；P1-E 命令面板 ~45 命令 Ctrl+P；P1-D limit/stop/stop-limit + gap 语义 + 无效单拒绝 | 成员 RoleVerdict 全部 pass | 见各提交白名单 |
| 2026-09-29 | **集成门禁全绿**：typecheck 0 错误；单测 544/544（批次前 427，净增 117）；E2E 47/47（1.2m）；P0 双扫零（emoji 零匹配；hex 命中均为 v2.0 已裁决存量）。**环境坑记录**：Playwright webServer(npm run dev) 在 Windows 退出时无法杀 npm→vite 孙进程导致进程挂死（30min 无汇总、test-results 空）；绕过=预先自起 dev server 让 reuseExistingServer 生效，跑完 1.2m 退出（已入 pitfalls.jsonl validated） | 批次出口门禁 | 全项目 |
| 2026-09-29 | **P1-F Volume Profile 实装交付（Wave 2）**：computeProfile 纯函数+签名缓存（dataEpoch 门控）、drawVolumeProfile 右对齐直方图+POC/VAH/VAL（插 drawTrading 前，仅 timeBasedChart 绘制）、IndicatorManager profile 分支（固定 uid 'vp'，模板持久化自动兼容）、theme 4 token × 双主题、delta 源 buyRatio 近似。已知边界：同图单 VP 实例（蓝图语义）；设置面板色参初值随加载时主题快照（渲染实时读 token） | Wave 2 施工（蓝图 DESIGN-volume-profile.md 全量落地） | engine/profile、engine/renderer、indicators、theme |
