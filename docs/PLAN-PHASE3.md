# 三期开发规划（PLAN-PHASE3）

> 状态：**草案，待裁决**。本文的批次 A–G 可先行讨论排期，但 §4 的三个决策点（D1 自建后端 / D4 MTF 多周期 / D6 取向）未裁决前不启动对应批次。**三期-H** 为批次 A 回传项，2026-10-12 由用户裁决立项，无裁决依赖。
> **批次进度（2026-10-12）**：三期-A 已交付（见 §2-A 交付记录，零功能变更）；B/C/D/F 待 D6 取向裁决后排期，G 待 D1 裁决。
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
2. **规格深化**：设置类对话框补齐 TV 的页级结构（交易/一般/事件/模板）与控件精度（number stepper、plot 类型下拉）。
3. **工程债清理**：README 与 `oxlintrc` 类文档-代码口径漂移、3 处 lint disable 残留、E2E 视口/重试基线。
4. **决策落定**：D1（后端）、D4（MTF）、D6（取向）三个决策点给出书面裁决并结转进 OPEN-DECISIONS。

**量化验收口径（全期）**：`npm run verify` 全绿；`npm run test:e2e -- --retries=0` 全绿；`npm run build` 最大 chunk gzip ≤ 150 kB（现 141.16 kB，留裕度）；Vitest 用例数 ≥ 1305 且不删既有断言。

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

### 三期-H · useChartSeries 门禁盲区清偿（1–1.5 人日，估；2026-10-12 由用户裁决「立项改造」新立）

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

### 三期-B · 设置对话框页级补齐与控件深化（6–9 人日，估）

依赖：无（前端独立完成）。这是「功能已交付但规格不达标」的主要缺口。

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| 设置页缺 4 页 | 今仅 图表/外观/指标/警报 四页 | 补 **交易 / 一般 / 事件 / 模板**（`AUDIT-TV-UI-GAP` 图表设置对话框段） | 3–4 |
| 时间坐标格式选项残留 | 价格轴三态与 12/24h **已交付**（L29）；时间轴格式选项仍缺 | 补齐时间轴刻度格式（紧凑/小数位/时区显示口径） | 1–1.5 |
| 轴宽与刻度参数化 | `AUDIT-TV-UI-GAP:127` `AXIS_TEXT_INSET = 58`（64px 轴宽 − 6px 呼吸）为硬编码 | 轴宽 64 / 刻度 6 提为常量或状态，避免几何分支散落 | 1 |
| 指标对话框控件精度 | `AUDIT-TV-UI-GAP:148` plot 类型下拉、number stepper 未达 TV 规格 | 补齐 plot 类型下拉 + stepper（步进/精度/单位） | 1.5–2.5 |
| 响应式布局档位 | `AUDIT-TV-UI-GAP:124` 固定档位 1/2/4/6/8，**不做 16 格** | 维持现状（16 格为 TV 付费卖点，见 §3） | 0 |

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

### 三期-E · 回放与实盘口径（2–3 人日，估）

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| 回放速度档 | `src/features/replay/ReplayBar.tsx:33` `const SPEEDS = [1, 2, 4];` | 视需要扩档（如 0.5/8）——**属增强，非缺口**，需 D6 取向裁决 | 0.5–1 |
| 交易时段本地时区 | `src/data/marketHours.ts:4-5` 头注：边界按本地时区计算 | 若要跨时区一致性需引入交易所时区口径，代价与 D1 相关 | 1–2 |

### 三期-F · E2E 与性能基线加固（2–3 人日，估）

| 项 | 现状 | 动作 | 人日 |
|---|---|---|---|
| E2E retries 与视口 | `playwright.config.ts:17` `retries: 1`；`:29` viewport 1280×800 | 既定「--retries=0 全绿」为交付标准，则配置应降为 `retries: 0`，避免 CI 掩盖 flaky | 0.5 |
| 1M 根画布压测 | 二期-G 已登记边界收口（commit `00816e8`） | 维持，不重复 | 0 |
| 多视口冒烟 | 仅 1280×800 单档 | 增 1440×900 / 1920×1080 冒烟（金标准截图面会扩容，慎评估基线漂移成本） | 1–2 |

### 三期-G · 决策点落地批次（视裁决而定，0 或 6–35 人日）

若 D1 裁决为上探档位，则本批次启动，工时直接引 `docs/DECISION-PHASE3-BACKEND.md` §2 估算表：档 1 为 6–10 人日、档 2 为 11–22、档 3 为 18–35。**当前建议倾向维持档 0**（该文 §0）。

## 3. 明确不做（结转清单）

以下条目**从二期结转，三期仍不做**，理由是定位而非能力：

1. **完整回测引擎**（L33 口径：骨架语义以金标准用例钉死，不做全量撮合）。
2. **16 格布局**（TV 付费卖点，`AUDIT-TV-UI-GAP:124`）。
3. **社区脚本 / 400+ 内置指标全量**（对齐范围为 TV 图表能力，非指标市场）。
4. **Alert 服务端投递**（挂机邮件/Web Push）——依赖 D1 档 3，未裁决前不做。
5. **符号搜索的交易所前缀全量筛选/描述搜索**（`AUDIT-TV-UI-GAP:137`，现有市场 tab + 最近搜索 + 键盘导航已覆盖日常路径）。

## 4. 决策点（待裁决）

| ID | 问题 | 选项 | 建议 | 依据 |
|---|---|---|---|---|
| **D1** | 三期是否重开「自建后端」 | 档 0 纯前端 / 档 1 只读行情代理 / 档 2 +快照 KV / 档 3 +账号+通知 | **维持档 0**；仅当 §下文问题 1（多设备）或问题 3（挂机警报）答「是」才分别上探档 2 / 档 3；**不建议**为纯数据面单独上档 1 | `docs/DECISION-PHASE3-BACKEND.md` §0、§2-C3、§2-C4 |
| **D4** | 是否做 MTF（多周期同时呈现） | 做 / 不做 | 未裁决。MTF 属「指标可在更高周期取值」，牵动数据层多周期拉取与缓存，若无 D1 则前端轮询成本显著 | 二期未登记，需新立 OPEN-DECISIONS 行 |
| **D6** | 三期取向 | 收敛（只做 A–D 灰区收口，随后冻结）/ 扩展（加 E–F 增强与多视口） | 未裁决。取向决定 E/F 是否进排期 | 本文 §1 目标 1 vs 2/3 |

**D1 裁决前必答的 5 问**（原文 §4，此处摘要）：① 是否有真实多设备需求？② 是否需要可分享链接？③ 是否需要离开标签页仍收到警报？④ 是否接受 CI/门禁双栈化与单点故障半径？⑤ 是否接受「开发与生产一致」被反转？
**关闭判据**：若问题 ①②⑤ 全部为「否」，则**关闭 D1 重开入口**，此后不再重评。

## 5. 排期与依赖

```
三期-A（1–2d，无依赖） ──┬──> 三期-B（6–9d）──┬──> 三期-C（5–7d）
                          ├──> 三期-D（3–5d）  │
                          ├──> 三期-F（2–3d）  ┘
                          └──> 三期-H（1–1.5d，债务清偿，无裁决依赖，建议紧随 A）
三期-E（2–3d）依赖 D6 取向；三期-G 依赖 D1 裁决（不在默认排期）
```

- **默认排期（D1=档 0、D6=收敛）**：A → H → B → C → D → F，合计 **18–27.5 人日**（H 为 A 回传项，2026-10-12 立项）。
- **扩展排期（D6=扩展）**：再加 E，合计 **19–29 人日**。
- **若 D1 上探**：G 另计 6–35 人日，且会反转 C2（CI 双栈）/C3（单点）/C4（合规）三项代价，需独立评估窗口。
- 批次间无强阻塞，可并行 B/D，但 C 的右键粘贴依赖 B 的对话框模板页语义，建议串行。

## 6. 门禁口径（本期沿用二期）

- 每批次收口：`npm run verify`（typecheck + lint + format:check + test）**+** `npm run test:e2e` + `npm run build`。
- **Windows 前置**：E2E 前**手动起 dev server**（Playwright 自管 webServer 会挂）。
- E2E 交付标准：`--retries=0` 全绿（现 59 例、27 个金标准截图面）。
- oxlint 0 error / 0 warning；`max-statements: 60` / `max-params: 10`，7 个帧编排/分发文件放宽至 120（L28 口径）。
- 文档纪律：OPEN-DECISIONS **只追加 + 就地关闭**；不改写历史交付记录；`docs/` 与 markdown 永久排除 Prettier。
- 提交纪律：白名单 `git add <显式路径>`，禁止 `-A`；不留 `.bak`；一批次一/两个 commit；先 commit 验门禁、**push 前逐 commit 请示授权**。
