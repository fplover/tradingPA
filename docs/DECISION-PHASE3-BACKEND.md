# 三期 D1 · 自建后端决策材料（收益 / 代价对照）

> 状态：**已被裁决采纳并关闭重评入口（2026-10-12）**。本文件的用途（把重开 D1 所需的对照事实一次摊清）已完成；用户逐条答复 §4 五问，答案**全为「否」**（①单机为主不同步 ②不为行情付费 ③挂机不需警报 ④不分享 ⑤不接受运维与 CI 双栈），按本文 §4 自带判据「问题 1、2、5 全否 → 明确登记不做并关闭重评」落档为 **D1 = 维持档 0，三期及此后各期不再重议**。裁决正文与四条连锁效果见 `docs/decisions/OPEN-DECISIONS.md` 2026-10-12 D1 行与 `docs/PLAN-PHASE3.md` §3/§4；§3「反向选项」表已由 PLAN §3 **转正为能力边界口径**（不再是妥协/待办）。
> 保留本文件的理由：它是「为什么不上后端」的唯一完整对照论证，重议时的成本/收益证据不用重新取证。**若未来确要重开**，须先推翻上面五个答复中的至少一个，而不是重新讨论技术形态。
> 原文口径（不作改写）：以下正文写于裁决前，「本材料的建议倾向……该倾向不是裁决」等表述保留原样；全部「现状」论断带出处（`路径:行号` 或文档小节）；「代价」里的工时是**估算**（单人、含单测与门禁适配、不含商务与托管申请），估算项已标注。
> 取证日期：2026-10-09（工具链基线：TS 7 原生 `tsc` / oxlint / Vite 8 Rolldown，见 README「质量门禁」）。

## 0. 一页结论

| 档 | 内容 | 解锁 | 主要代价 | 适合的前提 |
|---|---|---|---|---|
| **档 0** | 纯前端（现状） | — | 运维零；实时性天花板 = 秒级轮询；无跨设备能力 | 定位为「单机复盘/研究工具」，自用 + 本地演示 |
| **档 1** | 无状态只读行情代理（转发 + 合并 + 缓存 + WS 广播，不落库、无账号） | B2 推送、付费源与代理型数据、全历史翻页、tick 级 VP/footprint | 常驻服务 + CI 双栈 + 上游热修发布通道；打破「开发与生产一致」；新增单点 | 只为**数据面**上后端，不要同步/分享 |
| **档 2** | 档 1 + 快照 KV 存储（分享链接、匿名设备同步） | 图表快照分享落地页、跨设备布局/自选/警报 | 存储与冲突合并、滥用治理、隐私说明 | 有真实多设备需求，或需要可分享链接 |
| **档 3** | 档 2 + 账号体系 + 通知投递（服务端警报判定 + 邮件/Web Push） | 挂机也能收到警报（离开标签页）、按身份同步 | 鉴权全链 + 投递凭据与频控 + 数据合规 | 要做「平台」而非「工具」，且接受长期运维 |

裁决前必须先回答的 5 个问题见 §4。**本材料的建议倾向**：按当前项目定位（1:1 图表复刻，功能面已无未勾项），收益全部落在「平台周边」而非「图表能力」，**默认维持档 0**；只有 §4 里的问题 1（多设备）或问题 3（挂机警报）答「是」，才分别上探档 2 / 档 3，且**不建议**为纯数据面单独上档 1（理由见 §2-C3、§2-C4）。该倾向不是裁决。

## 1. 后端能解锁什么（逐项：现状 → 有后端 → 工时估算）

### 1.1 B2 · 非 crypto 实时推送（唯一有明确验收口径的项）

- **现状**：实时推送仅 crypto；其余市场为「轮询合成末柱」。盘中批轮询 3s（`src/store/pollSchedule.ts:12` `POLL_OPEN_MS=3000`，注释即写明「3s 保证末柱刷新延迟 P95 ≤ 5s（验收口径）」：`:11`）、失败 ×2 退避封顶 60s（`:14` `POLL_MAX_MS`）、盘外/隐藏标签零网络仅 30s 本地闹钟（`:16` `IDLE_WAKE_MS`）；自定义聚合周期 5–30s（`src/data/aggregatePath.ts:27-33`，下限注释「每源 ≤2 次/分」）；Compare 30s（`src/features/market/compareModel.ts:27`）。已交付的 B1 验收口径：**非 crypto 末柱刷新延迟 P95 ≤ 5s**（`docs/PLAN-PHASE2.md:44`）。
- **有后端**：PLAN-PHASE2 已写下 B2 的验收目标「**A 股末柱推送延迟 ≤ 1s**」（`docs/PLAN-PHASE2.md:44`）与「B2 视 D1 裁决另立 Spec」（`:113`）。服务端集中拉一次上游、向 N 个客户端 WS 广播，同时消除「多标签页各自轮询」的乘性上游压力（现状每浏览器实例独立轮询，无 `BroadcastChannel`/`SharedWorker`，grep 零命中）。
- **前端改造面**：`src/store/quoteStore.ts:51-107` 的 `useQuotePolling` 与 `pollSchedule` 需增「有推送源则退化为订阅」分支；crypto 侧 `LiveDataFeed` 结构可直接复用（`src/data/feed/LiveDataFeed.ts`）。
- **估算**：2–4 人日（含前端订阅分支与退化为轮询的兜底路径）。**注意**：这一项的收益是 5s → 1s 的延迟优化，不是从「没有」到「有」——B1 已把秒级轮询做到可用，属边际收益。

### 1.2 云同步（布局 / 自选 / 警报 / Pine 脚本 / 指标模板）

- **现状**：全本地，12 个 localStorage 键 + 1 个 IndexedDB 库——`tradingpa.layouts.v1`（`src/types/layout.ts:11`）、`watchlist.v2`（`src/store/watchlistPersist.ts:10`）、`alerts`（`src/store/alertStore.ts:27`）、`alertHistory`（`src/features/alerts/alertHistory.ts:9`）、`pine.scripts`（`src/store/pineStore.ts:16`）、`indicatorTemplates` / `indicatorFavorites`（`src/store/indicatorTemplates.ts:16`、`src/store/indicatorStore.ts:35`）、`tradePanel`、`replayBarPos`、`rightdock.width/.panel`、`custom-intervals.v1`（`src/features/market/customInterval.ts:6`），缓存 `tradingpa`/`klines`（`src/data/cache/klineCache.ts:3-5`）。已有数量护栏（`MAX_SAVED_LAYOUTS`、模板上限、历史 100 条）与隐私模式兜底。
- **有利条件**：布局快照已是**自包含 JSON + schema 版本迁移**（`src/store/layoutSnapshot.ts:169,204`），画线有序列化 API（`ChartController.exportDrawings` → `serializeDrawings`，`src/engine/renderer/ChartController.ts:780-783`）。→ 同步协议几乎不需要新数据模型，代价主要在鉴权形态与冲突合并。
- **有后端**：最小形态可以是「匿名设备 token + 单 KV（键 = token，值 = 现有快照）」，不必先做账号。
- **估算**：档 2 同步子集 3–5 人日（含冲突策略与「本地覆盖远端/合并」单测）。参照 `docs/PLAN-PHASE2.md:75` 二期-F 的原始口径「预估视 D1 裁决 3–10 人日」。

### 1.3 图表快照分享链接 / 落地页

- **现状**：只有本地导出 PNG（`ChartController.screenshot()` → `toDataURL`，`src/engine/renderer/ChartController.ts:468-469`；下载 `src/App.tsx:125-126`；命令 `app:screenshot`）与 CSV 导出、剪贴板复制。**无任何 URL/链接代码**。文档裁定：「分享 URL 需后端，不做」（`docs/AUDIT-TV-FEATURE-GAP.md:151`）、「账号体系/云同步/分享 URL——localStorage 本地化足够，不做」（`docs/SPEC-TV-ALIGNMENT.md:42`）。
- **有后端**：存快照 + 一个只读落地页，用现有 hydrate/重建逻辑渲染。**关键设计代价**：无鉴权则任何拿到链接的人可读（自选与警报里含交易意图信息）；要治理就得引入短链、过期、滥用举报或登录墙——「分享」的真实成本几乎全在这里，不在存储。
- **估算**：2–4 人日（不含滥用治理；含治理 +3 人日）。

### 1.4 付费源 / 代理型数据（这是唯一「前端做不到」的一类）

浏览器直连的硬约束（`src/data/sources/http.ts:1-2`：「国内行情站普遍返回 GBK 且部分不带 CORS 头，这两点是接入的主要摩擦」）与已探明的源边界：

| 受阻项 | 现状证据 | 后端能改变什么 |
|---|---|---|
| 港股分钟线 | 「三源探测确认无免费可直连源（2026-10-08 两轮实测）」（`docs/PLAN-PHASE2.md:89`）、`src/data/sources/registry.ts:33`「暂无免费源」 | **只能靠付费源**，后端提供的是「能带密钥、不受 CORS/Referer 限制」的接入位——代理本身不产生数据 |
| 外盘期货成交量 | 新浪该字段常年为 0（`src/data/sources/sina.ts:17`、`docs/PLAN-PHASE2.md:90`） | 同上，需付费源 |
| 净值类基金 K 线 | 无免费源（`docs/PLAN-PHASE2.md:91`） | 同上 |
| tick 级：Volume Profile 精确 delta / footprint / Bar Magnifier | ADR-001：100–400 次请求、weight 占 6000/min 配额 7–27%，且 Binance 主网不可达（`docs/decisions/ADR-001-volume-profile-kline-approx.md:7`）；OPEN-DECISIONS **唯一存量 OPEN 项**，Blocked By「接可达 tick 数据源」（`docs/decisions/OPEN-DECISIONS.md:8`） | 后端可做：① 稳定出口（绕开 `api.binance.com` 不可达，现退镜像 `data-api.binance.vision`，`src/data/feed/binance.ts:4-6`）② 请求预算在服务端集中复用与缓存 |
| 可转债等无免费搜索入口的品类 | 「113050 不在东财 suggest 索引，无免费搜索入口，不做」（`docs/PLAN-PHASE2.md:39`） | 需另源，后端同样是「带密钥」的接入位 |
| 全历史与翻页 | 单请求上限：腾讯 K 线 800 根且「分钟线区间翻页实测不可靠」（`src/data/sources/tencent.ts:247,256-258`）、Binance/Gate 各 1000（`binance.ts:147-148`、`src/data/sources/gate.ts:99-100`）、新浪分钟固定 1023 根（`sina.ts:16`） | 服务端可并发翻页拼接 + 落库复用，前端 IndexedDB 现在只做单 `symbol:interval` 缓存且 5s 写节流（`klineCache.ts:7-12`） |
| 搜索联想/代码表 | 东财 `searchapi` 无 CORS 头 → 现在走 JSONP（`src/data/sources/eastmoney.ts:8,181`）；`push2` 系列本网络不可达故不用（`:9`） | 服务端可直接 HTTP，摆脱 JSONP 随机回调 hack（`http.ts:36-39`） |

- **估算**：档 1 代理骨架（1 个源 + 缓存 + WS 转发）3–5 人日；每增一个源 0.5–1 人日。**付费源订阅费用未询价，属商务决策，不在工时内。**

### 1.5 警报离开标签页仍能送达（邮件 / Web Push）

- **现状**：警报判定由**页面内的行情驱动**（`useAlertWatcher` 由报价/末柱变化驱动，`src/features/alerts/useAlertWatcher.ts:137-154`，调用点 `src/App.tsx:71`），渠道只有浏览器 `Notification` + Web Audio 880Hz 提示音（`src/store/alertStore.ts:82-90`、`src/features/alerts/sound.ts:4-5,19`），并有 60s 去重与合并通知（`alertLogic.ts:305-334`）。页面不开 = 不判定 = 不通知。文档裁定：「警报邮件/push 渠道 | 需后端 | 不做」（`docs/SPEC-PHASE1-FEATURE-BREADTH.md:35`、`docs/AUDIT-TV-FEATURE-GAP.md:122`）。
- **有后端**：服务端持有警报规则 + 定时对末柱判定 + 投递。**注意这条比云同步更「必须后端」**——它是纯前端模型的能力空白（关标签页就没警报），但也同时要求：警报规则上收（隐私）、投递凭据（SMTP/服务）、频控与退订、失败重试。
- **估算**：4–6 人日（判定 + 邮件；Web Push 另 +2 人日：VAPID 密钥与订阅端点管理）。

### 1.6 附带红利（不作为决策主因，但会降低长期维护摩擦）

- 消除 GBK 解码、JSONP 随机回调、URL 长度截断（腾讯报价 50 代码/批，`tencent.ts:221-223`）、`pageSize=600` 单所一次拉全（`eastmoney.ts:81-82`）这类浏览器端 hack；上游字段变更可在服务端热修而不是发版。
- crypto 连接数收敛：现在**每个 crypto 图表单元格一条 WS、单 symbol 单 stream、无组合流**（`src/data/feed/binance.ts:77-80`，实例化点 `src/features/market/useChartSeries.ts:136`）→ 多布局 N 格即 N 条；后端可单条上游扇出。

## 2. 代价（与收益对称的部分，逐条可核）

### C1 · 打破一条现有不变量：「开发与生产一致」

README 明确写着「全部 K 线数据源浏览器直连……**开发与生产一致**」（`README.md:24`），`vite.config.ts:18-22` 无代理配置，且 2026-10-08 的收尾动作是**拆掉** dev server 代理（「新浪 K 线已改为 script 标签 JSONP 直连，不再需要 dev server 代理」，`vite.config.ts:21`）。上后端等于把这条一致性反转回来：本地开发要起后端、要配 CORS 或代理、要有后端不可用时的降级路径。

### C2 · 门禁与 CI 双栈化

现在 `.github/workflows/deploy.yml`：`npm ci` → `npm run verify`（红即终止部署）→ `npm run build` → `dist/.nojekyll` → `upload-pages-artifact(path=dist)` → `deploy-pages@v4`。**GitHub Pages 不能托管后端**，所以任何档都要新增部署目标（容器 / serverless / 小型 PaaS），并给后端配 lint/test/构建/密钥（GitHub Secrets）/健康检查；`verify` 的口径从一栈变两栈。另外两条既有资产会被牵动：

- **E2E 确定性**：本批刚把 E2E 做到 `--retries=0` 全绿、并用 `page.route` 桩切断外网依赖（`tests/e2e/watchlist.spec.ts`，见 README 待办「E2E 去 flaky 已收口」）。引入后端后，真实链路 E2E 要么依赖后端实例可用性（重新引入 flaky），要么继续桩化（则后端等于没被测到）。
- **依赖审计基线**：`npm run audit` 现为 **found 0 vulnerabilities**（`README.md:121-123`）。后端引入新的运行时（Node 服务 / ORM / 邮件 SDK）会重开这块。

### C3 · 单点风险与故障半径

现状是「每源独立 + 独立回退链」：crypto = Binance REST/WS → `data-api.binance.vision` 镜像 → Gate 回退（`src/data/sources/registry.ts:29-47`、`gate.ts:11-12`），非 crypto = 腾讯/新浪/东财各自直连，历史缺失时抛 `NoHistoryError` 并由 `createMockFallback` 降级（`registry.ts:90`、`src/features/market/useChartSeries.ts:77-89`）——**没有任何一个进程挂了会导致全平台失效**。加后端后，该进程成为所有非 crypto 实时（+ 同步/分享/警报）的公共依赖，需要监控、重启策略、容量与限流；而收益（§1.1）是延迟从 5s 到 1s 的量级优化。

### C4 · 合规与责任（最容易被低估的一项）

- **再分发许可**：付费行情源通常按 seat 授权并**禁止公开再分发**；用一个付费订阅给多个访问者提供行情，往往是违约而不是技术问题。
- **自建跨境出口**：`api.binance.com` 在本网络不可达（`src/data/feed/binance.ts:4`）是**当前网络环境的既成事实**；自建代理等于自建一条跨境访问通道，可用性、稳定性与合规责任全部转嫁到自己身上。
- **用户数据上收**：自选股、警报条件、Pine 脚本、模拟交易面板状态（`tradingpa.tradePanel`、`replayBarPos`）都反映真实交易意图。云同步/服务端警报判定都要把这些存到服务器，需要最少化的采集说明、保留期、删除通道；无鉴权分享（§1.3）还会把它暴露给任何持链接者。

### C5 · 定位与既有裁定的自洽性

`docs/AUDIT-TV-FEATURE-GAP.md:226` 的差距结论是：约 10% 差距属「TV 付费卖点与平台资产（P2/out-of-scope）」，而这 10% 里绝大多数正是后端相关项（账号/社区/新闻流/经济日历/Screener/真实下单，见 `docs/SPEC-TV-ALIGNMENT.md:41-43`）。也就是说：**D1 上后端不会缩小「图表能力」的 1:1 差距，只会把项目从「工具」移向「平台」**。DEVELOPMENT_PLAN §1 的选型理由至今是「交易所公开 API……**免后端**、实时性有保障」（`DEVELOPMENT_PLAN.md:91`）。

### C6 · 工时合计（估算，含单测与门禁适配，不含商务/托管申请）

| 档 | 增量工时 | 累计 |
|---|---|---|
| 档 1 只读代理 | 6–10 人日（骨架 3–5 + 逐源 0.5–1×3 + 前端订阅分支 2–4） | 6–10 |
| 档 2 + 快照 KV | 同步 3–5 / 分享 2–4（含滥用治理再 +3） | 11–22 |
| 档 3 + 账号 + 通知 | 鉴权与最小账号体系 3–5、警报服务端判定 + 邮件 4–6、Web Push +2 | 18–35 |

对比参考：二期全七个批次（含 45 个画线工具、Pine 扩展、SVP、警报增强）的实际节奏是同日多批收口——**后端一档的工时就能吃掉一个二期量级**，且它带来的是长期运维承诺而非一次性交付。

## 3. 反向选项：不上后端时，各项诉求怎么收

| 诉求 | 不上后端的处置 | 已登记处 |
|---|---|---|
| 非 crypto 实时性 | B1 已交付（盘中 3s / 盘外停轮 / 失败退避封顶 60s），把「P95 ≤ 5s」当**长期天花板**写进文档而不是待办 | `docs/PLAN-PHASE2.md:43,46` |
| 港股分钟 / 外盘期货量 / 净值基金 / 可转债 | 维持「明确不做」，时机列已写清触发条件（付费源/采购裁决） | `docs/PLAN-PHASE2.md:89-91`、§3 |
| tick 级 VP / footprint / Bar Magnifier | 维持 kline 近似（ADR-001），aggTrades 精确 delta 留 OPEN 项，Blocked By「接可达 tick 数据源」 | `docs/decisions/ADR-001-...md`、`docs/decisions/OPEN-DECISIONS.md:8` |
| 跨设备 | 现有能力上限：**手动迁移**——命名布局快照本地存/载 + 自选 CSV 导出 + PNG 截图；把它当特性而非妥协记录 | `layoutSnapshot.ts`、`WatchlistPanel.tsx:103`、`ChartController.ts:468` |
| 挂机警报 | 明确能力边界（页面开着才判定），维持邮件/push 不做 | `docs/SPEC-PHASE1-FEATURE-BREADTH.md:35` |
| 分享 | 本地 PNG 导出即终态 | `docs/SPEC-TV-ALIGNMENT.md:42` |

## 4. 裁决前需要用户回答的 5 个问题

1. **是否真的存在多设备使用场景？**（一台机器上用 → 档 0；手机+工机交替 → 至少档 2）
2. **是否愿意为行情付费订阅，且接受「只自己/小圈用」的 seat 约束？**（愿意 → 档 1 才有意义；不愿意 → §1.4 整块自动关闭，代理收益只剩 §1.1/§1.6 的边际优化）
3. **挂机（不盯盘）是否要收到警报？**（要 → 档 3 的通知子集；不要 → 服务端警报判定无收益）
4. **是否接受长期运维 + 一个非 Pages 的部署目标 + CI 双栈？**（不接受 → 直接档 0）
5. **是否需要把图表/自选分享给他人看？**（需要且接受公开可读 → 档 2 分享子集；不需要 → PNG 导出即终态）

判据建议（非裁决）：**问题 1、2、5 全否 → 明确登记「D1 三期仍不做，且关闭重评入口」**（把 D1 从「待评估」降级为「已裁定不做」，避免每期重议）；任一为「是」→ 只开对应子集（同步子集 / 通知子集 / 分享子集），**不要**为「以后可能用」先搭通用后端框架——三个子集互不依赖，可各自独立立项。

### 4.1 裁决结果（2026-10-12，逐条问答留档）

| # | 问句 | 用户答复 | 对档位的含义 |
|---|---|---|---|
| 1 | 是否真的存在多设备使用场景？ | **单机为主，不需要同步** | 档 2 同步子集无收益 |
| 2 | 是否愿为行情付费订阅并接受 seat 约束？ | **不付费，只用免费直连源** | §1.4 整块（档 1 的唯一「前端做不到」收益）自动关闭 |
| 3 | 挂机（标签页关着）是否要收到警报？ | **不需要，开页判定已够** | 档 3 通知子集无收益 |
| 4 | 是否接受长期运维 + 非 Pages 部署目标 + CI 双栈？ | **不接受，维持纯前端** | 总闸门关闭（C1/C2 两条不变量保留） |
| 5 | 是否需要把图表/自选分享给他人看？ | **不分享，PNG 导出就够** | 档 2 分享子集无收益 |

**按本节判据落档：D1 = 维持档 0，关闭重评入口。** 本文件 §3「反向选项」表随之从「妥协清单」升格为**能力边界口径**（跨设备 = 手动迁移快照 / 实时性 = 轮询 P95 ≤ 5s 天花板 / 挂机警报 = 开页判定 / 分享 = PNG 导出），已写入 `docs/PLAN-PHASE3.md` §3。附带处理：`docs/decisions/OPEN-DECISIONS.md` 的 aggTrades 精确 delta 行（本文件 §1.4 提及的唯一存量 OPEN 项）**保持 OPEN** 但改写其 Blocked By/Resolves When——自建代理这条解锁路径已被答复 ②④ 关闭，残余唯一路径是「本网络能直连 Binance aggTrades 端点」，伪关闭会丢掉这条记录。

## 5. 无论选哪档都不变的东西

- 引擎层纪律：`src/engine/**` 不得 import React/zustand，公开 API 签名冻结，27 面黄金截图 + 1309 单测 + 59 E2E 作为行为红线（`README.md:110-111`）。后端只作用于数据面（`src/data/**`）与持久化层（`src/store/**` 的 persist 边界），不进渲染路径。
- SPEC-TV-ALIGNMENT §3 的社区/社交/新闻流/经济日历/Screener/真实下单/经纪商集成继续「不做」——它们不是后端问题，是数据资产与定位问题（`docs/SPEC-TV-ALIGNMENT.md:41-43`）。
- 交付节奏与门禁 SOP 不变：先探测后动工、一批一/两提交、白名单 `git add`、docs-first。
