# 三期开发规划（PLAN-PHASE3）

> 状态：**三个决策点已全部裁决（2026-10-12）**——D1 维持档 0 并**关闭重评入口**、D4 MTF **不做**（登记为明确不做）、D6 取向 **收敛**。批次 B/C/D 可直接排期，E/F/G 已按裁决移出（详见 §4 与 `docs/decisions/OPEN-DECISIONS.md` 2026-10-12 三行）。**三期-H** 为批次 A 回传项，同日由用户裁决立项。
> **批次进度（2026-10-12）**：三期-A 已交付（见 §2-A 交付记录，零功能变更）；三期-H 已交付（见 §2-H 交付记录，该文件 disable 归零 + 行为零变更）；**三期-B 开工取证完成并重排**（加 B0 前置、撤事件页，4.5–6.5 → **6–8 人日**，见 §2-B）；**三期-B0 已交付**（设置态单一来源 + 偏好落盘，见 §2-B 的 B0 交付记录）；**B → C → D 为收敛取向下的全部剩余功能面**，E/F/G 不排期。
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
2. **规格深化**：设置类对话框补齐 TV 的页级结构（交易/一般/**模板**；原列「事件」页经 2026-10-12 开工取证撤项，无数据面可接，见 §2-B 与 §3 第 7 条）。前置项 **B0：设置态单一来源 + 偏好落盘**同期立项（`chartConfigStore` 无 persist、画布偏好由对话框自持）。~~控件精度（number stepper、plot 类型下拉）~~ **2026-10-12 复核为已交付**，见 §2-B 校准行。
3. **工程债清理**：README 与 `oxlintrc` 类文档-代码口径漂移（三期-A 已处置）、lint disable 残留（原 **3 处**，三期-H 消除 1 处后**现 2 处**，二者经删除探针证实只抑制自身那一行、属真·有意例外，见 README「lint disable 台账」）、E2E 重试基线（`playwright.config.ts:17` `retries: 1` 与既定「`--retries=0` 全绿」标准不一致——登记为不排期残留，见 §2-F）。
4. **决策落定**：D1（后端）、D4（MTF）、D6（取向）三个决策点给出书面裁决并结转进 OPEN-DECISIONS。**2026-10-12 全部达成**（档 0 + 关闭重评 / MTF 不做 / 收敛；三行已入册）。

**量化验收口径（全期）**：`npm run verify` 全绿；`npm run test:e2e -- --retries=0` 全绿；`npm run build` 最大 chunk gzip ≤ 150 kB（三期-B0 后现 141.86 kB，留裕度）；Vitest 用例数 ≥ **1318**（三期-B0 后现量，+9 例来自 `tests/unit/chart-config-prefs.test.ts`）且不删既有断言。

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
| 设置对话框页级缺口 | **2026-10-12 校准**：今为 **5 页**（`ChartSettingsDialog.tsx:11` `TABS = ['坐标轴', 'Scales', '状态栏', 'Canvas', '外观']`），原表误记「图表/外观/指标/警报 四页」（把指标对话框的页签混进了同一对话框）。TV 侧为 **9 页签**（`AUDIT-TV-UI-GAP:44`：商品代码/状态行/坐标和线条/画布/交易/一般/外观/警报/事件/模板） | 补 **交易 / 一般 / 模板** 三页（原「四页」中的**事件**经取证撤项，见下行；缺口结论不变，仅现状描述勘正 + 一页撤出） | 3–4 |
| ~~事件页（企业行动 / 分红 / 拆股标记）~~ **撤项** | 取证：`MarketSource` 接口（`src/types/market.ts:48-52`）**无任何事件类方法**，全仓 corporate-action 业务代码命中为 **0**；`AUDIT-TV-FEATURE-GAP:147,153` 已记该能力依赖外部数据 | **从 B 撤下**，转 §3 第 7 条「明确不做」并附触发条件。理由：真实增量是「新数据源 + 新标记渲染层」（3–5d），且受 D1=档 0 与「不付费、只用免费直连源」约束，当前定位下**无解锁路径**——与 MTF（§3 第 6 条）同类处置 | ~~1–1.5~~ → **0** |
| 时间坐标格式选项残留 | 价格轴三态与 12/24h **已交付**（L29）；时间轴格式选项仍缺 | 补齐时间轴刻度格式（紧凑/小数位/时区显示口径） | 1–1.5 |
| 轴宽与刻度参数化 | `AUDIT-TV-UI-GAP:127` `AXIS_TEXT_INSET = 58`（64px 轴宽 − 6px 呼吸）为硬编码 | 轴宽 64 / 刻度 6 提为常量或状态，避免几何分支散落 | 1 |
| ~~指标对话框控件精度~~ **已交付（2026-10-12 复核）** | 原表依 `AUDIT-TV-UI-GAP:148` 记为「plot 类型下拉、number stepper 未达 TV 规格」，**取证日 2026-10-09 的该观测已过期**。实测：`IndicatorSettingsDialog.tsx:47-57` 定义四形态 `line/histogram/band/level`，`:142-153` 已接入下拉且 **band 按「仅多 plot 指标可选」主动收窄**（正是该审计要求的规格），`:205-209` 输入页已用 `NumberStepper` 带 `step` 参数 | **无需动作**（本批次起点已做完） | ~~1.5–2.5~~ → **0** |
| 响应式布局档位 | `AUDIT-TV-UI-GAP:124` 固定档位 1/2/4/6/8，**不做 16 格** | 维持现状（16 格为 TV 付费卖点，见 §3） | 0 |

**B 批次人日两次校准**：原 6–9 →（控件精度子项实测已交付）**4.5–6.5** →（2026-10-12 开工取证：加 B0 前置 1–1.5、撤事件页 0）**6–8 人日**。
原估偏低的成因写清以防重犯：该 4.5–6.5 是按「补几个 tab 的纯 UI」估的，取证后发现**设置态无单一来源**（B0）与**事件页无数据面**两个非 UI 前提。

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

### 三期-C · 交互与数据面板（5–7 人日，估）

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| 数据窗口 Data Window | `AUDIT-TV-UI-GAP:150` P1 待办，**Alt+D 零 src 命中**（未实现） | 采集 renderer 当前光标快照 → 表格浮层（全部指标/画线数值） | 2–3 |
| 图表右键菜单完整度 | `AUDIT-TV-UI-GAP:36` 已有菜单，Paste(Ctrl+V)/Add alert on X 等 14 项未全 | 补 **复制/粘贴/锁定** 三项画线剪贴板语义（含序列化） | 2 |
| 十字光标多面板 | 已按面板 priceScale 换算（`drawCrosshair.ts:90`） | 无缺口 | 0 |

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
                              ┌──> 三期-B（6–8d，**B0 前置已交付**；事件页已撤项）
剩余功能面 = ─────────────────┼──> 三期-C（5–7d，右键粘贴依赖 B 模板页语义，故串行在 B 后）
                              └──> 三期-D（3–5d，可与 B 并行）
不排期：三期-E、三期-F（D6=收敛）；三期-G（D1=档 0，批次撤销）
```

- **合计 14–20 人日**（B 6–8 + C 5–7 + D 3–5）。上一版「12.5–18.5」随 B 批次 2026-10-12 开工取证重排作废（B0 前置入表 +1–1.5，事件页撤项 0）。原「默认排期 A → H → B → C → D → F，18–27.5 人日」与「扩展排期 +E，19–29 人日」两案随 D6 裁决作废。
- 批次间无强阻塞：B 与 D 可并行，**C 的画线粘贴语义依赖 B 的模板页**，建议串行在 B 之后。
- **不排期残留项一览**（有裁决依据、非遗忘）：① `playwright.config.ts:17` `retries: 1` 与「`--retries=0` 全绿」标准不一致（0.5d，D6 裁决未纳入）；② E 批次两项；③ F 的多视口冒烟；④ G 批次整体。
- **三期收口判据**：§1 目标 1「无待办灰区」= B/C/D 三批交付完毕 + §3 结转清单与能力边界表覆盖全部「属后续增强」注释 + OPEN-DECISIONS 无因三期而新增的 OPEN 项（现存两行 OPEN 均有明确外部阻塞或机制待查属性，不属三期灰区）。

## 6. 门禁口径（本期沿用二期）

- 每批次收口：`npm run verify`（typecheck + lint + format:check + test）**+** `npm run test:e2e` + `npm run build`。
- **Windows 前置**：E2E 前**手动起 dev server**（Playwright 自管 webServer 会挂）。
- E2E 交付标准：`--retries=0` 全绿（现 59 例、27 个金标准截图面）。
- oxlint 0 error / 0 warning；`max-statements: 60` / `max-params: 10`，7 个帧编排/分发文件放宽至 120（L28 口径）。
- 文档纪律：OPEN-DECISIONS **只追加 + 就地关闭**；不改写历史交付记录；`docs/` 与 markdown 永久排除 Prettier。
- 提交纪律：白名单 `git add <显式路径>`，禁止 `-A`；不留 `.bak`；一批次一/两个 commit；先 commit 验门禁、**push 前逐 commit 请示授权**。
