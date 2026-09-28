# tradingPA × TradingView 功能维度差距分析

> 作者：许清楚（产品经理）｜日期：2026-09-28｜版本：v1.0
> 输入：DEVELOPMENT_PLAN.md v1.1（M0-M7 声称完成，实际以代码为准）+ src 93 文件实证 + git log 30 条 + TradingView 官方 4 来源 + 第三方评测 3 来源
> 结论：**整体完成度高（TV 图表复刻主干已齐），差距集中在「交互细节映射」与「长尾功能广度」两层。P0 清单 8 项均为「差一步就齐」（框架已在、TV 行为明确、成本 1-6 人日）。**

---

## 0. 调研方法与证据来源

### 0.1 项目侧实证（以代码为准，不采信计划书勾选）

| 证据 | 内容 |
|---|---|
| `DEVELOPMENT_PLAN.md` 第 3 章 | 1:1 对照清单基线（图表类型 12 / 周期 19 / 指标 ~60 / 画线全套 / 平台功能），计划书勾选状态滞后于代码 |
| `git log --oneline -30` | 最近 10 个 commit 全部为 TV 细节对齐：图例交互、flyout 长按变体菜单、对话框 TV 化（指标四页签/图表设置左导航/TV tooltip）、对象树视觉顺序、磁吸两档、Pine v5 子集编译器 |
| `src/types/market.ts` | 20 档周期（1s/5s/15s/30s、1m/3m/5m/15m/30m、1H/2H/4H/6H/8H/12H、1D/3D/1W/1M）、12 种图表类型 |
| `src/indicators/builtin/`（5 文件） | 32 个内置指标（趋势 9 / 震荡 8 / 动量 6 / 通道 4 / 量能 5）+ Pine 子集自定义指标同管线 |
| `src/engine/drawing/types.ts` | 12 种画线工具（趋势线/射线/水平线/垂直线/箭头/信息线/平行通道/矩形/椭圆/路径/文本/斐波那契回撤） |
| `src/engine/renderer/ChartRenderer.ts`（1594 行） | 缩放锚点/平移/LOD/磁吸两档/撤销重做/双击价格轴自动适配/双击画线开设置/截图 |
| `src/store/syncBus.ts` | 多图表联动仅十字光标 + 视口（无品种/周期/画线同步） |
| `src/store/layoutStore.ts` | 布局 1/2/4/6/8 |
| `src/features/pine/compile.ts` | Pine v5 子集：表达式级（10 个 ta 函数 + math.* + input + plot） |
| `src/features/replay/ReplayBar.tsx` | 回放：选 K 线/播放/暂停/步进/3 档倍速/随机/按日期定位 |
| `src/features/trading/` | 模拟交易：市价单、持仓、TP/SL 拖线、成交报告 |
| `src/features/alerts/AlertPanel.tsx` + `store/alertStore.ts` | 价格警报：上穿/下穿、浏览器 Notification、持久化 |
| `src/features/watchlist/`（724+460 行） | 多列表/列显隐/排序/CSV 导出/重命名复制删除 + 符号搜索弹窗（市场 tab + 最近搜索） |
| `src/components/Chart.tsx`（383 行） | 快捷键现状：Esc/Delete/Ctrl+Z/Ctrl+Y/Enter/+/-/←/→；`/` 与 Ctrl+K 开搜索 |

### 0.2 TradingView 侧来源（联网，5 来源）

1. **TradingView 官网 Features 页**（tradingview.com/features，Supercharts 官方清单）：每屏最多 16 图表 + 品种/周期/画线同步、命令搜索、Spreads 自定义公式、自定义间隔（秒级/范围 K 线）、Volume footprint、TPO、Session volume profile、21 种图表类型（Premium）。
2. **TradingView 免费图表库页**（HTML5-stock-forex-bitcoin-charting-library）：charting_library 官方特性——110+ 画线工具、100+ 技术指标、指标模板、自定义指标、17 种图表类型、最多 8 图布局、光标同步/品种同步/周期同步/画线同步、Trading Terminal（订单/持仓/DOM）。
3. **TradingView Charting Library Docs**（ui_elements / Shortcuts / Featuresets）：UI 元素全清单（顶栏/图例/marks/market status/context menu/drawing toolbar/widget bar）；featuresets 点名 `countdown`（K 线收盘倒计时）、`go_to_date`、`control_bar`、`header_compare`、`use_localstorage_for_settings` 等。
4. **TradingView 官方快捷键页**（support/shortcuts）：完整默认映射表（见 P0-1 明细）。
5. **第三方评测**（propfirmapp.com 评测 + myfxbook 完全指南 + tradenation 入门指南）：21 chart types / 400+ built-in indicators（含社区脚本另计）/ Bar Replay 9 档速度且回放中可画线 / Bar Magnifier / Auto chart patterns / Candlestick pattern recognition / 基本面图表。

### 0.3 知识库核查

`references/industries/` 下无图表/交易行业文件（saas-b2b / ecommerce / enterprise / content-platform / ai-native 均不匹配）；`references/platforms/` 为 harmonyos / wechat-miniprogram，不匹配。已读 `references/01-standards/spec-as-contract.md`，本清单遵循其三条硬约束：**点名文件/模块**、**明确不做（out-of-scope）**、**端到端可验证**。

---

## 1. 差距清单总表（按 11 个维度）

优先级定义：**P0** = TV 核心交互/视觉一致性且「差一步就齐」（框架已在，≤6 人日）；**P1** = 高价值功能缺口，中等成本；**P2** = TV 长尾/高级功能或超出图表复刻核心范围。工作量为人日（单人）。

### 1.1 图表交互（缩放 / 平移 / 快捷键）

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 快捷键体系（TV 默认映射全量） | 数字键/逗号切周期；字母键直接切品种；Alt+A 警报；Alt+G 前往日期；Alt+R 重置视图；Alt+L 对数；Alt+P 百分比；Alt+I 翻转坐标；Alt+W 加自选；Shift+F 全屏；Alt+S 截图；Ctrl+↑/↓ 缩放；Ctrl+←/→ 大幅平移；Alt+Shift+←/→ 跳到首/末 K 线；Shift+滚轮左右平移；Tab/Shift+Tab 切换布局单元格；Alt+Enter 最大化图表；Ctrl+Alt+H 隐藏所有画线；Alt+T/H/J/V/C/F 画线工具直启 | 仅有 Esc 取消 / Delete 删除 / Ctrl+Z、Ctrl+Y 撤销重做 / Enter 完成路径 / +、- 缩放 / ←、→ 平移（`components/Chart.tsx` 键盘监听）；`/` 与 Ctrl+K 开搜索（`App.tsx`） | 约 25+ 个 TV 默认快捷键未映射，是「打开 TV 再用本产品」最直观的违和点。纯事件映射增量，基础设施（renderer 方法、store action）大多已存在 | **P0** | 2-3 |
| 前往日期（Go to date） | Alt+G 弹出日期选择，视口跳到指定 bar；时间轴右键亦有 Go to | 无。回放模式已有同源能力（`ReplayBar` 日期选择 → `App.handleSeekToTime` 二分查找） | 图表模式无法跳日期；TV 用户复盘高频动作。复用 `handleSeekToTime` + 弹日期浮层即可 | **P0** | 1-2 |
| K 线收盘倒计时（Bar countdown） | 价格轴右端显示距当前 K 线收盘的 mm:ss 倒计时，随行情实时跳动 | 无（`grep countdown` 全库无结果） | TV 价格轴标志性元素；依赖当前周期定义 + setInterval + 重绘价格轴标签，低成本高感知 | **P0** | 1-2 |
| 滚轮行为细节 | 普通滚轮 = 上下平移价格视野（TV 实为左右移动时间轴，Shift+滚轮左右）；Ctrl+滚轮 = 聚焦缩放；Shift+滚轮 = 左右移动 | `ChartRenderer.onWheel`：Ctrl/Meta+滚轮聚焦缩放，普通滚轮横向 pan（`panByBars(-dx/spacing)`） | 普通滚轮横向 pan 与 TV 一致（TV 普通滚轮也是时间轴平移），**基本一致**；需补 Shift+滚轮显式映射并验证像素/bar 换算手感 | P1 | 0.5-1 |
| 底部控制条（control_bar） | 图表底部缩放/左右滚动导航按钮 | 无 | TV featureset `control_bar`；与快捷键重复度中等 | P2 | 1 |
| 测量工具 | Shift+点击测量两根 K 线/价格差，浮层显示 bar 数、价格差、百分比 | 无 | 画线框架可复用（临时对象 + 浮层标签） | P1 | 2-3 |
| 局部擦除 | Ctrl+橡皮擦 擦除画线局部 | 无 | 需画线命中细分，成本较高 | P2 | 3-4 |

### 1.2 周期系统

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 档位完整性 | TV 默认档：1s/5s/15s/30s、1m/**2m**/3m/5m/15m/30m/**45m**、1H/2H/**3H**/4H/6H/8H/12H、1D/1W/1M | 20 档（`types/market.ts` TIMEFRAMES），缺 **2m、45m、3H** | 档位表补 3 行 + `aggregateBars` 已是参数化纪元对齐，纯数据增量 | **P0** | 0.5-1 |
| 自定义间隔 | 任意输入分钟/小时建自定义周期；秒级与范围 K 线任意 | 固定档位，无自定义入口 | TV Supercharts 明确卖点；输入数字 → 生成 timeframe 定义 → 走既有聚合器，低成本 | **P0** | 1-2 |
| 数字键切周期 | 按数字/逗号直接切周期 | 无 | 归入 P0-1 快捷键批量映射 | **P0** | （含上） |
| 周期切换保持画线 | 切换周期后画线按世界坐标保留 | 世界坐标存储（time+price），天然保持 | 已对齐 | — | — |

### 1.3 图表类型（Series Types）

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 基础类型补齐 | TV 21 种（Premium）。已有 12 种，缺：**Columns、High-low、Step line、Line with markers、HLC area、Volume candles** | 12 种（蜡烛/竹线/线形/面积/基线/空心/HA/Renko/Kagi/LineBreak/PnF/Range），`seriesRenderers.ts` 渲染器框架 + `transforms.ts` 变换框架已就绪 | 6 种均为既有框架内的新渲染器/微变换，是 TV 用户高频切换项；补齐后 18/21，剩余 3 种为 Volume footprint/TPO/Session VP（高级，见 1.4/1.6） | **P0** | 4-6 |
| Volume candles | 蜡烛宽度/颜色编码成交流 | 无 | 需成交流数据映射到蜡烛几何 | P1 | 2-3 |
| 图表类型对比（Compare/叠加） | 顶栏 Compare 按钮叠加第二条价格序列（charting library `header_compare`） | 无（`displaySeries` 单序列） | 需数据层多序列订阅 + 归一化坐标 + 图例第二行 | P1 | 3-5 |

### 1.4 指标系统

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 内置指标数量 | TV 100+（charting library 官方）；评测称 400+（含社区脚本） | 32 个（`indicators/builtin/` 5 文件） | 高频缺失（按用户使用率与 TV 默认收藏排序）：**Volume Profile、Anchored VWAP、Alligator、KST、Coppock、ROC/Momentum、TRIX、TSI、Vortex、Fisher Transform、Choppiness Index、Elder Ray、Mass Index、Chaikin Oscillator、Aroon Oscillator、Price Oscillator、Bollinger Width/NATR/Standard Deviation、Percent B、Correlation Coefficient、Linear Regression、McGinley Dynamic** 等约 30 个。声明式 schema + 窗口化计算框架已在，每个指标是纯计算函数 + 金标准用例 | P1 | 10-15（30 个） |
| Volume Profile / Session Volume Profile | 右侧/横置成交量分布直方图（POC/VAH/VAL），TV Premium 卖点 | 无 | 需按价格分桶聚合可见区间成交量（Binance kline 近似）或 aggTrades；作为独立面板挂副图，复用副图框架 | P1 | 8-12 |
| 指标多周期（MTF） | 指标引用其他周期数据（TV `request.security`） | Pine 子集无 security；内置指标无 MTF 参数 | 需指标引擎支持跨周期序列输入 | P2 | 5-8 |
| 指标模板/收藏/图例交互 | 模板存取、图例悬停按钮、右键菜单、收藏 | 已对齐（git log：`a487639` 图例交互对齐 TV、`053536f` 悬停按钮与收藏、`7bff966` 指标四页签对话框） | 已对齐 | — | — |
| 指标叠加层数 | TV 付费分层级（Essential 1 层起） | 主图叠加 + 多副表面板，无层数上限问题 | 已对齐 | — | — |

### 1.5 画线工具

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 斐波那契家族 | 回撤/扩展/扇形/弧线/时区/通道/螺旋 + Auto Fib | 仅**回撤**（`fib` 一种） | 扩展/扇形/弧线/时区是技术分析高频工具；fib 锚点与绘制框架已在，每个变体主要是锚点延伸 + 水平线组渲染 | **P0** | 4-6（5 个变体） |
| 画线交互补齐 | Ctrl+拖动克隆；Ctrl+点击多选；Shift+拖动限制水平/垂直移动；方向键微调选中对象；Alt+拖动=演示光标绘制 | 单选手柄/整体拖拽、Delete/Ctrl+Z/Ctrl+Y、磁吸两档（`cf146d9`）、保持绘图模式 | 克隆/多选/Shift 约束均复用既有命中测试与拖拽状态机，无新框架 | **P0** | 3-4 |
| 江恩工具 | 江恩扇形/江恩线/江恩箱 | 无 | 角度线数学已明确，成本中等 | P1 | 3-4 |
| 谐波/形态 | XABCD 谐波、头肩顶底、ABCD、三角形态 | 无 | 锚点交互类似 fib，成本中等 | P1 | 4-6 |
| 艾略特波浪 | 5-3 波浪标注组 | 无 | TV 长尾工具 | P2 | 2-3 |
| 文字类 | 便签、锚定文本、价格标签、价格注记、箭头标记 | 仅文本（`text` 一种） | 便签/价格标签高频，锚定文本中等 | P1 | 2-4 |
| 几何类 | 多边形、曲线、圆弧、贝塞尔 | 有矩形/椭圆/路径 | 路径已有基础，扩展中等 | P2 | 3-5 |
| 图标与表情 | 图标贴纸面板 | 无 | 纯资源 + 落点，成本低价值中 | P2 | 1-2 |
| 对象树/撤销/序列化 | 显隐/锁定/删除/清空、撤销栈、JSON 导入导出 | 已对齐（`0d5d738` 视觉顺序与设置入口） | 已对齐 | — | — |
| 预测与测量 | 价格预测、测量工具 | 无 | 见 1.1 测量工具 | P1 | 2-3 |

### 1.6 布局与联动

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 布局档位 | Advanced Charts 最多 8 图；Supercharts 每屏最多 16（Ultility 付费点） | 1/2/4/6/8 | 8 格已达 charting_library 上限；16 格为 TV 付费差异化卖点，复刻优先级低 | P2 | 2-3 |
| 单元格最大化/折叠 | Alt+Enter 或 Alt+点击最大化；双击最大化窗格；Ctrl+双击折叠 | 无（双击仅价格轴/画线有行为） | 交互增量 + 布局 store 状态 | P1 | 1-2 |
| 多图表联动维度 | 光标同步、**品种同步、周期同步、画线同步** | `syncBus` 仅 crosshair + viewport 两类 | TV 四种同步缺三种；syncBus 加 channel + ChartCell 订阅即可 | P1 | 3-4 |
| 布局保存/加载 | Ctrl+S / `.` 保存与恢复整图布局（品种/周期/图表类型/指标/画线/面板/主题） | 仅指标模板 localStorage（`indicatorStore.saveTemplate`） | 需定义 layout 序列化 schema（layoutStore + indicatorStore + drawingStore + chartType/timeframe + pane 状态），本地存储；TV 核心工作流 | **P0** | 3-5 |
| 布局边缘拖拽调比 | Shift+拖动调整多图表边缘比例 | 无（grid 均分） | grid-template 动态化 | P2 | 2-3 |

### 1.7 警报（Alerts）

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 触发条件类型 | crossing / crossing up / crossing down / entering channel / greater than / less than | 仅上穿/下穿（`alertStore.add` price+direction） | crossing up/down 已有，补 greater/less（不依赖穿越）与 channel 低成本 | P1 | 1-2 |
| 作用对象 | 价格、**任意指标值、画线水平（alert on line）、Pine 条件** | 仅价格（报价轮询触发，`App.tsx` useEffect checkAlerts） | 指标值/画线触及需接入指标计算结果与画线命中；Pine 条件依赖 Pine 扩展 | P1 | 4-6 |
| 触发频率与过期 | Once only vs Every time；可设过期时间 | 无（触发即标记，无重复触发逻辑） | store 加字段 + 检查逻辑 | P1 | 1-2 |
| 警报编辑与管理 | 编辑已有警报（改价/改条件/暂停）、按品种分组 | 仅新建/删除/清除已触发（`AlertPanel.tsx`） | 编辑浮层 + store update | P1 | 2-3 |
| 通知渠道 | App push / 邮件 / 网页通知 / 声音 | 浏览器 Notification（`alertStore.ts:86`） | 声音提示低成本；邮件/push 需后端，明确不做（见第 2 节） | P1 | 0.5-1 |

### 1.8 复盘（Bar Replay）与模拟交易

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 回放档位 | 9 档回放速度 + 步进；回放中可继续画线/挂单 | 3 档倍速 + 步进 + 随机 + 按日期定位（`ReplayBar.tsx` SPEEDS=[1,2,4]） | 倍速表扩到 TV 同档；回放中画线未验证（理论上引擎未禁用，需 E2E 验证） | P1 | 1 |
| 模拟交易单类型 | TV Paper Trading：market/limit/stop/stop-limit、持仓管理、交易历史 | 市价单 + TP/SL 拖线 + 持仓详情 + 成交报告（`features/trading/`） | limit/stop 挂单 + 订单簿列表；项目复盘交易完成度已高于 charting_library demo | P1 | 4-6 |
| Bar Magnifier | 单根 K 线放大看底层 tick 数据 | 无（数据源无 tick） | 依赖 tick 级数据，与数据源能力绑定 | P2 | 5-8 |
| 回放隐藏未来 K 线 | 回放起点右侧数据遮罩/裁掉 | 已对齐（`ChartRenderer.setReplayIndex` → `viewport.setReplayEdge`，渲染上界 `to ≤ replayIndex`，选中时回放位居中） | 已对齐 | — | — |

### 1.9 数据与品种搜索

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 符号搜索完整度 | 交易所前缀（如 NASDAQ:AAPL）、描述/类型/交易所筛选、键盘上下选择、logo、收藏、模糊匹配 | 市场 tab 分类 + 最近搜索 + 代码/名称/交易所展示（`SymbolSearchDialog.tsx` 460 行） | 基本盘已在；缺键盘导航（↑/↓/Enter）、收藏夹分组、描述搜索 | P1 | 2-3 |
| 命令搜索（Command search） | 全局命令面板：输动作名直达任何功能 | 无 | TV Supercharts 明确卖点；命令注册表 + 模糊匹配浮层，成本中等 | P1 | 3-5 |
| Spreads（自定义公式品种） | 数学运算创建合成品种（AAPL/USD、BTC-ETH） | 无 | 需公式解析 + 多序列合成，成本较高 | P2 | 5-8 |
| 数据源覆盖 | TV 覆盖全球交易所/外汇/加密/经济数据 | Binance + 新浪/腾讯/东方财富（A股/港股/美股/国内外期货/指数/加密，`data/sources/`） | 免费源范围内已宽；TV 的交易所前缀直连（NASDAQ:XXX 语法）未支持 | P2 | 3-5 |
| 缺口回补/懒加载/缓存 | 左滑懒加载、WS 断线重连、IndexedDB 缓存 | 已对齐（M5 + `b968f8e` 非加密市场向左加载） | 已对齐 | — | — |

### 1.10 UI chrome（顶栏 / 右键菜单 / tooltip / 状态栏 / 图例）

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 图表设置对话框覆盖度 | TV Settings 页签：Symbol / Status line / Scales / Appearance / Canvas / Trading / Events | 3 页：坐标轴/状态栏/外观（`ChartSettingsDialog.tsx`） | 缺 Symbol（描述/时区/行业）、Canvas（边框/水印）、Events（除权/财报标记）； Trading 页签可映射到复盘交易设置 | P1 | 3-5 |
| 市场状态（Market status） | 图例显示开/闭/盘前盘后状态徽章 | 无（`StatusBar` 仅 UTC 时间 + 数据源文案） | 多市场交易时段表 + 当前时刻判定 | P1 | 2-3 |
| 时区切换 | 时间轴/状态栏时区可选（交易所本地/UTC/自定义） | 固定 UTC | 时间格式化层参数化（`data/format.ts`）+ 轴标签重绘 | P1 | 2-4 |
| 数据窗口（Data Window） | Alt+D 弹窗：光标处全部指标/画线数值表 | 无（图例有 OHLCV + 叠加指标值） | 采集 renderer 当前光标快照 → 表格浮层 | P1 | 2-3 |
| 截图能力 | 保存 PNG / 复制到剪贴板 / 生成分享 URL | 下载 PNG（`renderer.screenshot()`）+ 全屏按钮 | 复制到剪贴板（navigator.clipboard）低成本；分享 URL 需后端，不做 | P1 | 0.5-1 |
| 顶栏完整度 | 品种/Compare/周期/类型/指标/警报/模板/回放/撤销重做/布局/设置/Pine/截图/全屏 | 品种/周期/类型/回放/指标/模板存取/撤销重做/布局/设置/Pine/搜索/全屏/截图/刷新/主题（`App.tsx` 顶栏） | 缺 Compare 按钮（见 1.3）、警报入口（现藏在右键菜单与右面板，TV 顶栏有快讯管理）、保存布局（见 1.6） | P1 | 1-2 |
| 图例/marks | K 线上的除权、财报、新闻标记 | 无 | Events 体系依赖基本面数据源，与 Compare 同属 P1 数据面 | P2 | 3-5 |

### 1.11 Pine 脚本

| 功能模块 | TV 标准行为 | 当前项目状态 | 差距描述 | 优先级 | 预估工作量 |
|---|---|---|---|---|---|
| 语句控制流 | if / for / while / switch，var / varip 声明 | 表达式级子集：赋值 + plot + 四则/比较/逻辑（`compile.ts` 530 行，tokenizer + parser + 解释执行） | if/for 是分水岭：大量真实脚本的最小必要集。解释器架构已在，加语句节点成本中等 | P1 | 5-8 |
| 用户函数 | 自定义 function 定义与调用 | 无 | 与语句控制流同期做（共享 AST 扩展） | P1 | 2-3 |
| ta.* 函数覆盖面 | TV 约 100+ ta 函数 | 10 个（sma/ema/rsi/stdev/highest/lowest/change/crossover/crossunder/nz） | 高频补齐：macd/atr/adx/cci/mfi/wpr/bbands/kc/donchian/supertrend/psar/wma/dema/linreg/vwma/hma/tsi/fisher 等约 20 个，纯函数增量 | P1 | 4-6 |
| 多周期引用 | `request.security()` 取其他周期序列 | 无 | 依赖多周期数据管线，与 MTF 指标同源 | P2 | 4-6 |
| strategy() 回测 | Pine 策略回测 + 绩效报告 | 无（复盘交易为自研轻实现） | 范围大，与自研复盘交易定位重叠，建议明确不做（见第 2 节） | P2 | 15+ |
| 绘图指令 | hline / fill / bgcolor / barcolor / plotshape / plotchar / alertcondition | 仅 plot() | hline/bgcolor/barcolor 低成本；plotshape/alertcondition 中等 | P1 | 3-5 |
| 高级类型 | array / matrix / table / 自定义 type | 无 | TV Pine 高级特性，社区脚本覆盖率低 | P2 | 8-12 |

---

## 2. 「差一步就齐」P0 汇总（team-lead 重点关注）

以下 8 项共同特征：**TV 行为已在官方文档钉死、项目框架已就绪、用户感知强、单项 ≤6 人日**。建议作为下一阶段（TV 对齐打磨期）的第一批。

| # | 项目 | 为什么是 P0 | 落点（点名文件） | 工作量 |
|---|---|---|---|---|
| P0-1 | 快捷键体系补全至 TV 默认映射 | 打开产品第一违和点；纯映射增量，renderer 方法大多已存在（zoom/pan/resetView/undo…） | `components/Chart.tsx`（键盘监听扩展）、`App.tsx`（全局快捷键）、新增 `hooks/useTvShortcuts.ts` 统一映射表 | 2-3 人日 |
| P0-2 | 前往日期 Alt+G | 复盘高频动作；`App.handleSeekToTime` 二分查找已存在，包一个日期浮层即可 | `App.tsx`（handleSeekToTime 复用）、新增 `features/market/GoToDateDialog.tsx` | 1-2 人日 |
| P0-3 | K 线收盘倒计时 | 价格轴标志性元素；周期定义 + 定时器 + 价格轴标签扩展 | `engine/renderer/drawAxes.ts`（价格轴标签）、`engine/renderer/ChartRenderer.ts`（倒计时状态与 rAF） | 1-2 人日 |
| P0-4 | 基础图表类型补齐 6 种 | TV 21 种中已缺 6；seriesRenderers/transforms 框架已就绪，每个是新渲染器 | `engine/renderer/seriesRenderers.ts`、`data/transforms.ts`、`types/market.ts`（CHART_TYPES 登记） | 4-6 人日 |
| P0-5 | 周期补齐 2m/45m/3H + 自定义间隔 | 档位表 3 行 + 聚合器参数化入口 | `types/market.ts`（TIMEFRAMES）、`data/aggregate.ts`（自定义间隔入口）、顶栏周期下拉（输入自定义值） | 1-2 人日 |
| P0-6 | 斐波那契家族（扩展/扇形/弧线/时区） | 技术分析最高频画线族；fib 锚点与绘制框架已在 | `engine/drawing/types.ts`（DrawingTypeId 扩展）、`engine/drawing/drawDrawings.ts`、`engine/renderer/ChartRenderer.ts`（放置逻辑） | 4-6 人日 |
| P0-7 | 画线交互补齐（克隆/多选/Shift 约束/方向键微调） | TV 画线操作肌肉记忆；命中测试与拖拽状态机已在，无新框架 | `engine/drawing/DrawingLayer.ts`（命中/多选/克隆）、`engine/renderer/ChartRenderer.ts`（Shift 约束与方向键） | 3-4 人日 |
| P0-8 | 布局保存/加载（Chart layout） | TV 核心工作流（Ctrl+S / `.`）；store 齐备，缺序列化 schema 与存取 UI | `store/layoutStore.ts`（schema）、新增 `features/layout/LayoutSaveMenu.tsx`、App 顶栏入口 | 3-5 人日 |

**P0 合计约 20-30 人日（单人约 4-6 周；2 人并行约 2-3 周）。**

---

## 3. 明确不做（Out-of-scope，防止范围蔓延）

以下为 TV 平台能力但**不属于「图表平台 1:1 复刻」核心**，建议在规格中显式排除，避免镀金：

1. **社区/社交**：Ideas 发布、评论、关注、脚本市场共享（TV 社区资产，非图表功能）。
2. **新闻流 / 经济日历 / 组合管理 / 筛选器（Screener）/ 热力图 / 基本面图表与财报数据**：依赖 TV 付费数据资产与账号体系。
3. **经纪商集成与真实下单**：项目定位为复盘/模拟交易（Paper Trading），不接券商 API。
4. **Pine strategy() 完整回测与 Deep Backtesting**：与自研复盘交易定位重叠；如做，作为独立阶段评估。
5. **账号体系/云同步/多端**：TV 的跨设备同步依赖其账号系统；当前 localStorage 本地化足够。
6. **Volume footprint / TPO / Bar Magnifier**：依赖 tick 级数据，与免费数据源能力不匹配，除非接入付费 tick 源，否则降级为 Volume Profile 近似。

---

## 4. 对下游角色的回传建议

### 给架构师（mvp-dev-expert-team-architect）
- P0-8 布局序列化需先定 schema 版本号与迁移策略（layout v1 → 未来 v2），建议纳入契约设计。
- P0-4 图表类型补齐注意 Range/PnF 等非时间类型的轴行为与 countdown 的互斥（非时间类型无收盘概念）。
- 多图表 symbol/interval sync（P1）会触碰 ChartCell 数据订阅生命周期，建议在 syncBus 上扩展 channel 时保持「绕开 React」现有原则。
- Volume Profile（P1）需在 Binance aggTrades 限频与 kline 近似之间做取舍，建议数据层适配器评估。

### 给设计师（mvp-dev-expert-team-designer）
- P0-1 快捷键无需新视觉；P0-2/P0-3 的日期浮层与倒计时标签需按 TV 一手规格出像素级稿（倒计时位置、字号、颜色 token 复用现有 `--text-dim` 体系）。
- P0-4 的 6 种图表类型的图例与工具栏图标需补充（统一 SVG 图标库方案，不用 emoji）。
- 图表设置对话框补齐 Symbol/Canvas/Events 页签（P1）时，保持现有「左导航 + 实时生效无确定按钮」的 TV 化结构。
- 全部 UI 严格遵守：图标用文字描述 + SVG 图标库，禁紫粉渐变，禁空洞占位文案。

### 验收基线建议（端到端可验证）
- P0 全部项以 `tests/e2e/` Playwright 增量用例验收：快捷键逐条映射、Go to date 跳转断言、countdown 每秒递减、6 种类型切换渲染快照、fib 5 变体锚点落位、画线克隆/多选后对象树计数、layout 保存→刷新→恢复后图表状态一致。
- 单测：周期 2m/45m/3H 聚合数值对齐既有 `aggregate.test` 金标准模式。

---

## 5. 总体判断

- **主干已齐**：图表类型 12/21、周期 20 档、指标 32+自定义、画线 12 + 交互框架、多布局 8 格 + 光标/视口联动、警报/复盘/模拟交易/自选/搜索/主题/截图——TV 图表复刻的「能用」层面已完成，且 git 历史显示团队已在做一手规格细节对齐。
- **差距结构**：约 60% 的差距是「交互映射与档位补齐」（P0，20-30 人日可清零 TV 违和感）；约 30% 是功能广度（P1，指标扩充/VP/警报丰富化/Pine 扩展，60-90 人日）；约 10% 是 TV 付费卖点与平台资产（P2/out-of-scope）。
- **建议**：下一阶段直接执行第 2 节 P0 八项，不做新架构；P1 中 Volume Profile、指标扩充、Pine 语句控制流按用户反馈排序插入。
