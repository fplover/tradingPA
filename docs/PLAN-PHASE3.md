# 三期开发规划（PLAN-PHASE3）

> 状态：**三个决策点已全部裁决（2026-10-12）**——D1 维持档 0 并**关闭重评入口**、D4 MTF **不做**（登记为明确不做）、D6 取向 **收敛**。批次 B/C/D 可直接排期，E/F/G 已按裁决移出（详见 §4 与 `docs/decisions/OPEN-DECISIONS.md` 2026-10-12 三行）。**三期-H** 为批次 A 回传项，同日由用户裁决立项。
> **批次进度（2026-10-12）**：三期-A 已交付（见 §2-A 交付记录，零功能变更）；三期-H 已交付（见 §2-H 交付记录，该文件 disable 归零 + 行为零变更）；**三期-B 开工取证完成并重排**（加 B0 前置、撤事件页，4.5–6.5 → **6–8 人日**，见 §2-B）；**三期-B0 已交付**（设置态单一来源 + 偏好落盘，见 §2-B 的 B0 交付记录）；**三期-B1 已交付**（图表设置「模板」页 + 模板 store，见 §2-B 的 B1 交付记录）；**三期-B2 已交付**（图表设置「交易」页 + 交易偏好 store + 引擎交易层显隐开关，见 §2-B 的 B2 交付记录）；**B → C → D 为收敛取向下的全部剩余功能面**，E/F/G 不排期。
> 取证日期：2026-10-09。所有「现状」论断带出处（`路径:行号` 或文档小节 + 行号）；工时为**估算**（单人，含单测与门禁适配，不含商务/托管申请），已标注。
> 工具链基线：TS 7 原生 `tsc` / oxlint / Vite 8 Rolldown（见 README「质量门禁」）。

## 0. 定位与取证来源

**本期定位**：二期收尾后，`DEVELOPMENT_PLAN.md` §3 的功能清单已 **61 项全勾、0 项未勾**——1:1 图表复刻的功能面**没有剩余工作**。因此三期候选范围只能来自四处「灰区」，本文逐项已在代码/文档中核实来源：

| 来源 | 内容 | 核实方式 |
|---|---|---|
| `docs/AUDIT-TV-UI-GAP.md` | 已交付功能的**像素级/规格级深化**（对话框页缺、参数化、右键菜单项） | 逐行抽查引用行号 |
| 各文件头注「属后续增强」 | 交付时显式让路的简化口径 | Grep 注释 + 读实现 |
| `docs/decisions/OPEN-DECISIONS.md` | 已 RESOLVED 条目里的「残留」尾巴 | L27–L34 状态核对 |
| `docs/DECISION-PHASE3-BACKEND.md` | 后端决策（分档 0–3） | 该文档 §4 五问 |

**取证纪律**：本规划初稿曾把「价格轴 left/none 实装」列为三期-B 待办，经 OPEN-DECISIONS **L29 核对为 2026-10-08 已 RESOLVED**（`PriceAxisPos` + 三态几何 `chartAreaWidth`/`chartAreaOffsetX`，`ChartState` 的 `priceAxisPos`/`timeHour12` 与 setter 均已落地），故该条已删除、改为残留项。**任何后续追加的规划条目，未经行号核实不写入本文。**

## 1. 三期目标

1. **收口灰区**：把交付时登记为「属后续增强」的项，逐项做掉或明确写死「不做」，让项目进入「无待办灰区」状态。
2. **规格深化**：设置类对话框补齐 TV 的页级结构（交易/一般/**模板**；原列「事件」页经 2026-10-12 开工取证撤项，无数据面可接，见 §2-B 与 §3 第 7 条）。**模板页已随 B1 交付（2026-10-12）**、**交易页已随 B2 交付（2026-10-12）**、**一般页已随 B3 交付（2026-10-12）**、**警报页已随 B4 交付（2026-10-14，用户裁决补页签）⇒ 页级缺口清零且 TV 侧「警报」页签一并落地，对话框现为 9 页**。前置项 **B0：设置态单一来源 + 偏好落盘**同期立项（`chartConfigStore` 无 persist、画布偏好由对话框自持）。~~控件精度（number stepper、plot 类型下拉）~~ **2026-10-12 复核为已交付**，见 §2-B 校准行。
3. **工程债清理**：README 与 `oxlintrc` 类文档-代码口径漂移（三期-A 已处置）、lint disable 残留（原 **3 处**，三期-H 消除 1 处后**现 2 处**，二者经删除探针证实只抑制自身那一行、属真·有意例外，见 README「lint disable 台账」）、E2E 重试基线（`playwright.config.ts:17` `retries: 1` 与既定「`--retries=0` 全绿」标准不一致——登记为不排期残留，见 §2-F）。
4. **决策落定**：D1（后端）、D4（MTF）、D6（取向）三个决策点给出书面裁决并结转进 OPEN-DECISIONS。**2026-10-12 全部达成**（档 0 + 关闭重评 / MTF 不做 / 收敛；三行已入册）。

**量化验收口径（全期）**：`npm run verify` 全绿；`npm run test:e2e -- --retries=0` 全绿（**该 flag 自 2026-10-14 起与配置一致**——`playwright.config.ts` 的 `retries` 已归零，用户裁决④，故不带 flag 的跑法同样严格）；`npm run build` 最大 chunk gzip ≤ 150 kB（三期-B4 后现 **144.87 kB**、三期-C1 后 **145.33 kB**，留裕度）；Vitest 用例数 ≥ **1368**（三期-B4 后现量，+5 例 = 新文件 `tests/unit/alert-sound-pref.test.ts`；三期-C1 后现 **1377**）且不删既有断言。**原始体积口径（2026-10-14 用户裁决①已处置）**：B1 起应用块逐批越过 Vite 默认的 500 kB **警告阈值**（B1 500.61 → B2 503.85 → B3 505.87 → B4 **506.49 kB** → C1 **508.26 kB**）——裁决为**提阈值并登记预算**，`vite.config.ts:32` `chunkSizeWarningLimit = 560`（约 54 kB 余量，量级按三期-C 判）；这是提阈值而非关警告，越过 560 仍拦（探针实证：同一 506.49 kB 块在 500 档副本配置下警告复现）。真实门禁仍是 gzip ≤150 kB。详见 §2-B 的 B4 交付记录。

## 2. 批次划分

### 三期-A · 工程债与口径校准（1–2 人日）

无功能变更，纯一致性。先做，为后续批次提供干净的基线。

| 项 | 现状（出处） | 动作 | 验收 |
|---|---|---|---|
| README lint 条数漂移 | README:34 称「仅剩 1 条 disable」 | 实为 **3 条**：`src/components/Chart.tsx:108`、`src/features/market/useChartSeries.ts:223`、`src/features/layout/ChartWorkspace.tsx:175` | 改为 3 条并逐条附「为何不能删」；若可删则删并重跑门禁 |
| SPEC-PHASE1-FEATURE-BREADTH 版本快照陈旧 | `docs/SPEC-PHASE1-FEATURE-BREADTH.md` §4 后已加陈旧标注 blockquote | 保持（历史规格不改写，仅标注） | 不改动，登记为「已处置」 |
| `.oxlintrc.json` 的 `@typescript-eslint/*` 键 | 该键是**承重**的（配置生效前提），曾面临被「清理」风险 | 在文件旁注或 README 写明「不可作为幽灵依赖删除」 | 重跑 `npm run lint` 0/0 |
| TS 7 panic 侦测口径 | README 已写明判据（panic → stderr + exit 2）与临时等价命令 | 无 | — |

#### 三期-A 交付记录（2026-10-12）

**结论：4 项全部处置，零功能变更、零源码改动（纯文档 + `.oxlintrc.json` 注释）。**

1. **disable 条数勘正**：全仓扫描实测 **3 条**（`Chart.tsx:108` / `useChartSeries.ts:223` / `ChartWorkspace.tsx:175`），README 命令表与基线段的「仅剩 1 条」已改为 3 条，并新增「**lint disable 台账**」小节。每条附**删除探针**证据（仅删该 disable 行 → `npx oxlint <该文件>` 看新增诊断）：① +1 exhaustive-deps（引擎 mount-once 生命周期，依赖必须 `[]`）；② +8（目标 1 条 + 被连带抑制的 6 条 refs + 1 条 set-state-in-effect）；③ +1 purity（渲染期墙钟占位）。三条均判定**不可删**——删除等价于行为变更，越本批次红线。
2. **回传的新发现（不在原表内，已登记 OPEN-DECISIONS 两行）**：① **门禁盲区**——`useChartSeries.ts` 的「0 警告」是指令锚定而非分析归零，7 条诊断被同文件一条指令连带遮蔽，故 2026-10-08「55 条基线全额清偿」的表述对本文件不成立，README 基线段已就地加注；② **工具链语义**——oxlint 1.87 的 disable 抑制半径在 `.ts` hook 文件与 `.tsx` 组件文件表现不一致（前者移到文件末尾仍抑制同 hook 全部编译器规则诊断，后者严格只对下一行生效），机制未证实，按观测事实登记为待查项。
3. **承重键旁注**：`@typescript-eslint/no-unused-vars` 键上方加注释 + README 记录探针结论（`npx oxlint -c` 双配置对照：core 规则置 `error` 时带键 0 错 / 去键 1 错）。**JSONC 兼容性实证**：带 `//` 注释的配置被 oxlint 正常解析（bogus 规则名探针反证解析失败会硬报错），`prettier --check` 通过。
4. **历史规格陈旧标注**：`docs/SPEC-PHASE1-FEATURE-BREADTH.md` 标注 blockquote 已在位，按规划「不改写历史」登记为已处置；TS7 panic 判据无需改动。顺带勘正本文 §1 目标 3 的 `qxlintrc` 笔误。

**门禁（2026-10-12 实跑）**：`npm run verify` 全绿——typecheck 0 错 / oxlint **0 错 0 警告**（366 文件，含带 `//` 注释的 `.oxlintrc.json`）/ format:check 绿 / 单测 **81 文件 1305 例全过**；`npm run test:e2e -- --retries=0` **59 例全过**（2.3 分钟，27 面黄金截图零 diff，dev server 手动起）；`npm run build` 通过，7 chunk、最大应用块 495.47 kB（gzip 141.16 kB，未触发 >500 kB 警告）。**差集为零**：本批次只改 README / `.oxlintrc.json` 注释 / 两份文档，源码与测试未动，用例数与截图面数与二期收官基线一致。**下一步**：批次 A 无遗留动作。回传的 ②（oxlint 指令抑制半径机制）仍为 OPEN 待查，不阻塞 B/C/D。①的门禁盲区经用户裁决（2026-10-12）为**立项改造**（不写死为有意例外），已立 **§2-H 三期-H · useChartSeries 门禁盲区清偿**，退出判据为该文件 disable 注释归零 + 单文件 lint 0/0 + 行为零变更。

### 三期-H · useChartSeries 门禁盲区清偿（1–1.5 人日，估；2026-10-12 由用户裁决「立项改造」新立，**同日交付**）

**来源**：三期-A 交付记录回传的门禁盲区（`docs/decisions/OPEN-DECISIONS.md` 2026-10-12 两行）。`src/features/market/useChartSeries.ts:223` 一条 `react-hooks/exhaustive-deps` 指令连带遮蔽了同文件 **6 条 `react(refs)` + 1 条 `react(set-state-in-effect)`**，该文件的「0 警告」是指令锚定而非分析归零。

**目标（退出判据，可机械验收）**：该文件 **disable 注释归零**且 `npx oxlint src/features/market/useChartSeries.ts` 0 错 0 警告——即三条诊断各自被真正的代码结构解决，不再靠指令抑制；行为零变更。

| 项 | 现状（出处） | 动作 | 风险与护栏 |
|---|---|---|---|
| 渲染期同步 latest-ref（3 写） | `:40 instRef.current = instrument` / `:42 barsRef.current = history` / `:57 tfRef.current = tf` | 移入声明在**消费 effect 之前**的同步 effect（React effect 按声明序执行，消费方在 `:60` 起，故写入必先于读取）；`instrument` 对象标识逐渲染可变，deps 仍按 `id`/`timeframe` 收窄不变 | 消费点全在异步回调与 effect 体内（`loadMore`/`onBars`/`onStatus`），首帧读旧值的窗口需逐点核对；护栏：新增单测钉「切品种/切周期后首次异步回调取到的是新 inst」 |
| 渲染期读 ref（`:231` useMemo 内 `instRef.current?.market`，报 3 条） | `bars` 的 `useMemo` 在渲染期读 ref | 把 `market` 改为**参与渲染的数据**（由 `instrument?.market` 直取，或让 `bars` memo 依赖 `market` 值）——渲染期不再碰 ref | memo 依赖面扩大一档（market 变化时重算，本就是预期语义）；护栏：`tests/unit` 补末柱报价合成用例锁定 tz 派生不变 |
| effect 内同步 setState | `:109 setStatusDetail(\`拉取 ${base} 基期 K 线并聚合\`）` | 改为派生文案：聚合路径的 detail 由状态派生（`base`/`ratio` 已在同一渲染内可得），或用既有 `status` 通道承载，去掉这一处同步写 | 先做**去遮蔽重测**——移除遮蔽后同一 hook 的 `:63-65/:91-93` 同步 setState 是否也进入诊断（当前探针只见 1 条，疑为去重），据实扩围；此项不得凭现有计数下结论 |
| exhaustive-deps 本身 | `:223` 指令 + 依赖缺 `tf`/`tf.seconds` | `const tf = useMemo(() => getTimeframe(timeframe), [timeframe])` 后把 `tf` 纳入依赖——标识仅随 `timeframe` 变，而 `timeframe` 已在依赖里，**可证为 no-op**；随后删除指令 | 需确认 `getTimeframe` 返回稳定引用（现为每渲染新建对象，故必须包 memo）；护栏：E2E `--retries=0` 59 例 + 27 面黄金截图零 diff 验证实时通道未反复重挂 |

**排期定位**：本批次是**债务清偿**而非功能扩展，不依赖 D1/D4/D6 任一裁决，可与 B/C/D 并行；建议紧随三期-A 之后执行（A 已把遮蔽清单登记在案，越晚改动该文件，清单越易失真）。

**不做**：不借此批改造 React Compiler 规则本身、不为过门禁加 `.oxlintrc.json` 规则级豁免、不动 `Chart.tsx:108` 与 `ChartWorkspace.tsx:175` 两条（二者经删除探针证实**只抑制自身那一行**，无连带遮蔽，属真·有意例外）。

**交付记录（2026-10-12）**

开工第一步「去遮蔽重测」实测（先摊清单、后动代码）：移除 `:223` 指令后该 hook 显形 **7 条**——`react(refs)` 6（3 处渲染期写 `instRef`/`barsRef`/`tfRef` + `useMemo` 内 3 处读 `instRef.current`）+ `react(set-state-in-effect)` 1。规划表内怀疑的 `:63-65`/`:91-93` 同步 setState 经实测**未**进入诊断（只见观测事实，规则触发条件未证实，与「指令抑制去重」的猜测无关），故改造范围按实测 7 条而非按预估。四项落地：

1. **渲染期 3 写 → 无依赖 `useEffect`**，声明位置在消费 effect 之前（effect 按声明序执行）。与 2026-10-08 清偿批对 `useTvShortcuts optsRef`/`quoteStore`/`ChartWorkspace needsMoreRef` 采用的同一范式一致（见 SPEC §12 该条），本文件只是当时被指令遮蔽而未纳入。
2. **`bars` memo 不再渲染期读 ref**：`market` 由 props 直取（`instrument?.market ?? 'crypto'`）并纳入 memo 依赖。等价性可证——渲染期 `instRef.current` 当时即等于 `instrument`，两处读取同值。
3. **`:109` 同步 setState 消解**：聚合路径的基期派生（`nativeBaseInterval`/`binanceIntervalString`/`ratio`）上提到 effect 体顶部，状态文案与 `setMode`/`setStatus` **同批下发**（`aggBase ? \`拉取 ${aggBase} 基期 K 线并聚合\` : '读取本地缓存'`），嵌套分支内不再补第二次 `setStatusDetail`；终值逐字不变，`onBars` 回调里的「聚合自 …」仍走原通路。
4. **指令删除，依赖补全**：`tf` 直接纳入依赖即可——规划表预估需 `useMemo` 包裹，实测 `getTimeframe` 是模块级档位表查表返回**同一对象**（`src/types/market.ts`），引用天然稳定，无需 memo，纳入依赖为可证 no-op（未触发实时通道重挂，由 E2E 59 例与 `chart-series-refs` 用例锁定）。

**护栏新增**：`tests/unit/chart-series-refs.test.ts`（4 例）——切品种后首次历史拉取用新 instrument（ref 同步时序）/ 聚合路径文案与其余状态同批下发且终值逐字一致 / 原生周期不误进聚合路径 / 日历桶 tz 由 props market 派生（CN 源取本地偏移）。用例经**变异测试**证明非空转：断开 ref 同步 effect → 第 1 例失败；`market` 硬编码 `'crypto'` → 第 4 例期望 480 实得 0。该测试文件自身同样零 disable（首版曾以渲染期给外部变量赋值收结果，被 `react(globals)` 拦下，改为把 hook 输出落 DOM 数据集再断言）。

**门禁（2026-10-12 实跑）**：`npx oxlint src/features/market/useChartSeries.ts` **0 错 0 警告**且文件内 disable 注释 **0 处**（退出判据达成）/ 全仓 lint 0 错 0 警告（367 文件）/ typecheck 0 错 / `npm run verify` 全绿——单测 **82 文件 1309 例**（较基线 +1 文件 +4 例，即本次新增护栏）/ `npm run test:e2e -- --retries=0` **59 例全过**、**27 面黄金截图零 diff**（dev server 手动起）/ `npm run build` 通过，7 chunk、最大应用块 495.48 kB（gzip 141.17 kB，未触发 >500 kB 警告）。**行为零变更**的实证组合：黄金截图零 diff（渲染面）+ 单测终值逐字断言（状态文案）+ E2E 无重挂失败（依赖收窄改补全）。

**收口**：README「lint disable 台账」3 条 → **2 条**，`useChartSeries.ts` 行改为已归零记录；基线段「指令锚定而非分析归零」的警示由「曾有一处盲区」表述取代。OPEN-DECISIONS 2026-10-12「门禁盲区」行就地关闭。同批登记的 oxlint 指令抑制半径机制行**保持 OPEN**——本批消除了唯一一处实际受害面，机制仍未证实，不阻塞 B/C/D。

### 三期-B · 设置对话框页级补齐与控件深化（**2026-10-12 开工取证后重排：6–8 人日**）

依赖：**B0 是 B 其余各项的前置**（设置态没有单一来源，补页只是再叠一层自持 state）。本批是「功能已交付但规格不达标」的主要缺口。

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| **B0 · 设置态单一来源 + 偏好落盘**（2026-10-12 取证立项，**当日已交付**，见下方交付记录） | 三点实测：① `chartConfigStore.ts:57` 是 `create<ChartConfigStore>((set) => ({...}))`，**无 persist**——周期/类型/对数/百分比/自动坐标/画线锁定与隐藏/指标显隐/图例选项刷新即回默认；② `ChartSettingsDialog.tsx:54-61` 五项画布偏好（gridMode / borders / watermark / priceAxisPos / timeHour12）由**对话框自持 useState + 硬编码默认值**，全仓 setter 调用点核对：这五项的唯一写入方就是该对话框（引擎侧 `ChartController.ts:358-379` 只有薄委托，`state` 私有且无对应回读面）；③ `layoutSnapshot.ts:232-257` 的 `captureSnapshot` **不含任何显示偏好**，全仓 localStorage 键盘点亦无图表配置键 | 以 **store 为单一来源**：五项画布偏好迁入 `chartConfigStore`，对话框改读 store（保留「renderer 就绪即下发」路径，引擎由 store 播种而非由默认值覆盖）；标量偏好落盘 localStorage，transient 的 `compareSymbol` / `comparePickerOpen` **不落盘**。**不加引擎 getter**：唯一写入方即对话框，加回读面无必要，避免无谓扩大公开 API 面（签名冻结口径下 additive 也不滥加） | 1–1.5 |
| **B1 · 图表设置「模板」页**（2026-10-12 交付，见下方 B1 交付记录） | 对话框为 **5 页**，全仓无任何「命名偏好快照」面（只有 B0 的单份当前值）；同一交互形态在指标对话框已有一份实现（`features/indicators/TemplateSection.tsx`） | 新增 `chartTemplateStore`（键 `tradingpa.chartTemplates.v1`，上限 20；快照单元 = B0 的 `ChartPrefs` 切片，校验层**共用** `parseChartPrefs`）；对话框加第 6 页签「模板」；模板分区**呈现层自指标面板抽出为共用件** `src/ui/NamedTemplateSection.tsx`，两个调用方各剩 store 适配器 | 含在「页级缺口」的 3–4 人日内（模板页实耗约 1） |
| **B2 · 图表设置「交易」页**（2026-10-12 立项并当日交付，见下方 B2 交付记录） | 交易默认值全仓**六处硬编码字面量（分布在 5 个文件）**：`OrderDialog.tsx:18` 的数量初值取 `qtyNum` prop、prop 缺省时落到字面量 `0.01`（`qtyNum` 全仓唯一实参又是下条的 `0.01`）、`TradePanel.tsx` 调用点的 `qtyNum={0.01}`、`ChartOrderMenu.tsx` 与 `ReplayBar.tsx` 各自的 `useState('0.01')`、`OrderDialog.tsx:20` 的止损默认 `price * 1.01`、`tradeStore.ts` 引擎构造的 `100_000`；`paperEngine` 无手续费/滑点概念。全仓无任何交易偏好落盘键 | 新增 `tradeSettingsStore`（键 `tradingpa.tradeSettings.v1`，四字段：默认数量 / 止损偏移 % / 初始资金 / 交易可视化显隐）承接六处硬编码；对话框加第 7 页签「交易」；引擎侧 **additive** 一层显隐开关（`ChartState.tradingVisible` + `setTradingVisible` + `tradingVisible()` 回读，命中测试单点收敛在 `TradeGesture.hitAt`） | 含在「页级缺口」预算内（实耗约 1.5） |
| ~~设置对话框页级缺口~~ **清零** | **2026-10-12 校准**：取证时 **5 页**（`ChartSettingsDialog.tsx` 的 `TABS = ['坐标轴', 'Scales', '状态栏', 'Canvas', '外观']`，该常量现落 `:17`；B1 后 6 页、B2 后 7 页、B3 后 8 页、**B4 后 9 页**），原表误记「图表/外观/指标/警报 四页」（把指标对话框的页签混进了同一对话框）。TV 侧为 **9 页签**（`AUDIT-TV-UI-GAP:44`：商品代码/状态行/坐标和线条/画布/交易/一般/外观/警报/事件/模板） | 补 **交易 / 一般** 两页（**模板页已随 B1 交付**、**交易页已随 B2 交付**、**一般页已随 B3 交付**，均 2026-10-12；原「四页」中的**事件**经取证撤项，见下行；**警报页**原不在本行范围，经用户裁决③（2026-10-14）随 **B4** 交付，见下下行） | ~~3–4~~ → ~~2–3~~ → ~~1–1.5~~ → **0**（页级缺口清零；B4 的警报页是行外的新登记项，不占本行预算） |
| ~~警报提示音开关~~ **能力在、入口无 → 已交付（2026-10-14，用户裁决③「补页签」）** | `alertStore.ts:187` 的 `check()` 会按 `soundEnabled` 决定是否 `playAlertBeep()`（提示音实现 `features/alerts/sound.ts` 已交付且已接线），字段随 v2 存档持久化；但 `alertStore.ts:50` 声明、`:172` 实现的 `setSoundEnabled` **全仓调用点为 0**（含测试）——用户无法静音，只能手改 localStorage（2026-10-12 随 B1 取证发现并登记）。TV 九页签（`AUDIT-TV-UI-GAP:44`）含「警报」页 | 补对话框第 8 页签「警报」承载提示音开关（`ChartAlertSection.tsx` 新 36 行，值仍由 `alertStore` 持有，store 与引擎零改动）；页内写明「只关发声，不动触发/历史/通知」的口径边界。**未擅自并入 B1 交付**（B1 只承诺模板页），归属经裁决后单独立为 B4 | ~~0.5~~ → **实耗约 0.5**（含四项裁决的落实与落档） |
| ~~事件页（企业行动 / 分红 / 拆股标记）~~ **撤项** | 取证：`MarketSource` 接口（`src/types/market.ts:48-52`）**无任何事件类方法**，全仓 corporate-action 业务代码命中为 **0**；`AUDIT-TV-FEATURE-GAP:147,153` 已记该能力依赖外部数据 | **从 B 撤下**，转 §3 第 7 条「明确不做」并附触发条件。理由：真实增量是「新数据源 + 新标记渲染层」（3–5d），且受 D1=档 0 与「不付费、只用免费直连源」约束，当前定位下**无解锁路径**——与 MTF（§3 第 6 条）同类处置 | ~~1–1.5~~ → **0** |
| 时间坐标格式选项残留 | 价格轴三态与 12/24h **已交付**（L29）；时间轴格式选项仍缺。**2026-10-12 B3 部分处置**：其中**时区显示口径**已交付（「一般」页 + `TimeDisplay` 链，见下方 B3 交付记录），本行仅余**刻度格式**（紧凑 / 小数位） | 补齐时间轴刻度格式（紧凑/小数位/~~时区显示口径~~ **已随 B3 交付**） | 原 1–1.5；时区子项已做完，余下紧凑/小数位**未重估**（不凭感觉改数） |
| 轴宽与刻度参数化 | `AUDIT-TV-UI-GAP:127` `AXIS_TEXT_INSET = 58`（64px 轴宽 − 6px 呼吸）为硬编码 | 轴宽 64 / 刻度 6 提为常量或状态，避免几何分支散落 | 1 |
| ~~指标对话框控件精度~~ **已交付（2026-10-12 复核）** | 原表依 `AUDIT-TV-UI-GAP:148` 记为「plot 类型下拉、number stepper 未达 TV 规格」，**取证日 2026-10-09 的该观测已过期**。实测：`IndicatorSettingsDialog.tsx:47-57` 定义四形态 `line/histogram/band/level`，`:142-153` 已接入下拉且 **band 按「仅多 plot 指标可选」主动收窄**（正是该审计要求的规格），`:205-209` 输入页已用 `NumberStepper` 带 `step` 参数 | **无需动作**（本批次起点已做完） | ~~1.5–2.5~~ → **0** |
| 响应式布局档位 | `AUDIT-TV-UI-GAP:124` 固定档位 1/2/4/6/8，**不做 16 格** | 维持现状（16 格为 TV 付费卖点，见 §3） | 0 |

**B 批次人日两次校准**：原 6–9 →（控件精度子项实测已交付）**4.5–6.5** →（2026-10-12 开工取证：加 B0 前置 1–1.5、撤事件页 0）**6–8 人日**。
原估偏低的成因写清以防重犯：该 4.5–6.5 是按「补几个 tab 的纯 UI」估的，取证后发现**设置态无单一来源**（B0）与**事件页无数据面**两个非 UI 前提。
**B1 后（同日）**：模板页交付，页级缺口行余 **交易 / 一般** 两页（3–4 → 2–3），批次总量 **6–8 人日不变**——B1 实耗约 1 人日，落在原页级缺口预算内；另外 B1 取证新登记一处「能力在、入口无」的警报提示音缺口（见上表，0.5 人日待裁决）。
**B2 后（同日）**：交易页交付，页级缺口行余 **一般** 一页（2–3 → 1–1.5），批次总量 **6–8 人日不变**——B2 实耗约 1.5 人日，仍落在原页级缺口预算内。B2 开工取证另发现两处「规格缺口」不是纯 UI 活：① 交易默认值散在**五处硬编码**且 `paperEngine` 无手续费/滑点模型（故该两开关**有意不做**，见下方登记），② 交易可视化的显隐需要引擎侧 additive 开关（原规划只写了「补一页」）。
**B3 后（同日）**：**一般页交付 ⇒ 页级缺口清零**（1–1.5 → 0，对话框 8 页），批次总量 **6–8 人日不变**——B3 实耗约 1 人日，仍落在原页级缺口预算内。B 批现仅余两行未做：**时间轴刻度格式**（紧凑/小数位，时区子项已随 B3 做完）与**轴宽参数化**，另有 0.5d 的警报提示音入口待裁决。B3 的缺口性质与 B2 同类：原表只写了「补一页」，实做需要引擎侧 additive 显示链（`TimeDisplay` + `tzDate` + 两处消费点 + 跨年判定），且**默认档等价性必须被测出来**而非假设——否则 27 面黄金截图的零 diff 只是运气。
**B4 后（2026-10-14）**：**警报页交付**（对话框 9 页）+ **四项待裁决全部落地**（①体积阈值 560、②交易偏好不进模板、③提示音入口、④`retries` 归零），B 批行数上**只剩两行未做**：时间轴刻度格式（未重估）与轴宽参数化 1 人日。批次总量 **6–8 人日不变**——B4 实耗约 0.5 人日，落在 B1 取证时为该缺口估的 0.5 人日内。性质与 B0–B3 不同：**这次没有新的持有者、没有新的落盘键、没有引擎改动**，缺的只是一个把既有 setter 接到 UI 的入口，故 36 行交付；四项裁决里有两项是纯配置/纯登记，也印证了「待裁决 ≠ 待开发」。

#### B0 交付记录（2026-10-12）

**改动（3 源文件 + 2 测试文件）**：
- `src/store/chartConfigStore.ts`：新增画布五项为 store 字段（`gridMode` / `bordersVisible` / `watermarkVisible` / `priceAxisPos` / `timeHour12` + 各自 setter），并加 localStorage 落盘——键 `tradingpa.chartPrefs.v1`（含 `version: 1`，换 schema 时换键、旧档自然隔离，与 layouts/watchlist 同口径），落盘范围 = **14 个标量偏好字段**（周期 / 类型 / 对数 / 百分比 / 自动坐标 / 画线锁定 / 隐藏画线 / 隐藏指标 / 图例选项 / 画布五项）。写盘走**单点订阅**：`subscribe` 里比对偏好切片、变化才写，因此任何 setter 路径（含快捷键经 `getState()` 调用）都不必各自写盘，而 transient 字段（`compareSymbol` / `comparePickerOpen`）变化**不触发 IO**。
- `src/features/settings/ChartSettingsDialog.tsx`：删 5 个自持 `useState`，改读 store；「renderer 就绪即下发」effect 原样保留——引擎由 store 播种，不再由对话框的硬编码默认值覆盖。文件头注释旧口径（「由对话框自持状态」）同步勘正。
- **未加引擎 getter**（对规划原文的一处修订）：唯一写入方就是该对话框（全仓 setter 调用点核对），加回读面无必要，公开 API 面不扩大。播种链路依赖「`ChartDialogs` 常驻挂载 `ChartSettingsDialog`，其 effect 在 `p.renderer` 由 null 转对象时同帧下发」这一既有事实。

**坏档口径**：逐字段回落，不整体弃档——坏 JSON / 非对象 / 布尔位串 → 该字段默认；枚举非法（`gridMode:'diagonal'`、`priceAxisPos:5`、`chartType:'hilo'`）→ 该项默认而**同档其余合法字段保留**；图例选项逐键校验（一个坏值不改掉整组开关）；`localStorage` 访问本身抛错（隐私模式）→ 全默认且不阻断装载。
**周期 id 的注册表时序**：自定义周期 id 按**形状**放行（`custom:<正整数>`）而非只认 `isKnownTimeframeId`——本 store 的模块求值可能早于 `customInterval.ts` 的 `initCustomIntervals()`，此刻注册表还认不得刚持久化回来的合法 id，按注册表校验会把它误拒成 `1m`。
**残留边界（登记，非遗漏）**：① 若某自定义周期被删除（`forgetCustomInterval`）且其 id 正是持久化的当前周期，重载后注册表不含它 → `getTimeframe` 走既有 `'1m'` 回退（不崩，但该周期的显示与聚合口径退化为 1m）；② 本轮偏好为**全局**，**不进布局快照**（`layoutSnapshot.ts:232-257` 的 `captureSnapshot` 仍不含显示偏好）——若日后要「按布局存偏好」或「应用到全部图表」，属 B3 / 快照扩展，另立项。

**门禁**：`npm run verify` 绿（typecheck 0 错 / oxlint 368 文件 0 错 0 警告 / format:check 绿 / 单测 **83 文件 1318 例**）；E2E `--retries=0` **60 例全过、27 面黄金截图零 diff**（新增 `settings.spec.ts` 的「图表设置偏好跨刷新保留」）；`npm run build` 最大应用块 498.08 kB / gzip **141.86 kB**（≤150 kB 口径内；距 500 kB 未触发警告的原始体积裕度只剩 1.92 kB，已在 README 标注）。
**证据链（变异探针，不用「看起来对」充当证明）**：单测 `tests/unit/chart-config-prefs.test.ts` 9 例 + E2E 1 例逐条打过变异——① 把 `comparePickerOpen` 放进落盘切片 → transient 用例失败；② 把 `gridMode` / `timeframe` 的校验换成直传断言 → 坏枚举用例与自定义周期用例各失败；③ 让 `loadPrefs()` 直接返回默认值 → E2E 跨刷新用例失败（`settings.spec.ts:78`）。三处变异后均已还原并复跑全绿。顺带勘正 README 命令表遗留的「81 文件 / 1305 例」（三期-H 只改了基线段、漏改命令表，属同类文档-代码漂移）。

#### B1 交付记录（2026-10-12）

**改动（4 新 + 3 改，含 2 测试文件）**：
- `src/store/chartTemplateStore.ts`（新 133 行）：`ChartTemplate = {id, name, prefs: ChartPrefs, savedAt}`，键 `tradingpa.chartTemplates.v1`，上限 `MAX_CHART_TEMPLATES = 20`（图表模板是全局工作区快照，复用频次低于指标组合，故取比 `MAX_TEMPLATES = 50` 更紧的口径）；动作 save / apply / rename / delete 与指标侧同构（重名走 `resolveUniqueName` 追加序号、删除与重命名后显式写盘、写失败静默不阻断）。
- `src/store/chartConfigStore.ts`（272 → 279 行，**纯 additive**）：`ChartPrefs` 与 `slicePrefs` 改为导出，校验体从 `loadPrefs()` 抽成 `parseChartPrefs(v)`——**落盘读档与模板快照共用同一层不可信输入兜底**，不留第二套校验。
- `src/ui/NamedTemplateSection.tsx`（新 253 行）：模板分区呈现层（保存行 + 空态 + 行内重命名 + 删除二次确认，图标仍限 lucide-react、颜色仍走 CSS 变量），**自指标面板抽出**，不读任何 store；两个调用方各剩一个 store 适配器——`features/indicators/TemplateSection.tsx`（216 → 29 行）与新 `features/settings/ChartTemplateSection.tsx`（40 行）。
- `src/features/settings/ChartSettingsDialog.tsx`：`TABS` 加第 6 项「模板」，pane 内挂 `<ChartTemplateSection />`。

**应用语义（B0 的收益在此兑现）**：`applyTemplate` 只做一件事——把快照 `setState` 进 `chartConfigStore`。偏好落盘由 **B0 的单点订阅**承接（模板 store 不碰 `chartPrefs.v1`，写盘路径仍唯一）；画布五项经对话框既有的「renderer 就绪即下发」effect 同帧推给引擎，周期 / 类型 / 图例 / 显隐由各消费方读 store 跟随。**未新增任何引擎 API**。

**为什么抽共用件而不是复制一份**：该分区是 216 行的完整形态，复制即造第二个口径漂移点，且 `src/ui/primitives.tsx` 本就有同类共用件。风险在于**指标面板不在 27 面黄金截图内**（无面板态的面），共用化不能只靠截图回归——故补了一条**指标侧 E2E 契约回归**（空态 / 空名置灰 / 重名序号 / 行内重命名 / 删除确认 / 落盘键），把「行为中性」变成被测面而不是断言。

**门禁**：`npm run verify` 绿（typecheck 0 错 / oxlint 0 错 0 警告 / format:check 绿 / 单测 **84 文件 1332 例**，+14 例来自 `tests/unit/chart-template-store.test.ts`）；E2E `--retries=0` **62 例全过、27 面黄金截图零 diff**（新增「图表模板保存与跨刷新应用」「指标模板分区契约（共用呈现层回归）」）；`npm run build` 应用块 **500.61 kB / gzip 142.79 kB**——原始体积**越过 Vite 的 500 kB 警告阈值**（+2.53 kB；B0 时已标注裕度只剩 1.92 kB，本次如期兑现），gzip 仍在 ≤150 kB 口径内。
**变异探针（7 处，逐条还原后复跑全绿）**：store 侧——① `applyTemplate` 去掉 `setState` → 应用写回 1 例失败；② 快照校验换成 `t.prefs as ChartPrefs` → 坏枚举逐字段回落 1 例失败（证实「共用 `parseChartPrefs`」是被测面而非注释）；③ `resolveUniqueName` 的重名分支短路 → 序号 2 例失败；④ `persistTemplates` 去掉 `setItem` → 落盘与容量 4 例失败；⑤ 三处 `slice(0, MAX_CHART_TEMPLATES)` 换成 `Infinity` → 上限 2 例失败。呈现层侧——⑥ `ChartTemplateSection` 的 `onApply` 接成空函数 → 图表模板 E2E 失败（证明页签真连 store 动作，不只是渲染出行）；⑦ 指标适配器的 `onRename` 接成空函数 → 指标契约 E2E 失败（证明共用化后指标侧仍真连 `indicatorStore`）。另有一处非探针的自证：单测初稿的 `setTimeframe('1h')` 被 `tsc` 判非法（联合类型是 `1H`），而 vitest 不做类型检查会**放过这条无效断言**——偏好类字段的测试值必须过 typecheck。

**登记（非遗漏）**：① 模板继承 B0 的两条边界——偏好为**全局**、不进布局快照；被删除的自定义周期若正被某模板引用，应用后 `getTimeframe` 走既有 `'1m'` 回退。② 模板**不含品种 / 布局 / 指标组合**（快照单元 = `ChartPrefs`），与指标对话框的模板是两套独立存档。③ 构建原始体积警告待裁决：接受警告 / 提 `chunkSizeWarningLimit` / 拆动态 import，本轮**未动 build 配置**。④ 「警报提示音开关能力在、UI 入口无」为 B1 取证新发现，已单列表行（0.5 人日，归属待裁决）。

#### B2 交付记录（2026-10-12）

**改动（3 新 + 14 改；含 4 个测试文件）**：
- `src/store/tradeSettingsStore.ts`（新 135 行）：四字段偏好 `defaultQty` / `stopOffsetPct` / `initialBalance` / `showTrading`，键 `tradingpa.tradeSettings.v1`（含 `version: 1`，与 chartPrefs / chartTemplates 同口径）。`TRADE_LIMITS` 是**一份上下限两处用**：读档 clamp 与 UI `NumberStepper` 的 min/max 都取它，不留第二套口径。setter 只做 `round()` 归一（步进器 `value ± step` 真会产生 `0.01+0.01 → 0.010000000000000002` 这类噪声），**不在 setter 重复 clamp**——clamp 属于不可信输入边界（localStorage），区间内的手输值不该被静默改写。落盘仍走 B0 立起来的**单点订阅**（比对整片四字段，变化才写）。
- 六处硬编码接入 store：`OrderDialog` 的 `qtyNum` prop 整体删除（该 prop 全仓唯一实参就是 `TradePanel.tsx` 的 `qtyNum={0.01}`，删 prop 才算真收口，否则只是把硬编码往上挪一层），数量与止损默认都直读 store；`ChartOrderMenu`、`ReplayBar` 各读 `defaultQty`；止损默认由 `price * 1.01` 改为 `price * (1 + stopOffsetPct / 100)`；`tradeStore` 的引擎构造与 `reset()` 都取 `initialBalance`（`reset` 原来是「无参 = 保留当前余额」，现一律回到当前偏好值）。
- `src/features/settings/ChartTradingSection.tsx`（新 69 行）+ `src/ui/controls.tsx`（`SettingRow` 由对话框私有上提为共用件，两处调用）：三行数值 + 一个显隐开关 + 「何时生效」提示。
- **引擎侧 additive 链（1 字段 + 2 方法 + 1 回读）**：`ChartState.tradingVisible = true` + `setTradingVisible()`（跟 `bordersVisible` / `hideStudies` 同一约定）；`RenderPipeline` 把 `drawTrading(...)` 整层包进该旗标；命中测试**单点收敛**在 `TradeGesture.hitAt`（三个消费方都走它：悬停 `HoverController.ts:143`、按下路由 `TradeGesture.ts:92`（由 `InputController.ts:182` 调用）、右键下单守卫 `InputController.ts:301`），故只在 `hitAt` 前置一行，不在三个调用点各设一道守卫；`ChartController` 加 `setTradingVisible()` 与 `get tradingVisible()`（回读口径与 `watermarkOn` / `studiesHidden` 一致，专供 E2E 证接线）。默认 `true`，27 面黄金截图零 diff 由单测证明而非假设（关档帧内仍有图例商品行文字，只是交易层消失）。

**播种口径：挂载生命周期，不是 effect**。偏好变化后要让下次打开的表单拿到新值，最省事的写法是在 `useEffect` 里 `setQty(defaultQty)`——那正是 `react(set-state-in-effect)` 规则的形状（三期-H 刚归零）。改为依赖既有事实：**Radix Dialog 关闭即卸载子树**、**`ChartOrderMenu` 拆成 gate（`!open` 返回 `null`）+ `OrderForm`**、**`ReplayBar` 由 `replayActive` 条件挂载**（`ChartWorkspace.tsx:268`）。于是「打开」本身就是一次全新挂载，初值天然取当前偏好，无需 effect、无需 remount key。**行为副作用（已核对无测试依赖）**：浮窗的买/卖方向与市价/限价档不再跨次打开保留，每次回到 买入 + 限价。

**门禁**：`npm run verify` 绿（typecheck 0 错 / oxlint **375 文件 0 错 0 警告** / format:check 绿 / 单测 **85 文件 1344 例**，+12 例 = `tests/unit/trade-settings.test.ts` 9 例 + `renderer-input.test.ts` 2 例 + `gestures.test.ts` 1 例）；E2E `--retries=0` **63 例全过、27 面黄金截图零 diff**（新增「交易页偏好跨刷新保留并流入下单表单」）；`npm run build` 应用块 **503.85 kB / gzip 143.80 kB**——gzip 仍在 ≤150 kB 口径内，原始体积继续落在 B1 已登记的 500 kB 警告阈值之上（+3.24 kB，同一未裁决项，本轮仍未动 build 配置）。

**变异探针（10 处，逐条还原后复跑全绿；每次只杀命中的那条，其余用例全过）**：
- 引擎链——① `RenderPipeline` 的 `if (st.tradingVisible)` 换成 `if (true)` → `renderer-input` 关档帧用例失败（关档后 `限价` 标签仍在帧内）；② 删 `TradeGesture.hitAt` 的显隐前置行 → `gestures` 隐藏态用例 + `renderer-input`「隐藏时挂单线不可点」用例共 2 例失败；⑤ `ChartController.setTradingVisible` 方法体清空 → `renderer-input` 的显隐 2 例失败 + `settings.spec.ts:252` 引擎回读 poll 失败（收到 `true`）；`gestures` 的隐藏态用例**不受影响**（它直接构造 host 字面量、不经 `ChartController`），故该处变异单独证明的是「控制器委托到 ChartState」这一环，与 ② 证明的命中守卫不是同一件事。
- store 与偏好流——③ 去掉订阅里的 `savePrefs(next)` → 落盘用例 + 浮点噪声用例 2 例失败；④ `readNumber` 去掉 clamp 直返 → `TRADE_LIMITS` 用例失败（`1e12` 未回落到 `1e6`）。
- 页签与调用点——⑧ `{tab === '交易' && <ChartTradingSection />}` 换成 `null` → `settings.spec.ts:226` 页签初值用例失败；⑥ `OrderDialog` 数量初值改回 `'0.01'` → `:276` 失败；⑦ 止损默认改回 `price * 1.01` → `:280` 失败（得 `1294.63`，非 2% 口径）；⑨ `ChartOrderMenu` 数量初值改回 `'0.01'` → `:294` 失败（第六个调用点的独立证据，此前该文件无任何测试覆盖）；⑩ 把 gate 的 `if (!open) return null` 换成 CSS `display:none` 常驻挂载 → `:302`「关掉再开回到 限价档」失败（证明「按打开生命周期重新播种」是被测面，不是注释里的说法）。

**登记（非遗漏）**：① **手续费 / 滑点没有开关**，且是有意不做——`paperEngine` 无此概念，加了只能是假开关（文件头注已写明）。② **交易偏好不进 B1 图表模板**：B1 的快照单元是 `ChartPrefs`，`ChartTemplate` 不含 `tradeSettingsStore` 切片，故「应用模板」不会带动默认数量 / 初始资金 / 可视化显隐。要不要扩快照单元（以及是否算 B1 交付记录的口径变更）**待裁决**，本轮不擅自改既有存档 schema。③ `showTrading` 的下发只覆盖**主图 renderer**，与 B0 画布五项目前同样的边界一致；多图表「应用到全部」另立项。④ `initialBalance` 只在 `reset()` 时生效，已有持仓/余额不被追溯改写（提示文案已写明）。⑤ 浮窗方向/档位每次重置（见上方行为副作用）。

#### B3 交付记录（2026-10-12）

**裁决口径**：用户裁决「**仅显示层**（推荐）」——新增 tz 偏好默认 = 浏览器本地（27 面默认零 diff 可证），只改 `formatTime` / 十字光标时间标签 / StatusBar 时区标的读时口径，并同步 `drawAxes.ts` 的**跨年判定**；`calendarTzOffsetMinutes` 的归桶时区**不动**。

**改动（2 新 + 12 改；含 5 个测试文件）**：
- `src/engine/renderer/drawAxes.ts`（**275 → 300 行**）：新增 `TimeDisplay { hour12, tzOffsetMinutes }` + `DEFAULT_TIME_DISPLAY` + `tzDate(time, off)`；`formatTime` 第 4 参由 `hour12: boolean` 换成 `display: TimeDisplay`（缺省值保持旧行为），全部读数改用 UTC getter；`drawTimeAxis` 的跨年判定同口径换 `tzDate(bar.time, display.tzOffsetMinutes).getUTCFullYear()`（`:135`）——**判定与标签必须同口径**，否则 12 月 31 日 16:00 UTC 这类瞬间在 +14 档下标签已滚到 1 月 1 日而判定仍算 2024，年标记位置分裂。
- **引擎 additive 链（1 字段 + 1 setter + 1 回读 + 2 消费点）**：`ChartState.tzOffsetMinutes = null`（`:80`）+ `setTzOffsetMinutes()`（`:364`，写状态 + `invalidate()`）；`ChartController` 加 setter（`:382`）与 `get tzOffsetMinutes()`（回读口径同 `watermarkOn` / `studiesHidden` / `tradingVisible`，专供 E2E 证接线）；`RenderPipeline` 把原 `hour12` 单参**成组**为 `timeDisplay`（`:89`）并同时下发 `drawTimeAxis`（`:130`）与 `drawCrosshair`（`:225`）；`crosshairOverlay.drawCrosshair` 第 10 参由 `hour12` 换成 `display`。
- **为什么成组传而不是加第 11 个位置参**：`drawCrosshair` 已在 `max-params: 10` 上限，再加一位要么违规、要么添**第三条 lint disable 台账**（台账现 2 条：三期-A 逐条登记 3 条，三期-H 以代码结构消除 1 条）。把两个「时间标签显示口径」合成一个对象是台账不增口径下的正解，不是绕开规则；对调用方仍是 additive（参数位置不变、末位类型换成带缺省值的对象）。
- `src/store/chartConfigStore.ts`（279 → **300 行**）：`ChartPrefs.tzOffsetMinutes`（默认 `null`）、`readTzOffset`（`:91`，两分支合一：非有限数与坏值同样返回 `null`）、导出 `TZ_OFFSET_LIMITS = { min: -720, max: 840 }`（`:87`）——**一份上下限两处用**（读档 clamp 与「一般」页步进器 min/max，B2 的 `TRADE_LIMITS` 同例）。真实固定偏移档是 UTC−12 ~ UTC+14，半小时档（+5:30 = 330）由 `step=30` 与手输覆盖。**键不变、不换 schema**：旧档缺该字段经 `parseChartPrefs` 自然补出 `null`。落盘仍走 B0 的单点订阅。
- `src/features/settings/ChartGeneralSection.tsx`（新 **66 行**）+ 对话框 `TABS` 加「一般」（现 **8 页**，`:16`）：分段「浏览器本地 / 固定偏移」+ 条件出现的分钟步进器 + 口径提示。**两态而非三态**（不做独立 UTC 段）的理由：值域里 `0` 是合法固定偏移，三态会让「UTC 段」与「固定 0」互相吞——从 UTC 点自定义会弹回 0，是自我否定的 UI；故「填 0 即 UTC」写进提示而非做成按钮。
- `src/features/market/StatusBar.tsx`（275 → **285 行**）：`timeZoneLabel` 由无参改收 `tzOffsetMinutes`（`:47`），`null` 档化简回改造前表达式；该值**直读 store 而非加 prop**（`:84`）——理由是同目录 `ChartContextMenu` 已确立「持久化偏好直读 store、宿主只装配不转手」的口径。
  **一处口径勘正（本行初稿写错，已改）**：初稿把「不加 prop」的理由写成「宿主 `ChartWorkspace.tsx` 已满 300 行红线，加 prop 即越线」——经核 README:121-124，**文件级 ≤300 行的自定义门禁已于 2026-10-08 退役**（改为函数级 `max-statements 60` / `max-params 10`，且 `ChartController.ts` 现 894 行、经三次裁决判为健康），`ChartWorkspace.tsx` 的 300 行只是巧合数字，不构成红线；`docs/PLAN-TECH-DEBT-CLOSEOUT.md:12` 的「每模块 ≤300 行」是当时的施工约定、非现行门禁。决策本身（直读 store）不变，但**理由必须是真的那个**。
  新增 `data-testid="status-tz"` 供 E2E 锁读数。

**默认档等价性（27 面零 diff 的凭据，不是假设）**：`tzDate(time, null)` 先把该瞬时的 `-local.getTimezoneOffset()` 折进时间戳、再一律用 UTC getter 读，与改造前的 `d.getHours()` / `getDate()` **逐位相同**（DST 由浏览器按该瞬时就地算，不是我方查表）。该性质在 **`vi.stubEnv('TZ', …)` 把进程时区切到 America/New_York（带 DST）与 Asia/Kolkata（半小时档）** 的进程里证明，故不是「本机恰好在 UTC+8 才相等」；画面侧再由 `price-axis-pos.test.ts` 的「默认档与该瞬间本地偏移档逐标签相同」钉住。探针 ⑧ 的实测反向印证了这条链：**只把 `?? -local.getTimezoneOffset()` 换成 `?? 0` 就杀 8 例跨 3 文件**。

**测试（+19 单例 / +1 E2E 用例）**：`tests/unit/time-tz.test.ts`（**新 11 例**：折算、DST、半小时档、`formatTime` 日内/跨日/`hour12` 正交/缺省等价、`drawTimeAxis` 年标记两档对照、`TZ` 桩还原守卫）、`price-axis-pos.test.ts`（**+2**：store→ChartState→RenderPipeline→轴与十字光标的**画面级读数链**，换档后逐标签整体平移同一档差——任一处丢 `display` 就红）、`chart-config-prefs.test.ts`（**+4**：旧档回落 / 双向落盘含显式 `'"tzOffsetMinutes":null'` / clamp 与坏值（`'UTC+8'`、`1e999`、`330.7`）/ 坏值只改本字段）、`chart-template-store.test.ts`（**+1**，见下方「探针无牙」教训）、`chart-state.test.ts`（**+1**：setter 落状态并请求重绘）。E2E `settings.spec.ts:308`「一般页时区偏好落盘并流入引擎与状态栏」串起 10 个断言点：默认档引擎收 `null` → 状态栏 = 浏览器本地 → 步进器不出现 → 切固定档起算值 = 当前本地偏移 → 半小时档 330 **三处同向**（引擎 / 状态栏 `UTC+5.5` / localStorage）→ 刷新读回 330 → `0` 档 = `UTC+0` → `5000` clamp 到 840 = `UTC+14` → 回本地三处归零。状态栏期望值由页面自身偏移算出（`localLabel()`），不写死 `UTC+8`，CI 换时区不会假失败。

**门禁（2026-10-12 实跑）**：`npm run verify` 绿（typecheck 0 错 / oxlint **377 文件 0 错 0 警告** / format:check 绿 / 单测 **86 文件 1363 例**，+19 例）；E2E `--retries=0` **64 例全过、27 面黄金截图零 diff**；`npm run build` 应用块 **505.87 kB / gzip 144.60 kB**——原始体积自 B1 起**持续**越过 500 kB 警告阈值，现高出阈值 **5.87 kB**（增量：B1 +2.53、B2 +3.24、B3 +2.02；同一未裁决项，本轮仍未动 build 配置），gzip 仍在 ≤150 kB 口径内。

**变异探针（20 处，逐条还原后复跑全绿；每处先 `diff` 确认变异真落地，再看杀了谁）**：
- 引擎显示链——① `ChartState:365` 去掉 `this.tzOffsetMinutes = offset` → 2 例失败（`chart-state` + `price-axis-pos`）；② 去掉该 setter 的 `invalidate()`（`:366`）→ `chart-state` 1 例（重绘请求计数）；③ `RenderPipeline:89` 构造里 tz 恒 `null` → 读数链 1 例；④ `:130` `drawTimeAxis` 调用点丢 display → 1 例；⑤ `:225` 十字光标调用点 tz 恒 `null` → 1 例；⑥ `crosshairOverlay:55` 内部 `formatTime` 丢 display → 2 例；⑦ `ChartController:383` 委托体清空 → 1 例。**④⑤⑥ 三处各自独立命中**，证明轴与光标两个消费点都有被测到，而不是只测一处再由注释推断。
- 折算与读数——⑧ `tzDate` 的 null 分支折成 `?? 0` → **8 例失败跨 3 文件**（含「默认档 ≡ 该瞬间本地读数」两条等价性用例，正是 27 面零 diff 的凭据链）；⑨ `formatTime` 日内小时读数丢 display（`:293`/`:294`）→ 2 例；⑩ 跨年判定回 `new Date(bar.time).getFullYear()` → `time-tz` 的「+14 档年标记前移」**仅 1 例**（这条是「仅显示层」裁决点名的同步项，其余 10 例不受影响，说明该判定确实只有这一处被测面在守——覆盖面窄这件事本身已登记）。
- 落盘与快照——⑪ `parseChartPrefs:150` 不解析 tz（恒默认）→ 3 例失败跨 2 文件；⑫ `readTzOffset:93` 丢 clamp/取整 → 1 例；⑬ `slicePrefs:171` 丢 tz → 2 例（落盘往返 + 模板快照）。
- 页与状态栏（E2E，`--retries=0 -g` 单例跑）——⑭ 对话框 `:86` 不下发引擎 → 失败于 `settings.spec.ts:346`（`Expected: 480 / Received: null`）；⑮ `:199` 「一般」页不挂载 → 失败于 `:338`（元素不存在）；⑯ StatusBar `:103` 忽略偏好（恒传 `null`）→ 失败于 `:352`（`UTC+5.5` → `UTC+8`）；⑰ `toFixed` 起算改 0 → 失败于 `:345`（步进器播种 `480` → `0`）；⑱ 偏移行的 `tzOffsetMinutes !== null` 恒真 → 失败于 `:339`（`toBeHidden`）；⑲ 回本地写成 `0` 而非 `null` → 失败于 `:383`；⑳ 分段 `value` 恒 `'local'` → 失败于 `:367`（刷新后「固定偏移」`aria-checked` 为 false）。
- **两处诚实记录（不构成额外证据）**：⑱ 与 ⑲ 打的是**同一性质的两个点位**——「步进器可见性 ⟺ 偏好为 `null`」：⑱ 在默认档的 `:339` 先失败、⑲ 在回本地后的 `:383` 失败；⑲ 后面 `:384` 的「引擎归 `null`」断言因顺序靠后未及执行，所以 ⑲ 实际被观测到的证据只有「隐藏」这一半。⑦ 只证明「控制器委托到 ChartState」这一环，与 ③ 证明的「管线把 state 读进 display」不是同一件事（与 B2 记录里的同类分工同口径）。
- **一处探针无牙的教训**：模板快照那条测试初稿直接在内存里 `applyTemplate`，**绕过了 `parseChartPrefs`**，故 ⑬ 当时杀不到它；改成「重读 localStorage 构造新 store 后再应用」才有牙（现在 ⑪⑬ 都会杀掉落盘往返 + 模板两条）。另有一处**探针假通过**：② 的首版 sed 表达式没匹配到源码（且当时无备份可比对），表现为「变异后仍全绿」——若按观测直接结论就是「该断言没牙」，实为**变异未落地**；改用行号定位删除（`366d`）才杀掉。故本轮每处变异先 `diff` 打出 `MUT-APPLIED` 再解读结果（观测 ≠ 机制）。

**登记（非遗漏）**：① **列表类时间不在本页口径内**——回放条、成交记录、警报时刻、布局存档时间仍按浏览器本地读数（「仅显示层」裁决的边界，页内提示已写明，避免被当 bug 报）。② **显示层与归桶层分离**是本批有意保留的口径分裂：切到 +14 档后，时间轴标签的日期可能与周/月桶的日历日期差一天（归桶按 `data/tz.ts` 的市场口径：crypto 走 UTC、其余走浏览器本地，**不受显示偏好影响**）。③ **旧模板应用即回落本地**：B1 交付时存档的模板 `prefs` 无该字段，应用后 `parseChartPrefs` 补出 `null`——这是「旧档自然隔离」口径的直接后果，`chart-template-store.test.ts` 已钉住。④ tz **只下发主图 renderer**，与 B0 画布五项、B2 `showTrading` 同一边界；多图表「应用到全部」另立项。⑤ 偏好仍为**全局**、不进布局快照（B0 登记项 ② 原样保留，B3 未做，「按布局存偏好」仍待另立项）。⑥ 引擎公开 API 只做 additive（新字段 + 新 setter + 新 getter + `drawCrosshair` 末位参数换形），未改任何既有签名语义。

#### B4 交付记录（2026-10-14，四项待裁决的落实批）

**裁决来源**：B 批收口后把四项未裁决项连同实测证据逐条提交，用户当场裁定——① 构建体积 = **提阈值并登记预算**；② 交易偏好 = **不进图表模板快照单元**；③ 提示音入口 = **补「警报」页签**（本批唯一功能面）；④ Playwright `retries` = **归零**。②是纯登记（零代码）、④是一行配置加一处连带、①③各有实做。

**改动（1 新源文件 + 3 改文件 + 2 测试文件）**：
- `src/features/settings/ChartAlertSection.tsx`（**新 36 行**）：一个 `CheckRow` + 一段口径提示。值**不换主人**——`soundEnabled` 一直由 `alertStore` 持有并随 v2 存档落盘（`alertStore.ts:67-73` 写、`alertPersist.ts:109-116` 读），本批只是把 `:172` 那个此前**零调用点**的 `setSoundEnabled` 接到 UI 上。引擎与 store 零改动，`check()` 的三行判定（`:185` 历史 / `:186` 通知 / `:187` 声音）逐字未动。
- `src/features/settings/ChartSettingsDialog.tsx`（**272 行**）：`:10` import、`:17` `TABS` 加「警报」、`:204` 挂载。页签插在「交易」与「模板」之间而非追加末位——模板是跨页快照的元页，保持在末位；对话框由 8 页 → **9 页**。
- `vite.config.ts`：`build.chunkSizeWarningLimit = **560**`（`:32`），取现值 506.49 + 约 54 kB 余量，量级按三期-C（数据窗口表格 + 画线剪贴板，估 5–7 人日）判。**这是提阈值而非关警告**：越过 560 仍会警告，与本仓 oxlint「存量 7 函数放宽至 120、>120 仍拦」同一哲学（README 规则段）。同时勘正 `codeSplitting` 头注里「存量债务：警告从未处理」的措辞——该项现已处理。
- `playwright.config.ts`：`retries: 1 → **0**`（`:20`）+ **连带** `trace: 'on-first-retry' → 'retain-on-failure'`（`:35`）。连带的理由是机制而非审美：`retries: 0` 下不存在第二次尝试，`on-first-retry` 永不产出 trace，那条配置连同它的注释会一起变成假话——保留等于把「flaky 排查有 trace」写成不成立的前提。改后失败即留 trace，探针已实证（见下）。

**②「不进」的理由（是不做，不是暂缓）**：`ChartTemplate.prefs` 的快照单元保持 `ChartPrefs` 的 14 字段。应用一个显示层模板会顺带改写**下单默认量 / 止损偏移 / 初始资金**——前两项直接决定下一笔真实点击的数量，初始资金决定回放会话的权益基线，三者都不是「换个外观」应当产生的副作用；而 `showTrading` 虽语义偏显示，一旦单独纳入就得解释「为何另外三值不跟」，反而让模板的边界变成特例。存档形态也因此不动（既有 `tradingpa.chartTemplates.v1` 零迁移）。代价登记在案：跨模板复用同一套交易默认值需手工再设一次。

**测试（+5 单例 / +1 E2E 用例）**：`tests/unit/alert-sound-pref.test.ts`（**新 5 例**；`vi.mock` 掉 `sound.ts` 与 `alertHistory`，并按 `vi.resetModules()` 重建 store——`alertStore` 在模块求值时读存档，不重建就测不到读档路径）钉住三件互不等价的事实：setter **同时**改内存与 v2 存档、存档值随初始化读回（含 v1 顶层数组旧档读回 `true`）、静音**只**关发声（历史登记照常）。第 ③ 件是本页的设计边界：若将来有人把「静音」实现成「不触发」，这条会红。E2E `settings.spec.ts:396`「警报页提示音开关落盘并跨刷新生效」串 7 个断言点（`:416`–`:434`）：默认 `aria-checked=true`（无存档即响 = 改造前行为）→ 页内口径提示在位 → 关 → 复选框 `false` → 存档 `soundEnabled:false` → 刷新后复选框与存档**两处**都仍是 `false`（值来自 store 初始化而非页面硬编码）→ 勾回 `true` 不留脏存档。

**门禁（2026-10-14 实跑）**：`npm run verify` 绿（typecheck 0 错 / oxlint **379 文件 0 错 0 警告** / format:check 绿 / 单测 **87 文件 1368 例**，+5 例）；E2E `--retries=0` **65 例全过、27 面黄金截图零 diff**（+1 例）；`npm run build` 应用块 **506.49 kB / gzip 144.87 kB**（B4 增量 +0.62 kB 原始 / +0.27 kB gzip），**500 kB 警告不再出现**（阈值 560 生效）；合计 gzip **257.21 kB**——口径本次写死：Vite 各产物块显示值相加、不含 `index.html` 的 0.35 kB（此前 README 的 256.94 kB 无该口径说明，按同法复算 B3 产物应为 256.90 kB，属显示值舍入差，非测量对象变化）。

**变异探针（12 处：store 侧 6 + 页与入口侧 4 + 配置侧 2 组；每处先 `diff` 打出 `MUT-APPLIED` 再解读结果）**：
- store 侧（`alertStore.ts` 行号定位）——U1 `:175` setter 不改内存（`return {}`）→ **2 例失败**（落盘往返 + 静音作用面）；U2 `:174` 跳过 `persist` → 1 例（落盘往返）；U3 `:115` 初始化忽略存档（硬编码 `true`）→ 1 例（「刷新读回」）；U4 `:187` 去掉 `&& soundEnabled`（静音无效）→ 1 例（静音作用面）；U5 `:187` 恒不发声 → 杀**对照面**那条（证明 U4 的 `not.toHaveBeenCalled` 不是空转，即「beep 本来就会响」这一前提被测过）；U6 `:185` 静音连带关历史（越界改动）→ 1 例（静音作用面，正是第 ③ 件事实的牙）。
- 页与入口侧（E2E `--retries=0 -g` 单例跑）——E1 `ChartSettingsDialog:204` 挂载条件改永假（页签仍在清单）→ 失败于 `settings.spec.ts:416`（元素不存在）；E4 `:17` `TABS` 去掉「警报」→ 失败于 `:411`/`:415`（导航按钮 click 超时 30 s）；E2 `ChartAlertSection:22` `checked` 恒 `true`（忽略偏好）→ 失败于 `:421`（`Expected: false / Received: true`）；E3 同位 `onChange` 换成空函数（入口没接上 setter）→ 同样失败于 `:421`。
- 配置侧（两项裁决各一组，均**不动现行配置**）——① 体积：`sed` 出 `chunkSizeWarningLimit: 500` 的临时副本、`--config` 跑构建，同一个 506.49 kB 块在 500 档**警告复现**、在 560 档不出现 ⇒ 「没有警告」是阈值在起作用，不是警告被结构性关闭；④ `retries`：临时用例（`expect(1).toBe(2)`）在现行配置下 attempt 行 **1 条**，副本配置 `retries: 5` 下 **6 条** ⇒ 配置值确实驱动重试次数；同一次运行顺带证明 `retain-on-failure` 会落 `trace.zip`。副本必须放**仓库根**——首版放 `.probe-bk/` 子目录，`testDir: './tests/e2e'` 随配置文件目录解析而改指他处，报「No tests found」（观测 ≠ 机制，此处是配置自身失效）。
- **两处探针未落地（本轮自证并重做，不构成证据）**：E1 首版 sed 的替换串含 `<ChartAlertSection />`，其中 `/` 与 sed 分隔符冲突 → `unknown option to 's'`，变异根本没写进去，表现为「E1 后测试仍通过」；E2 首版把 `checked={soundEnabled}` 定位到 `:21`，实际在 `:22`（`:21` 是片段 `<>`）→ 同样零落地、同样「假通过」。两处都是**先看 `diff` 才发现**（若无 `diff` 前置，结论会写成「该断言没牙」），改正后各杀 1 例。延续 B3 的同条教训并再证一次：**解读变异结果之前，必须先证明变异落地**。
- **覆盖面窄的自证**：U3 只杀「刷新读回」一条——「v1 旧档读回 `true`」那条用例在硬编码 `true` 下必然同过，故它对「初始化是否真读档」判别力为零，只覆盖「旧档形态不被误判成关」这一半。E2 与 E3 打的是**同一断言的两种破坏方式**（同 `:421`），属同一性质的两个点位，不计为两条独立证据。

**登记（非遗漏）**：① 提示音是**全局单值**，与裁决②同口径**不进** B1 图表模板快照。② 「警报」页只承载这一项：TV 警报设置页的其余维度（默认冷却时长、通知行为）本批未接——`cooldownMs` 仍按每条警报创建/编辑时设定（`alertStore.ts:131` 取 `DEFAULT_COOLDOWN_MS = 30_000`），要做全局默认位得先有落盘 store，本批不擅自扩页。③ 静音**只**关画布提示音；系统通知另由浏览器 `Notification` 权限决定（`alertStore.ts:84`），页内提示已写明，避免被当 bug 报。④ `tradingpa.alerts` 键名**不含 `.vN` 后缀**（版本在 JSON 内 `version: 2`），与 `chartPrefs.v1` / `tradeSettings.v1` / `chartTemplates.v1` 的键名口径不一致——存量形态，本批未动（换 schema 时再统一，改动会弃掉现档）。⑤ E2E 用例结束时勾回 `true`，不把静音态留给后续用例（同一 test 内 reload 后仍读回 `false`，脏存档风险在跨用例而非用例内）。

### 三期-C · 交互与数据面板（5–7 人日，估）

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| 数据窗口 Data Window | `AUDIT-TV-FEATURE-GAP:150`（P1，估 2–3）「Alt+D 弹窗：光标处全部指标/画线数值表 ／ 现状无（图例有 OHLCV + 叠加指标值）」；**宿主缺口已核**：crosshair 状态只在引擎内（`crosshair/Crosshair.ts` 的 barIndex/time/price，由 `HoverController.ts:146-152` 写入），React 侧仅收到跨图时间总线（`syncBus.ts:121` → `Chart.tsx:270-276`），**没有**任何「按 index 读值」的公开 API；指标读数链现成但只喂画布：`indicatorValuesAt(instance, bars, from, index)`（`drawIndicator.ts:161-175`）→ 图例（`RenderPipeline.ts:196-211`）与面板 tooltip（`PaneRenderer.ts:218`） | 采集 renderer 当前光标快照 → 数值表（全部指标 + 画线），需引擎侧 **additive** 读值口（公开 API 冻结口径下带默认值与回读）。**两项前提已由用户裁决定死（2026-10-14，OPEN-DECISIONS 同日 C 两行关闭）**：入口 = **不占快捷键**（Alt+D 仍归指标搜索 `useTvShortcuts.ts:144-146`；先按右轨图标 + 菜单入口交付，TV 快捷键重排另立专项）；宿主 = **右侧停靠面板**（新增第四个 `RightPanelId`，复用 `rightPanelStore.ts:4` 的挤压式停靠与 240–640 宽度存档，不做浮层） | 2–3 |
| 画线右键菜单三项 | `AUDIT-TV-UI-GAP:40`：TV 画线右键为「设置/克隆/移除/视觉顺序 + **复制/粘贴/锁定/设为默认**」，现 `DrawingContextMenu.tsx` 只有前者四项。**「含序列化」这个前提经核是半假半真——序列化不用新写**：`serializeDrawings` / `deserializeDrawings`（`drawing/types.ts:264-278`）已由 `exportDrawings` / `importDrawings`（`ChartController.ts:796-800`）暴露；**「锁定」引擎侧已全链就位、只缺菜单入口**：字段 `types.ts:86` → `DrawingLayer.setLocked`（`:179-181`）→ `ChartController.setDrawingLocked`（`:722`），另有全局档 `setDrawingsLocked`（`:305`）与对象树（`ObjectTree.tsx:150`）、画线设置对话框（`DrawingSettingsDialog.tsx:129`）两个消费点 | 补 **复制 / 粘贴 / 锁定** 三项：锁定是纯接线；粘贴需引擎侧 additive「按选中集新增（新 id + 偏移，单条历史）」，因 `importDrawings` 是 `replaceAll` 语义、与粘贴不同构（现成偏移惯用法见 `duplicateDrawing` `ChartController.ts:681-698`）。**→ 2026-10-14 C1 已交付**（含一处开工前没预见到的锁定缺陷，见下交付记录） | 2 |
| 十字光标多面板 | 已按面板 priceScale 换算（`HoverController.ts:148` `pane.priceScale.yToPrice(y - pane.y)`；`drawCrosshair.ts` 实为 11 行 re-export 桶文件） | 无缺口 | 0 |

**C 前提校准（2026-10-14，开工前逐行核实，修正本节初稿三处引用与两处前提）**：
① **出处写错文件**：初稿把数据窗口记作 `AUDIT-TV-UI-GAP:150`——该行实为 §5.4「E2E 回归修复」小节标题，UI-GAP 全文只在 `:108` 的来源清单里提过「对象树/数据窗口」一次，**没有数据窗口缺口条目**；真出处是 `AUDIT-TV-FEATURE-GAP:150`。
② **「Alt+D 零 src 命中」是真的但会误导**：命中的是标识名（全仓无 data window 字样），而 **Alt+D 这个键已被占用**——`useTvShortcuts.ts:144-146` 把 Alt+D 绑到 `onOpenIndicators`（指标搜索）。所以数据窗口不是「加一条快捷键」而是**换键或让位**，属用户可感知的行为变更，已登记为待裁决（见 OPEN-DECISIONS 同日 ① 行），不擅自改。
③ **画线三项的正确出处是 `:40` 不是 `:36`**：`:36` 讲的是图表右键菜单的 14 项面，且其右列「仅 5 项」已陈旧（同文 `:132` 记录该菜单已重写为 12 项，实数经核为 12 项 + 4 条分隔线（项 `ChartContextMenu.tsx:111-230`、分隔线 `:131/:162/:198/:219`））。同时记一笔陈旧口径的处置：审计文档的「现状」列按只追加纪律**不回写成本**，仅在需要时补当次核实值。
④ **两项前提的实质差别**：复制/粘贴/锁定不是同一件事的三个对称面——锁定是**已交付能力的最后一个入口**（零引擎改动），复制/粘贴才需要新的 additive API 与「剪贴板载体」选型（应用内内存 vs 系统剪贴板；`navigator.clipboard.readText` 全仓零命中，现仅有一处 `writeText` 在 `ChartContextMenu.tsx:80` 复制价格用），已登记为待裁决（同日 ② 行）。
**C1 交付记录（2026-10-14，画线右键「复制 / 粘贴 / 锁定」）**

**① 开工前该说的一件事：锁定不是「纯接线」。** 本节初稿（以及上表「锁定是纯接线」那句）把锁定当成菜单项接上现成的 `setDrawingLocked` 即可，行号核实没查出问题——因为缺口不在缺口的入口，而在**命中层**：`hitTest.ts:40` 跳过锁定对象，而右键路径（`InputController.ts`）用的正是这个 `hitAt`，于是**锁上去的线在画布上再也点不中**，右键会穿到图表菜单，「解锁」只剩对象树一条路。这是单向门，且此前没有任何测试覆盖（对象树那条路本身是通的，所以观测层面看不出缺陷）。C1 因此带了一处引擎 additive：`hitDrawings` 末位加参 `includeLocked = false`（缺省旧语义逐位不变），新 `menuHitAt` 只在右键路径启用。登记该缺陷为**本批修复、非本批立项**。

**② 改动清单（引擎 4 处 additive + 状态 1 处 + 菜单 1 处，无新文件）**：
- `hitTest.ts:36`（形参）/ `:40`（跳过条件 `d.locked && !includeLocked`）/ `:26`（为何存在的注释：单向门）。
- `DrawingGesture.ts:187-190` 新 `menuHitAt`：与 `hitAt` 共用同一条全局锁守卫（`drawingsLocked()`），唯一差别是带 `includeLocked`；编辑/拖拽/放置仍走 `hitAt`，「锁定即不可动」口径不变。
- `InputController.ts:314` 右键命中由 `hitAt` → `menuHitAt`；`:279` 双击**刻意保留** `hitAt`（锁定对象不弹画线设置，与不可动同口径；解锁入口在右键）。
- `DrawingLayer.ts:236-256` 新 `paste(list, dt=0, dp=0)`：逐条取新 id（`dw_${++seq}` + `taken` 去重，来档 id 重复也不撞名）、points/style/levels 三者各深拷、**整组一次 `snapshot()`**（两条 = 一步撤销）、粘贴体成为选中集、空表返回 `[]` 且不压快照。
- `ChartController.ts:682-689` 把克隆位移抽成 `drawingShift()`（3 根 bar + 可视区间 2%），克隆与粘贴共用，避免两条「同址重叠」口径各自漂移；`:701` 顺带修 `duplicateDrawing` 丢 `levels`（见 ⑤）；`:808-811` 新 `exportDrawingsByIds`（子集筛选留在引擎内，格式与 `exportDrawings` 同源）；`:822-830` 新 `pasteDrawings(raw): number`（**与 `importDrawings` 不同构**：后者 `replaceAll` 清空，前者追加；0 条不广播不重绘）。
- `drawingStore.ts:16/:23/:33/:40` `clipboard: string \| null` + `setClipboard`——**不落盘**（裁决③），刷新即空。
- `DrawingContextMenu.tsx` 菜单 4 项 → 7 项：`:86-90` 复制、`:92-102` 粘贴（`:95` `disabled={!clipboard}`，灰字 `:198` `disabledStyle` 沿用 `LayoutSaveMenu.tsx:105` 口径——Radix 的 `disabled` 只给行为不给观感）、`:130-134` 锁定/解锁（标签与图标读 `:24` 的**当帧** `listDrawings()`，菜单每次开帧重算，不存在读到上一帧的陈旧态）；`:32-38` `copyTarget` 的整组语义（右键对象在多选集内 → 复制整组，否则只复制它自己）。

**③ 三项裁决落地情况**：③ 剪贴板载体 = 应用内内存 → 本批交付（`drawingStore.clipboard`，无 `localStorage` 键）；① 数据窗口入口 = 先不开快捷键、② 宿主 = 右侧停靠面板 → 均属 C2 范围，本批**未动** `useTvShortcuts.ts`（Alt+D 仍归指标搜索）与 `rightPanelStore.ts`。

**④ 测试（+9 单例 / +1 E2E 用例；全量 87 文件 1377 例 / 66 E2E）**：`gestures.test.ts:339`（单对象锁定 `menuHitAt` 命中而 `hitAt` 为 null；全局锁定态两者皆 null）；`drawing-interactions.test.ts:472`（层侧 4 例：新 id + 平移 + 保真 + 深拷、两条 = 一步撤销与 redo、空表不脏撤销栈、来档重名仍各取新 id）、`:547`（renderer 侧 4 例：`exportDrawingsByIds` 子集与往返、`pasteDrawings` 追加非替换 + 落点偏移 + 成为选中 + 与 `importDrawings` 对照、坏档 0 条且不广播、`duplicateDrawing` 带走档位）。E2E `interactions.spec.ts:101` 串五段：空剪贴板粘贴项在位但 `aria-disabled=true` → 锁定后右键仍出画线菜单（该项已是「解锁」，直接钉 ①的单向门）→ 复制→粘贴行数 +1 → Ctrl+点击并入多选集后整组复制 +2 → 刷新后剪贴板与画线同空。

**⑤ 变异探针（18 处；每处先 `diff` 对照**变异前快照**证明落地，跑完按字节还原并 `diff -q` 校验）**：
- 引擎侧 12 处：`includeLocked` 失效（`d.locked && !includeLocked` → `d.locked`）、`menuHitAt` 去掉全局锁守卫、`paste` 复用来源 id（连 `taken` 去重一起摘）、`paste` 的 levels 共享引用 / levels 整行删除 / style 共享引用 / points 共享引用（4 处深拷面）、`paste` 不压 `snapshot()`、`paste` 不置 `selectedIds`、`paste([])` 守卫删除、`duplicateDrawing` 丢档位行、`exportDrawingsByIds` 筛选失效（`filter(() => true)`）、`pasteDrawings` 空档守卫删除。
- 菜单与输入侧 6 处（E2E 单例跑）：粘贴项 `disabled={false}`、复制项 `onSelect` 换 `onClose`（不写剪贴板）、`toggleLock` 恒锁、`copyTarget` 忽略多选集、右键路径退回 `hitAt`（**单向门复现**）、菜单锁定态恒读 `false`。
- **首轮 18 处里 2 组逃逸，据此补强测试（本批最有价值的产出）**：(a) `paste` 的三条深拷面（levels 共享 / levels 删除 / style 共享）**全无人报警**——原用例粘的是 `JSON.parse(serializeDrawings(...))` 得到的**存档对象**，它与原体本就零共享，浅拷也脏不到原体；而 `{ ...src }` 展开已顺带把 `levels` 带过来，「值保真」断言对删行无感。改为**再粘一次层内活对象**并改其 style/levels/points（`:488-505`）后，四处各杀 1 例。(b) `pasteDrawings` 的空档守卫同样逃逸：0 条时广播与否不影响任何既有断言。加 `onDrawingsChanged` 计数（`:593-605`：坏档循环后断 0，再用真粘贴断 1，防「监听器压根没接上」让 0 变成空转）后杀 1 例。两句教训合一：**断言要打在「被保护的性质」上，而不是打在恰好可观测的性质上**——存档往返能测的只有值保真，深拷只能用共享引用去测。
- 另记一次**探针工具自身的失效**（不是被测代码的）：首版探针脚本用 `if diff -u ... | tail` 判「变异是否落地」，管道退出码取的是 `tail` 而非 `diff`，于是**每次都走 NO-OP 分支**、把已落地的变异报成没落地；改为 `diff -q` 直接比较后正常。与「副本配置必须放仓库根」同类：**探针的前置校验也要被验尸**。

**⑥ 顺带修正（本批发现、非本批立项）**：`duplicateDrawing`（右键「克隆」）此前不带走自定义 `levels`，而 Ctrl+拖动克隆（`cloneDrawing`）带走——同一功能两个入口口径分裂；`ChartController.ts:701` 一行补齐，并单立一例（探针「丢档位行」专杀它）。

**⑦ 登记（非遗漏）**：① TV 画线右键的**「设为默认」仍未做**（`AUDIT-TV-UI-GAP:40` 明列），本批按 PLAN 原范围只补三项。② 粘贴体**保留锁定态**（保真优先于「粘出来就能改」），故连粘两次得两条锁定线、需逐条右键解锁；该口径已用单例钉住，将来若改成「粘贴即解锁」这条会红。③ 剪贴板只存画线序列化串，不做跨标签/系统剪贴板共享（`readText` 需权限提示，裁决③明确不做）。④ 双击锁定对象不弹画线设置（`InputController.ts:279` 保留 `hitAt`），解锁入口只在右键。⑤ **E2E 画线落点必须留在末根 bar 以左**：右侧停靠栏折叠会让画布从 870 跳到 1190 px，按画布宽推导的落点会翻到数据区之外，两点被 clamp 到同一时间而退化成一条竖线，随后的右键穿到图表菜单——本批首版即栽在此（属测试写法，非产品缺陷），已在 `interactions.spec.ts:136-140` 留注。⑥ 引擎公开 API 面本次**只增不改**：`hitDrawings` 新参带默认值、`menuHitAt`/`paste`/`exportDrawingsByIds`/`pasteDrawings` 四个新口都有回读（`listDrawings` / `selectedDrawingId` / 返回值）。

**⑧ 门禁（2026-10-14 实跑）**：`npm run verify` 绿（typecheck 0 错 / oxlint **379 文件 0 错 0 警告** / format:check 绿 / 单测 **87 文件 1377 例**，+9）；`npm run test:e2e` **66 例全过、27 面黄金截图零 diff**（不带 flag 跑，`retries: 0` 已生效）；`npm run build` 应用块 **508.26 kB / gzip 145.33 kB**（C1 增量 +1.77 kB 原始 / +0.46 kB gzip），560 阈值内无警告；合计 gzip **257.78 kB**。

**C2-0 前提核查（2026-10-14，开工前逐行核实；只出清单、不写代码）**

A. **现成可读（不必动引擎）**：
- **光标吸附本体**：`HoverController.ts:145-149` —— `idx = Math.round(viewport.xToIndex(cx))`，bar 取 **`displaySeries().barAt(idx)`**（`:146`），`crosshair.set(cx, y, idx, bar.time, price)`；`price = pane.priceScale.yToPrice(y - pane.y)`（`:148`，面板局部坐标）。**index 空间 = 显示序列**，`Crosshair.bar(series)`（`Crosshair.ts:31-33`）必须喂 display 才自洽。出界时 `:114-121` 走 `clear()` + `publishCrosshairTime(null)`。
- **光标所在面板**：`state.hoveredPaneId`（`ChartState.ts:91`，每帧由 `HoverController.ts:139` `setHoveredPane(pane.id)` 写入），绘制侧已用 `?? st.panes[0]` 兜底（`RenderPipeline.ts:195`）——面板归属**无需新造**。
- **指标读数原语**：`indicatorValuesAt(inst, bars, from, index)`（`drawIndicator.ts:161-175`）返回 `Array<{label, value}>`，内建 `isPlotHidden` 过滤与 50 根回看脏缓存；副面板同源但只取首 plot（`PaneRenderer.ts:217-220`）。
- **结构件**：`PaneState`（`chartPanes.ts:32-46`：`id/kind/indicators/priceScale/y/height`）；`IndicatorInstance`（`src/indicators/core/instance.ts:62-84`：`uid/precision/displayName/visibleTimeframes`）——注意它在 `src/indicators/**` 而非 `src/engine/**`。
- **UI 侧格式化三件套**：`src/data/format.ts` 的 `formatCompact:4` / `formatPrice:15`（含 `—` 占位）/ `formatSigned:21`，另有 `decimalsFor:41`。画布的 `formatVolume` / `formatIndicatorValue`（`drawLegend.ts:213` / `:207`）是**模块私有**，但表格要的是**裸数**，这三件套已够 → **引擎侧不加格式化口**。
- **显示时区口径**：`chartConfigStore.ts:46`（`timeHour12`）/ `:48`（`tzOffsetMinutes`）是 B3 的单一来源，React 面板直读即可；纯换算件 `tzDate(time, offset)`（`drawAxes.ts:271`，`null` 时逐位等同改造前本地读数）可复用（React→engine 方向合法）。
- **宿主停靠面**：`src/features/rightbar/rightPanelStore.ts:4`（union）/ `:13`（`IDS`，兼落盘白名单校验 `:15-24`）+ `RightSide.tsx:13-17`（`RAIL`）/ `:92-94`（id switch）——**四行改动**即可挂第四面板，宽度 clamp 240–640 与窄屏覆盖层行为全复用。
- **面板实时刷新形态**：`ObjectTree.tsx:33-41`「effect 内 `sync()` + `renderer.onXxxChanged(sync)` 返回 off」= callback+回读在 React 侧的标准写法。
- **门面即实现**：`ChartRenderer.ts:5` 只是 `ChartController` 的 re-export 桶，additive 只落一个文件。

B. **必须 additive（冻结口径：新参带默认值 + 有回读）**：
1. **光标快照读出**：`crosshair` 是 `ChartController.ts:48` 的 **private 且无 getter**；对外仅 `onCrosshairTime`（`:640-642` → SyncBridge → `syncBus.ts:101` 的 throttled emit），载荷**只有 `time | null`**。借那条通道既拿不到 barIndex/price/paneId，又会把本图表的 hover 广播给其它图表（其语义是跨图联动）。→ 新 `get crosshairSnapshot()` + 新 `onCrosshairChanged(cb)`。
2. **按 index 读显示序列的 OHLCV**：`getBars()`（`:650-652`）返回 **`baseSeries.raw()`**，与 `crosshair.barIndex` 的显示空间**不同构**——HA / renko / kagi / 砖块下会把数值取到错的根，且没有任何公开口能拿到 display 序列（`state.bars()` `ChartState.ts:190-192` 是内部的）。→ 快照**直接带 bar 对象**，把 index 空间封在引擎内，React 侧永远不同时持有「裸 index」与「裸序列」。
3. **按面板分组的指标数值**：`listIndicators()`（`:412-414`）只给 `uid/id/name/overlay/params`（`IndicatorManager.ts:12-18`）——**没有 paneId、没有实例、没有可见性**；`panes` 只在私有 `inputHost` 闭包里（`:117`）；`visibleStudies`（`:143-146`）**只覆盖主面板**且含 `hideStudies` 短路。副面板指标今天**在 UI 上完全读不到**。→ additive「全面板 × 该 index 的 `{label, value}`」，并带 `hideStudies` / `isVisibleOn(timeframeId)` 两道既有过滤（与 `RenderPipeline.ts:206`、`PaneRenderer.ts:92/:127/:234/:250` 同口径）。
4. **变更广播合帧**：`HoverController.update` 每像素都跑，逐次回调会让表格逐像素重渲。现成同科件 `DrawingsNotifyCoalescer`（`ChartController.ts:67` + 该文件 `:8-22`：借既有 rAF、每帧至多冲一次、rAF 未运行则立即广播不丢事件）——复用其形态，不另起定时器。
5. **画线数值**：全仓**零**「某根 bar 处的画线值」读口；`Drawing` 只有 `points/levels/style`，价格只在各 `*Render.ts` 绘制时现算。→ 归属见 D 段。

C. **勘正（初稿与实读不符处）**：
① 图例的取数**不只跟鼠标**：`RenderPipeline.ts:202` 是 `crosshair.visible && hoveredBar ? barIndex : st.currentIndex`，回放态跟随游标（`ChartState.ts:178-182` 明写「取真实末柱会泄露未来价格」）。数据窗口若只跟 crosshair，回放中鼠标一离游标就显示游标之后的 bar → **同一回落口径必须一起搬过来**。
② 「指标读数链现成」只对**主面板叠加指标**成立；副面板走 `PaneRenderer.ts:217` 的私有方法且只取首 plot，两条链都没出引擎。
③ `Crosshair` **没有 `paneId` 字段**（`Crosshair.ts:8-14` 六项：`x/y/visible/barIndex/time/price`），面板归属在 `state.hoveredPaneId`——两者要**一并**出引擎，否则副面板的价格读数无法换算。
④ 「第四个 `RightPanelId`」前提成立，但 `RightSide` 只在 `App.tsx:229` 的 `layout === 1` 分支挂载；layout 0/2 下右轨**不存在**，入口在那些布局里天然没有 —— 属既有约束、非本批缺陷，交付时按现状登记。
⑤ `tokens.numeric`（`src/ui/tokens.ts:79-82`，`tabular-nums`）**全仓零引用**（`global.css:20` 已在 body 级给 `font-variant-numeric`）→ 表格沿用全局，不为它造用法。
⑥ **画线族实数是 45，不是本节先前口语里的 38**：`DRAWING_TOOLS`（`types.ts:104-219`）逐条点数 = 1 点 12 族 / 2 点 14 族 / 3 点 5 族 / 4 点 2 族 / 5 点 8 族 / 8 点 1 族 / `points:0`（任意）3 族 = 45。

D. **一项范围裁决（待用户定，不擅断）**：数据窗口的「画线数值」列做到哪一层。C 段 ⑥ 的 45 族按「给定 time 上是否有唯一价格读数」**判断**分五档（成员可按 id 复核，档位归属是判断不是事实）：**甲** 可插值线/线组 = trendline / ray / hline / arrow / info-line / measure / percent-line / fib / fib-extension / fib-fan / channel / fib-auto（12）；**乙** 区域盒类，穿过与否而非一个数 = rect / ellipse / circle / gann-box / polygon / path / forecast（7）；**丙** 形态标注，bar 处无定义 = abc-pattern / gartley / bat / butterfly / crab / head-shoulders ×2 / triangle ×2 / elliott-wave（10）；**丁** 文字与标记，读数是文字 = text / note / price-label / anchored-text / arrow-mark / icon-mark / price-note（7）；**戊** 角度/时间/曲线构造，time→price 不成立 = vline / fib-timezone / gann-fan / gann-line / fib-arc / fib-spiral / arc / curve（9，`fib-fan` 归甲戊有争议）。
   提议口径：**甲档出数、乙丙丁戊一律 `—`**，或本批**完全不做画线列**（先交 OHLCV + 全面板指标，画线列另立 C2b）。这直接决定 B-1 快照的形状，故在写引擎读口前定。

### 三期-D · 指标与画线精度（3–5 人日，估）

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| Alligator 未来位移 | `src/indicators/pine/trend-extended.ts:9` 头注：渲染层不支持未来位移，故不做 TV 前移偏移 | 要么补渲染层偏移能力，要么把「不做」写进对齐口径文档 | 2–3 |
| 斐波那契螺旋口径 | L31 已 RESOLVED，采用**像素空间**采样（r=r0·e^(bθ)，b=lnφ/(π/2)，240 步） | 维持；仅在文档补「世界坐标刻度不对称故不迁移」的结论 | 0.5 |
| Pine 兼容率机械验证 | L33 已 RESOLVED：以金标准用例 + 子集边界文档兜底，无离线机械验证途径 | 维持；若三期-D 有富余则加抽样脚本 | 0–1.5 |

### 三期-E · 回放与实盘口径（2–3 人日）——**不排期**（D6=收敛，2026-10-12）

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| 回放速度档 | `src/features/replay/ReplayBar.tsx:33` `const SPEEDS = [1, 2, 4];` | **不排期**。判定：可用三档而非残缺，扩档属增强非缺口 | ~~0.5–1~~ |
| 交易时段本地时区 | `src/data/marketHours.ts:4-5` 头注：边界按本地时区计算 | **不排期**。若要跨时区一致性需引入交易所时区口径，原表已注明「代价与 D1 相关」——D1 现裁档 0，该代价评估前提不再成立 | ~~1–2~~ |

### 三期-F · E2E 与性能基线加固（2–3 人日）——**不排期**（D6=收敛），但登记一处不一致（见下）

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| E2E retries 与视口 | `playwright.config.ts:17` `retries: 1`；`:29` viewport 1280×800 | **登记为不排期残留项，未获批准不动**：该项与本仓既定交付标准「`--retries=0` 全绿」相冲突（配置留 1 会在 CI 掩盖 flaky），修正仅需 0.5 人日且非功能扩展。用户在 D6 选择项中**未采纳**「收敛但先做 retries 归零」，故按裁决原样登记、不擅自执行 | 0.5（未排期） |
| 1M 根画布压测 | 二期-G 已登记边界收口（commit `00816e8`） | 维持，不重复 | 0 |
| 多视口冒烟 | 仅 1280×800 单档 | **不排期**。判定：把 27 面黄金截图扩至约 81 面属永久复核税，非交付物（D6 裁决理由，见 OPEN-DECISIONS 2026-10-12 D6 行） | ~~1–2~~ |

### 三期-G · 决策点落地批次 ——**工时归零，批次撤销**（D1=档 0 且关闭重评入口，2026-10-12）

原「若 D1 裁决为上探档位则启动，档 1 为 6–10 人日、档 2 为 11–22、档 3 为 18–35」。**D1 已由用户逐条答复五问（全「否」）裁定维持档 0，并按 `docs/DECISION-PHASE3-BACKEND.md` §4 自带判据关闭重评入口**，故本批次不启动、从 §5 排期移除。该文的四条连锁效果（B2 封口 / 反向清单转正 / §3 第 4 条无条件不做 / aggTrades 行只改 Resolves When 保持 OPEN）已写入 §3 与 OPEN-DECISIONS。

## 3. 明确不做（结转清单，2026-10-12 随三项裁决扩充）

以下条目**从二期结转，三期仍不做**，理由是定位而非能力：

1. **完整回测引擎**（L33 口径：骨架语义以金标准用例钉死，不做全量撮合）。
2. **16 格布局**（TV 付费卖点，`AUDIT-TV-UI-GAP:124`）。
3. **社区脚本 / 400+ 内置指标全量**（对齐范围为 TV 图表能力，非指标市场）。
4. **Alert 服务端投递**（挂机邮件 / Web Push）——**无条件不做**（原记「依赖 D1 档 3，未裁决前不做」；D1 已裁档 0 并关闭重评，条件语气取消）。
5. **符号搜索的交易所前缀全量筛选/描述搜索**（`AUDIT-TV-UI-GAP:137`，现有市场 tab + 最近搜索 + 键盘导航已覆盖日常路径）。
6. **MTF（多周期同时呈现 / 指标在更高周期取值 / Pine `request.security`）**——**D4 裁决不做**（2026-10-12）。触发条件写明：其数据成本前提是「服务端集中拉一次再向 N 客户端扇出」，而 D1 重评入口已关闭，故**当前定位下无解锁路径**。技术存档（未来重开免二次取证）：重采样件已在仓内（`src/data/aggregate.ts:49` `aggregateBars` + 多日档时区归桶 + `klineCache` 按 `id,timeframe` 分键），真正增量是 **as-of 前向填充映射**（低周期 bar → 其时刻前最后一根**已闭合**高周期 bar，即 `lookahead=off`；取到当根即未来函数）与指标链第二序列注入；且档 0 下每指标需独立轮询一份 HTF 序列，顶到「每源 ≤2 次/分」自律上限（`src/data/aggregatePath.ts:27-33`）。
7. **图表设置「事件」页（企业行动 / 分红 / 拆股 / 财报标记）**——**2026-10-12 开工取证后从 B 撤下，明确不做**。理由分层：① **无数据面**——`MarketSource` 接口（`src/types/market.ts:48-52`）没有任何事件方法，全仓 corporate-action 业务命中为 0，现有免费直连源（腾讯/新浪/东财/Binance/Gate）均不提供统一事件序列；② **无渲染面**——事件标记要新渲染层（轴上方旗标 + 作为画线之外的第二标记体系），不是对话框加控件；③ 真实增量为「新数据源 + 新标记渲染层」3–5 人日，且唯一可行的数据获取前提是**后端代理 + 付费源**，而 D1 已裁档 0 并关闭重评入口、D1 问题 2 答「不付费」。**触发条件**（同 MTF 口径）：除非出现「浏览器可直连、带 CORS、含分红/拆股日期的免费事件源」这一新事实，否则不重议。取证出处：`AUDIT-TV-FEATURE-GAP:147,153`。

**能力边界转正（D1 裁决的另一半：把「妥协」改记为「口径」，不再充当待办）**

| 诉求 | 终态口径（是特性，不是缺口） | 现有实现处 |
|---|---|---|
| 跨设备继续工作 | **手动迁移**：命名布局快照本地存/载 + 自选 CSV 导出 + PNG 截图 | `src/store/layoutSnapshot.ts`、`WatchlistPanel.tsx:103`、`ChartController.ts:468` |
| 非 crypto 实时性 | **秒级轮询 + 末柱刷新 P95 ≤ 5s 为长期天花板**；B2「A 股末柱推送 ≤1s」（`docs/PLAN-PHASE2.md:44`，`:113` 留的「视 D1 裁决另立 Spec」口子）由本次裁决**封口，不做** | `src/store/pollSchedule.ts:12`（3s 盘中 / 失败退避封顶 60s / 盘外零网络） |
| 挂机（关标签页）警报 | **页面开着才判定**——判定由页面内行情驱动，属定位选择 | `src/features/alerts/useAlertWatcher.ts:137-154` |
| 分享图表/自选 | **本地 PNG 导出即终态**，无链接、无落地页、无滥用治理面 | `ChartController.screenshot()` → `toDataURL`（`ChartController.ts:468-469`）、`src/App.tsx:125-126` |
| 付费源品类（港股分钟线 / 外盘期货量 / 净值基金 K 线 / 可转债搜索） | **不做**——D1 问题 2 答「不付费」后，§1.4 整块（后端唯一「前端做不到」的收益类）自动关闭 | `docs/DECISION-PHASE3-BACKEND.md` §1.4、`docs/PLAN-PHASE2.md:89-91` |

## 4. 决策点（**2026-10-12 全部裁决完毕**）

| ID | 问题 | 选项 | 裁决 | 依据 |
|---|---|---|---|---|
| **D1** | 三期是否重开「自建后端」 | 档 0 纯前端 / 档 1 只读行情代理 / 档 2 +快照 KV / 档 3 +账号+通知 | **RESOLVED（2026-10-12）：维持档 0，且关闭重评入口**——用户逐条答复 §4 五问全「否」（多设备/付费源/挂机警报/分享/运维），按 `docs/DECISION-PHASE3-BACKEND.md` §4 自带判据「问题 1、2、5 全否 → 登记不做并关闭重评」落档 | 决策材料 §0 一页结论、§2-C3 单点半径、§2-C4 合规、§2-C5 定位自洽；OPEN-DECISIONS 2026-10-12 D1 行 |
| **D4** | 是否做 MTF（多周期同时呈现） | 做 / 不做 | **RESOLVED（2026-10-12）：不做**，登记为本文 §3 第 6 条并附触发条件（与 D1 挂钩，故当前无解锁路径） | `SPEC-PHASE1-CLOSEOUT.md:31` 5–8d 估算、`AUDIT-TV-FEATURE-GAP:85,:162` 现状「无」、`aggregatePath.ts:27-33` 轮询自律上限；OPEN-DECISIONS 2026-10-12 D4 行 |
| **D6** | 三期取向 | 收敛（只做 A–D 灰区收口，随后冻结）/ 扩展（加 E–F 增强与多视口） | **RESOLVED（2026-10-12）：收敛**——E/F 不排期，剩余功能面 = B → C → D。一处配置-纪律不一致（`playwright.config.ts:17` `retries: 1`）按裁决**登记不排期、不擅自执行** | 本文 §1 目标 1；OPEN-DECISIONS 2026-10-12 D6 行 |

**D1 五问的原始问句与用户答复**（逐条问答留档，防止后人重议时凭记忆推断）：① 跨设备继续同一张图表？——**单机为主，不需要同步**。② 愿为行情付费订阅并接受 seat 约束？——**不付费，只用免费直连源**。③ 标签页关着也必须收到警报？——**不需要，开页判定已够**。④ 需以链接形式给他人看？——**不分享，PNG 导出就够**。⑤ 接受长期运维 + 非 Pages 部署目标 + 门禁/CI 双栈？——**不接受，维持纯前端**。

## 5. 排期与依赖（D6=收敛、D1=档 0 后的终版）

```
三期-A（1–2d，无依赖） ──> 已交付（2026-10-12）
三期-H（1–1.5d，债务清偿） ──> 已交付（2026-10-12）
                              ┌──> 三期-B（6–8d，**B0 + B1 + B2 + B3 + B4 已交付**，余 2–2.5d 两行；事件页已撤项、页级缺口清零、警报页已随 B4 补上）
剩余功能面 = ─────────────────┼──> 三期-C（5–7d，**C1 画线右键三项已交付 2026-10-14**、余 2–3d 一行数据窗口；右键粘贴的前提「B 模板页」已随 B1 解锁）
                              └──> 三期-D（3–5d，可与 B 并行）
不排期：三期-E、三期-F（D6=收敛）；三期-G（D1=档 0，批次撤销）
```

- **合计 14–20 人日**（B 6–8 + C 5–7 + D 3–5）。上一版「12.5–18.5」随 B 批次 2026-10-12 开工取证重排作废（B0 前置入表 +1–1.5，事件页撤项 0）。原「默认排期 A → H → B → C → D → F，18–27.5 人日」与「扩展排期 +E，19–29 人日」两案随 D6 裁决作废。
  **已消耗（2026-10-14 复算）**：B0 约 1–1.5 + B1 约 1 + B2 约 1.5 + B3 约 1 + **B4 约 0.5** ⇒ 已耗约 **5–5.5 人日**，**B 余约 2–2.5 人日**（两行：时间轴刻度格式（紧凑/小数位，原估 1–1.5、时区子项已做完故**未重估**）与轴宽参数化 1；**页级缺口已清零**，警报页经裁决③随 B4 交付、不占页级预算）。全期剩余约 **9.5–14.5 人日**（B 2–2.5 + C 5–7 + D 3–5）。同日另落地两项非功能面：裁决①（`chunkSizeWarningLimit = 560`）与裁决④（`playwright.config.ts` `retries = 0` + `trace` 连带），各为零配置行改动、未计人日；裁决②（交易偏好不进模板）为纯登记、零代码。
  **C 批次复算（同日，C1 交付后）**：B 5–5.5 + **C1 约 1.5**（估 2，实际含开工后才发现的锁定单向门与两处探针逃逸补强）⇒ 已耗约 **6.5–7 人日**；**C 余 2–3 人日**（只剩数据窗口一行，其前提两项已由用户裁决定死：不开快捷键 + 右侧停靠面板），全期剩余约 **8–13 人日**（B 2–2.5 + C 2–3 + D 3–5）。
- 批次间无强阻塞：B 与 D 可并行，**C 的画线粘贴语义依赖 B 的模板页**（该前提已随 **B1 交付解锁**，2026-10-12），C 其余项可即行。
- **不排期残留项一览**（有裁决依据、非遗忘）：① ~~`playwright.config.ts:17` `retries: 1` 与「`--retries=0` 全绿」标准不一致（0.5d，D6 裁决未纳入）~~ **已闭合（2026-10-14 用户裁决④）**：现行 `retries: 0` 在 `:20`，本行左列是裁决前的旧事实，按只追加纪律不回写、就地标记闭合；② E 批次两项；③ F 的多视口冒烟；④ G 批次整体。
- **三期收口判据**：§1 目标 1「无待办灰区」= B/C/D 三批交付完毕 + §3 结转清单与能力边界表覆盖全部「属后续增强」注释 + OPEN-DECISIONS 无因三期而新增的 OPEN 项（现存两行 OPEN 均有明确外部阻塞或机制待查属性，不属三期灰区）。

## 6. 门禁口径（本期沿用二期）

- 每批次收口：`npm run verify`（typecheck + lint + format:check + test）**+** `npm run test:e2e` + `npm run build`。
- **Windows 前置**：E2E 前**手动起 dev server**（Playwright 自管 webServer 会挂）。
- E2E 交付标准：`--retries=0` 全绿（三期-C1 后现 **66 例**、27 个金标准截图面）。自 2026-10-14 用户裁决④起，`playwright.config.ts:20` 的 `retries` 本身即为 **0**，该 flag 由「额外严格」变为「与配置一致」，不带 flag 的跑法不再给第二次尝试。
- oxlint 0 error / 0 warning；`max-statements: 60` / `max-params: 10`，7 个帧编排/分发文件放宽至 120（L28 口径）。
- 文档纪律：OPEN-DECISIONS **只追加 + 就地关闭**；不改写历史交付记录；`docs/` 与 markdown 永久排除 Prettier。
- 提交纪律：白名单 `git add <显式路径>`，禁止 `-A`；不留 `.bak`；一批次一/两个 commit；先 commit 验门禁、**push 前逐 commit 请示授权**。
