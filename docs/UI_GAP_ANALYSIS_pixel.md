# tradingPA × TradingView UI/交互细节维度差距分析

> 作者：颜好看（UI/UX 设计师）｜日期：2026-09-28（v1.2 回填：2026-09-30）｜版本：v1.2（v1.1 追加实施状态；v1.2 回填：收盘倒计时已交付，移出 §5.3 仍未实施列表）
> 输入：src 静态分析（global.css / ui/primitives / ui/tokens / ui/ToolbarSelect / engine/theme.ts / engine/renderer/drawCrosshair+drawAxes / ChartRenderer / features 10 面板）+ TradingView 官方 7 来源 + 第三方 DOM 抓取 1 来源
> 结论：**视觉基座对齐度高（TV 色板/字体栈/tabular-nums/双主题/crosshair 虚线吸附/图例悬停跟随均已到位）；剩余差距集中在「画布级细节（轴标签对齐/多面板价格换算）」「右键菜单广度」「快捷键面板」「设置对话框深度」「原生控件 TV 化」「Token 收敛」六层。另发现 2 项 P0 违规（emoji 作功能图标 / 硬编码颜色），须优先清除。**

---

## 0. P0 违规（立即修复，零容忍）

| # | 违规项 | 证据 | 期望 |
|---|---|---|---|
| P0-1 | **emoji 变体字符作功能图标**：复盘选 K 线预览线顶端标记用 `ctx.fillText('✀')` 绘制（U+2700，命中 emoji 检测正则 `\x{2700}-\x{27BF}`），蓝底白字圆圈内 | `src/engine/renderer/ChartRenderer.ts:1592`（`drawScissors`） | 删除字符绘制，改为按 lucide `Scissors` 的 SVG path 数据矢量绘制（canvas 与 DOM 共用同一 path 常量），描边 1.5 对齐项目全局 `svg.lucide { stroke-width: 1.5 }` |
| P0-2 | **硬编码颜色值**：交易/警报面板绕过 CSS 变量直写 hex | `features/alerts/AlertPanel.tsx:64,80`（`#ff9800`/`#26a69a`/`#ef5350`）、`features/replay/ReplayBar.tsx:204,208`（按钮底色）、`features/trading/TradePanel.tsx:56,113,131,150`、`features/trading/SummaryReport.tsx:12,29,30,31,67` | 全部改走 `var(--up)`/`var(--down)`/`var(--warn)`（warn 色板需新增）；买卖按钮底色按 TV 交易面板规格另立 `--buy`/`--sell` token，禁止裸 hex |

> 全项目扫描结果：无紫→粉渐变（通过）；`src/` 仅上述 1 处 emoji 图标；无 Lorem/Welcome to 占位（通过）。

---

## 1. UI 差距清单（主表）

| UI 区域 | TV 标准细节（尺寸/间距/颜色/动效/状态） | 当前项目表现 | 差距描述 | 优先级 |
|---|---|---|---|---|
| **十字光标·价格标签** | 价格轴 crosshair label：底色随主题反转（`crosshairLabelBgColorLight/Dark` override），深色主题 `#363a45` 底 + `#d1d4dc` 字，11px，贴价格轴左缘 | `drawCrosshair.ts:91,255-280`：11px TV_FONT、h=18、`tooltipBg` 填充、价格轴左缘 `bx = x+2` | 规格基本对齐；`by` 钳制用魔数 `9999`（line 269），应改为面板高度钳制 | P2 |
| **十字光标·多面板** | 水平线限光标所在面板；价格标签按**该面板**的价格轴换算（副图有自己的 priceScale） | `drawCrosshair.ts:90`：`priceScale.yToPrice(crosshair.y - paneY)` 始终传入主价格轴 | 悬停副图面板时价格标签数值错误（用主轴刻度读副图位置）。需按命中面板传对应 priceScale | **P1（功能错误）** |
| **十字光标·时间标签** | 时间轴 label 垂直居中于时间轴条，左右越界时 clamp 在轴内 | `drawCrosshair.ts:271`：仅 `bx = Math.max(0, bx)`，右边界无钳制 | 光标贴画布右缘时标签溢出画布；应双向 clamp | P2 |
| **图例·OHLCV 排布** | 商品行 16px 加粗代码 + 周期/交易所灰字；O/H/L/C 按 K 线涨跌着色；涨跌值带正负号与百分比；量用 K/M/B 两位小数；zh 图例标签为「开 高 低 收」（无等号） | `drawCrosshair.ts:120-165`：16px 代码 + 13px meta + `开=`/`高=`/`低=`/`收=` 带等号，颜色/涨跌/量格式均已对齐 | 标签文案与 TV zh 有「=」差异（待 TV zh 实测终验）；其余无差距 | P2 |
| **图例·指标行悬停按钮** | eye/gear/remove 三按钮 16px 间距，与 DOM 图标同一视觉体系 | `drawCrosshair.ts:209-247`：canvas 手绘，描边 1px（gear）/1px 线条，与 lucide 1.5 光学重量不一致 | 手绘图标与 lucide 体系脱节（尺寸/描边/主题无 token 约束）。应抽取共享 SVG path 常量（lucide 源数据），canvas 按同一 path 绘制 | P1 |
| **图例·状态点/日涨跌** | 商品行含 market status 圆点（开市绿/闭市红）+ logo；日内周期显示「最后一日变化值」（`showLastDayChange`） | 无市场状态圆点；仅有单 K 线涨跌，无当日累计涨跌 | TV 状态行两要素缺失 | P2 |
| **价格轴·标签对齐** | 价格轴标签**右对齐**贴轴右缘（`alignLabels` 默认 right），字号 11px，色 `#b2b5be`(dark)/`#50535e`(light) | `drawAxes.ts:60-68`：`textAlign='left'`，`fillText(x = chartW+6)` | 标签紧贴分隔线而非贴右缘，与 TV 观感差异明显 | **P1** |
| **价格轴·宽度** | 内容自适应（约 66-72px，长价数字展宽） | `AXIS_WIDTH = 64` 固定 | 固定宽度在长价格（BTC/低价股）下标签余量不均 | P2 |
| **时间轴·高度/格式** | 轴条约 26px；日内 `HH:mm`，日线月/日短格式，跨年带年 | `AXIS_HEIGHT = 24`；`formatTime`：`>=300px→YYYY-MM`、`>=60px→MM-DD`、else `HH:mm` | 高度差 2px；`YYYY-MM`/`MM-DD` 分隔符与 TV zh（月/日）有差异；跨年规则未实现 | P2 |
| **刻度密度** | 价格刻度按面板高度自适应（约 5-8 条） | `priceScale.ticks(6)` 固定 6 条 | 小高度面板刻度过密/大高度过疏 | P2 |
| **最新价徽章** | 方向着色圆角方块（radius 3）+ 白字 + 宽度自适应文本；配 [2,2] 点线横贯 | `drawAxes.ts:130-166`：点线 + roundRect 3 + 白字，`minWidth 58` 硬下限 | 短价格标签被撑到 58px，偏宽 | P2 |
| **价格轴·快捷入口** | 价格轴底部「+」按钮（跟随光标建警报）+ 齿轮（更多价格坐标设置） | 无 | 缺失 | P2 |
| **图表右键菜单** | 完整 14 项：Reset chart view(Alt+R) / Copy price / Paste(Ctrl+V) / Add alert on X at price…(Alt+A) / Trade / Add X to watchlist(Alt+W) / Watchlist 子菜单+Create new list… / Add text note(Alt+N) / Lock vertical cursor line by time / Object Tree… / Color Theme / Remove drawings / Remove indicators / Settings… | `ChartContextMenu.tsx`：仅 5 项（上穿警报/下穿警报/加入自选股/指标…/重置图表） | 复刻核心交互缺口最大处：缺复制价格、粘贴、文本注释、锁定垂直线、对象树入口、颜色主题、移除画线、移除指标、设置…共 9 项 | **P1** |
| **图表右键·警报模型** | 单项「Add alert on X at price…」→ 弹出警报对话框（可改条件/通知方式） | 直接创建上穿+下穿两条警报，无对话框 | 交互模型不同：TV 是「确认前置」，项目是「直接执行」 | P1 |
| **菜单·快捷键提示** | 带快捷键的菜单项右对齐灰色提示（Alt+R / Alt+A / Alt+W…） | 仅画线 flyout 有 hotkey 提示（`HOTKEYS`） | chart menu / watchlist menu 缺提示 | P2 |
| **菜单·圆角/行高** | 菜单圆角约 6px、项高约 28px、悬停整行填充 | 各菜单硬编码 radius 4（ChartContextMenu/Watchlist/Legend/Drawing/IndicatorPanel）或 6（DrawingToolbar flyout）；项高 25-28 不一 | 项目内部不一致 + 与 TV 有差 | P1（收敛 token） |
| **画线右键菜单** | 设置/克隆/移除/视觉顺序 + 复制/粘贴/锁定/设为默认 | `DrawingContextMenu.tsx`：设置/移除/克隆/视觉顺序子菜单 | 缺复制粘贴、锁定 | P2 |
| **快捷键面板** | TV 头像 →「键盘快捷键」完整清单页（charting_library 注明 dialog 需自研） | 无快捷键面板 | 整体缺失；已实现快捷键散落无出处 | **P1** |
| **快捷键覆盖** | Alt+A 警报 / Alt+N 注释 / Alt+G 前往日期 / Alt+R 重置视图 / Alt+L 对数 / Alt+P 百分比 / Alt+W 加入自选 / Ctrl+Alt+H 隐藏所有图形 / Shift+F 全屏 / Alt+S 快照 / 数字键切周期 / 字母键切品种 / Alt+Enter 最大化 / Alt+C 十字线 / Alt+I 反转 | 已有：`/`+Ctrl+K 搜索、Alt+T/H/J/V/F/Shift+R 画线、Ctrl+Z/Y、Delete、Enter、+/-、←/→、Esc | 高频缺 Alt+A/R/L/P/W（P1），其余（P2） | P1+P2 |
| **指标对话框** | 左导航 180px 全宽行无强调条、输入/样式/可见范围三页签、实时生效、Defaults 按钮 | `IndicatorSettingsDialog.tsx`：结构已对齐（180px 导航/三页签/实时生效/应用默认值） | 样式页缺 plot 类型下拉（线/柱/面积等，TV 每 plot 均有）；输入页 number 用裸 `input[type=number]`（TV 为 stepper） | P2 |
| **图表设置对话框** | 9 页签：商品代码/状态行/坐标和线条/画布/交易/一般/外观/警报/事件/模板；入口 3 个（顶栏齿轮/底部齿轮/双击价格线或 K 线） | `ChartSettingsDialog.tsx`：3 页签（坐标轴/状态栏/外观），坐标轴页仅 3 勾选，无网格四态（横/纵/双/无）、无价格坐标位置/模式、无时间坐标格式 | 深度差距大，是「设置」维度最大缺口 | **P1** |
| **对话框动效** | 打开约 150ms 缩放淡入 | Radix 默认无动画 | 缺 data-state 进入/退出动效 | P2 |
| **顶栏工具栏** | 品种按钮（含开闭市圆点）/周期/图表类型/指标/警报/注释/前往日期/布局/模板保存/快照/发布/撤销重做 | `App.tsx`：品种/周期/类型/回放/指标/模板保存加载/撤销重做/布局/设置/Pine/搜索/全屏/快照/刷新/主题 | 缺警报按钮、文本注释、前往日期、命名图表布局保存（区别于指标模板）；品种按钮缺市场状态圆点 | P1（警报/布局）/P2 |
| **画线工具栏** | 52px 独立列；8 大类分组 + flyout；激活=强调色实心圆角块+白图标；底部 磁吸/保持/锁定/隐藏/移除 + caret 子菜单 | `DrawingToolbar.tsx`：52px 列、6 组+flyout、175/300ms 双定时器、磁吸两档、底部 5 控件+caret | flyout 展开时主按钮无持续高亮（TV 展开即高亮）；缺 Measure/Zoom-in 工具组（TV 底部有） | P2 |
| **顶栏图标态** | default/hover(panel-2)/active(accent 实心+白字)/focus-visible/disabled/loading | `IconButton`（primitives.tsx）：default/hover/active/focus-visible 有；**disabled/loading 无**；hover 用 JS 内联 style 切换（瞬变无 150ms 过渡，且与 CSS 类抢优先级） | 补 disabled/loading 两态 + hover 过渡收敛到 CSS | P2 |
| **图标尺寸体系** | TV：顶栏 ~16px / 画线 ~18px / 菜单 ~14px | 实际 5 档混用：13（菜单/watchlist）、14（顶栏 select caret）、15（顶栏按钮）、17（画线/右轨）、19（搜索图标） | 未收敛；建议并入 `tokens.ts`：14/16/18 三档 | P1 |
| **加载状态** | 初始载入时图表区有加载指示 | `App.tsx:377` 仅 error 态有覆盖层；`status='loading'/'idle'` 且 bars=0 时画布全空白 | 首次加载无任何反馈 | **P1** |
| **空/错误状态** | 错误有具体原因+重试引导 | error 覆盖层有 `statusDetail` 具体文案（「无法载入 K 线」+原因）——符合反空洞占位；watchlist 空态有引导+链接；搜索有空态 | 已达标；错误态可加重试按钮 | P2 |
| **Toast 反馈** | 操作成功反馈（已添加警报/已保存模板/已加入自选） | `zIndex.toast=70` 已预留但无 Toast 组件 | 缺全局 toast | P2 |
| **深浅主题一致性** | crosshair label 底色随主题反转；UI tooltip 深色两主题一致 | canvas light `tooltipBg:#131722`（`theme.ts:58`）vs UI light `--tooltip-bg:#2a2e39`（global.css:89） | 两处 tooltip 底色不一致，应统一 token 值 | P2 |
| **深浅主题一致性** | 浅色 elevated 表面与边框有层次 | light `--elevated:#e0e3eb` 与 `--border:#e0e3eb` 同值 | 平盘色块与边框同色，层次弱 | P2 |
| **深浅主题一致性** | 主题切换画布即时重绘 | `Chart.tsx:309-313` themeName 变更即 redraw | 无差距 | — |
| **圆角 Token** | TV：tooltip/轴标签 3px、菜单 6px、弹窗 6-8px | `tokens.ts` 定义 4/6/8；组件硬编码 3（tooltip/last-price）/4（7 处菜单）/6（flyout）/8（Modal/SymbolSearch）混用 | token 定义未被遵守；应收敛为 sm3/md6/lg8 并全量替换 | P1 |
| **阴影 Token** | TV 三级：flat/ring/raised | 仅 `shadow.menu` 一个 token；另硬编码 `0 2px 4px rgba(0,0,0,.2)`（flyout/IndicatorPanel）、`0 1px 4px rgba(0,0,0,.3)`（tooltip） | 收敛为 elev-flat/ring/raised 三档 | P1 |
| **边框 Token** | 1px `--border` 统一 | 全部组件 `1px solid var(--border)` | 无差距 | — |
| **原生控件** | 自定义勾选框（accent 底+白勾 radius 2-3）、自定义下拉、自定义色板 | 设置/指标对话框用原生 `input[type=checkbox]`、原生 `<select>`（lineWidth/精度/周期）、裸 `input[type=color]` 22px | 深色主题下原生控件样式出戏、select 弹系统菜单；ToolbarSelect 已有实现可复用为通用下拉 | **P1** |
| **底部面板** | 时间范围预设条（1D/5D/1M/3M/6M/1Y/5Y/All）+ Go to date + 时区选择 + 齿轮；导航按钮（缩放/平移/重置） | `StatusBar.tsx`：UTC 标签 + 数据状态 + %/log/auto 三开关 | 缺预设时间范围条、前往日期、时区选择、底部齿轮入口、导航按钮 | P1 |
| **画布级特性** | Watermark（代码+周期半透明）、Bid/Ask 标签、Symbol name label、High/Low 标签 | K 线收盘倒计时已交付（TV-ALIGNMENT B3：`engine/countdown.ts` + 51 条单测 + E2E 行为断言）；水印为死开关（设置 UI 就位、引擎未渲染）；其余均无 | TV 画布信息层缺失；水印对复刻辨识度影响大 | P2 |
| **字体字重** | TV Trebuchet MS，字重 400/600/700 | 项目 400/500/600/700 混用（如 watchlist 500 价格、symbol 700） | 微差；建议 400/600/700 三档 | P2 |

---

## 2. 无差距项（已对齐，勿回改）

| 区域 | 对齐细节 |
|---|---|
| 色板 | dark `#131722/#1e222d/#2a2e39/#d1d4dc/#b2b5be/#787b86/#2962ff`、light `#ffffff/#f0f3fa/#e0e3eb/#131722/#50535e` 全套对齐 TV；涨跌两套色分离（UI `#089981/#f23645` vs 画布 `#26a69a/#ef5350`）与 TV 一致 |
| 字体 | Trebuchet MS 优先栈 + canvas `TV_FONT` 同源 + 全局 `tabular-nums` |
| 十字光标 | 4-4 虚线、垂直吸附 bar 中心、水平限面板内、颜色 `#758696`(dark)/`#9598a1`(light) |
| 图例交互 | 悬停跟随光标、否则显示最后一根、指标三档开关、超出高度折叠行数 |
| 磁吸 | 弱/强两档 + caret 菜单 |
| flyout | 175ms 激活 / 300ms 展开双定时器、松开不关、行尾快捷键 |
| 面板分隔 | 可拖拽 + ns-resize 光标 + 拖拽禁文本选中 |
| 主题基建 | focus-visible 2px `#2962ff`、prefers-reduced-motion、8px 细滚动条三态 |
| 报价闪烁 | tick-flash-up/down 600ms 涨绿跌红底色淡出 |
| 品种搜索 | 顶部锚定（top:72）+ 最近访问 + ↑↓/Enter + Esc + 高亮匹配 + footer 快捷键提示 |
| 对话框 | TV 化左导航、实时生效无确定按钮、44px 标题栏 |
| watchlist | 行高 44、吸顶列头、拖拽排序、涨跌幅实心色块、× 悬停显现、CSV 导出 |

---

## 3. 建议修复顺序

**第一批（P0，Gate 硬性）**：✀ emoji 图标 → lucide path 矢量绘制；交易/警报面板 hex → token 化。

**第二批（P1，TV 一手规格对齐核心）**：
1. 多面板 crosshair 价格换算 bug（功能错误）
2. 价格轴标签右对齐 + 时间标签双向 clamp
3. 图表右键菜单补齐 9 项 + 警报改对话框模型 + 快捷键提示
4. 快捷键面板（对话框）+ 高频快捷键 Alt+A/R/L/P/W
5. 图表设置对话框加深（坐标和线条/画布/时间坐标）+ 入口补底部齿轮与双击价格线
6. 初始加载态（loading 覆盖层/骨架）
7. 原生 checkbox/select/color → TV 化自定义控件（复用 ToolbarSelect）
8. Token 收敛：radius 3/6/8、shadow 三档、图标尺寸 14/16/18 三档并入 tokens.ts
9. 底部时间范围预设条
10. 图例悬停按钮/pane 按钮抽共享 SVG path 常量

**第三批（P2，打磨）**：市场状态圆点、日涨跌、watermark（引擎渲染接线或撤离开关）、价格轴 + 按钮、Bid/Ask、菜单快捷键提示全量化、时间格式 zh 化、Toast、对话框动效、字重三档、浅色 elevated 分层。

---

## 4. 调研来源（TradingView 侧，8 来源）
1. TradingView 帮助中心《如何配置您的超级图表》cn.tradingview.com/support/solutions/43000748166 —— 设置 9 页签结构、价格坐标 4 模式、网格四态、坐标标签设置
2. TradingView 键盘快捷键页 cn.tradingview.com/support/shortcuts —— 全量快捷键（图表/指标绘图/自选表三组）
3. TradingView Charting Library Docs《UI elements》charting-library-docs/latest/ui_elements —— 界面分区、widget bar、对象树/数据窗口
4. TradingView Charting Library Docs《Chart overrides》—— legend 7 项开关、crosshair 属性、scalesProperties（fontSize/alignLabels/crosshairLabelBgColorLight/Dark）
5. TradingView 帮助中心《TradingView 警报介绍》43000520149 —— Alt+A、右键建警报、价格轴 + 按钮
6. TradingView 帮助中心《Drawing tools available on TradingView》43000703396 —— 画线工具栏 8 大类 + Measure/Zoom/Magnet/Stay/Lock/Hide/Remove 结构
7. TradingView 帮助中心《Getting started with Supercharts》43000746464 —— 左/右/底部工具栏组成
8. StackOverflow #76705973（TV canvas 右键菜单 DOM 抓取）—— 图表右键菜单完整 14 项及快捷键提示

---

## 5. 实施状态（v1.1，2026-09-28 回填）

> 实施人：颜好看（任务 #8 React chrome / 主题 / 对话框 / 快捷键体系精修）。验证：emoji 正则扫描 CLEAN、UI hex 扫描 CLEAN、`tsc --noEmit` 干净、`vitest run` 130/130 通过。

### 5.1 已修复

| 原差距 | 实施 |
|---|---|
| P0-1 emoji 图标 | `ChartRenderer.ts` `drawScissors` 重写为 lucide `Scissors` path 等比缩放矢量绘制（两指环 + 三剪线，lineWidth 1.5 圆角线帽） |
| P0-2 硬编码颜色 | AlertPanel / ReplayBar / TradePanel / SummaryReport 共 14 处 → `var(--up)`/`var(--down)`；global.css 双主题新增 `--warn: #ff9800`（已触发警报/平仓键） |
| 价格轴标签左对齐 | `drawAxes.ts` 改右对齐贴轴右缘（`AXIS_TEXT_INSET = 58`，即 64px 轴宽 − 6px 呼吸） |
| 时间轴标签右缘溢出 | `drawCrosshair.ts` `drawAxisLabel` 增加 bounds 参数：时间标签双向 clamp（右缘上限 = chartW − 标签宽）、价格标签垂直钳制在悬停面板内（替换原魔数 9999） |
| 图标尺寸 8 档混用 | 全项目收敛为 4 档并写入 `tokens.ts`：`icon.sm 12`（旗标/排序箭头/行内提示）/ `icon.md 14`（菜单/面板控件）/ `icon.lg 16`（顶栏与面板头按钮）/ `icon.xl 18`（画线工具/右轨） |
| 圆角/阴影 token 不收敛 | `tokens.ts` 圆角四档 xs3/sm4/md6/lg8 + 阴影四档 tooltip/popover/menu/modal；菜单 4→6、对话框 4→8、tooltip 阴影独立、Modal 用 modal 级阴影；顺带修复 WatchlistPanel 菜单项内联 radius 4 覆盖 `.tv-menu-item` 全出血行样式的问题 |
| 初始加载无反馈 | `App.tsx` 新增 loading 覆盖层（bars=0 且 idle/loading/reconnecting：LoaderCircle spin + 状态文案，reconnecting 专属文案） |
| 图表右键菜单仅 5 项 | `ChartContextMenu.tsx` 重写为 12 项：重置图表(Alt+R)/复制价格/添加警报…(Alt+A)/加入自选股(Alt+W)/添加文本注释(Alt+N)/对象树…/颜色主题/移除画线/移除指标/指标…/设置…；警报改 TV 对话框模型（价格预填+方向选择，创建后开警报面板）；菜单项右侧快捷键提示 |
| 快捷键面板缺失 | 新增 `features/settings/ShortcutsDialog.tsx`（? 打开）；`App.tsx` 绑定 Alt+A/W/N/R/L/P/S、Ctrl+Alt+H，均在输入框/菜单/对话框内不劫持 |
| 原生控件出戏 | `primitives.tsx` 新增 `Checkbox`/`CheckRow`（role="checkbox" 键盘可达，16px 方块选中强调色底白勾）；ChartSettingsDialog / IndicatorSettingsDialog / DrawingSettingsDialog 原生 checkbox 全替换；IndicatorSettingsDialog 三个 select + DrawingSettingsDialog 线宽 + AlertPanel 方向 → `ToolbarSelect` 复用 |
| 底部面板缺预设条/齿轮 | `StatusBar` 新增时间范围预设条（1D/5D/1M/3M/6M/1Y/5Y/All）+ 图表设置齿轮；`ChartRenderer.showRange(fromTime)` 二分定位回看区间 |

### 5.2 分析修正（误报撤回）

- ~~多面板 crosshair 价格换算 bug（P1 功能错误）~~：**误报**。调用点 `ChartRenderer.ts:1431` 已传 `hoveredPane.priceScale`（`hoveredPaneId` 随 mousemove 经 `paneAt(y)` 更新），悬停副图时价格标签本就按该面板刻度换算。初版分析只读了 `drawCrosshair.ts` 未见调用点，特此更正。
- 图例悬停按钮 canvas 手绘图标：复验 lineWidth 1 ≈ lucide@16px 光学重量（1.5 × 16/24 ≈ 1.0），**无需改**。

### 5.3 仍未实施（需引擎能力或归属其他任务，见主表 P2）

> v1.2 回填（2026-09-30）：「收盘倒计时」已于 TV-ALIGNMENT B3 交付（`engine/countdown.ts` 纪元对齐 + 日历分桶、价格轴右端 mm:ss 递减接线、51 条单测），自本列表移除；主表「画布级特性」行与 §3 第三批中的倒计时表述本次未动（按回填范围「其余保持」）。

- 图表设置对话框 9 页签深度（水印/背景色/坐标位置/网格四态等依赖渲染引擎能力，归属任务 #4）
- Toast 系统、对话框 150ms 进入动效、market status 圆点、当日累计涨跌、watermark、价格轴「+」按钮、Bid/Ask 标签、时间格式 zh 化、字重三档收敛、浅色 elevated 分层
- 指标对话框样式页 plot 类型下拉、输入页 number stepper（TV 规格深化）

### 5.4 E2E 回归修复（前端队友回报，2026-09-28 闭环）

| 回归 | 根因 | 修复 |
|---|---|---|
| settings.spec.ts:32 strict mode 命中 2 个「图表设置」 | 底部齿轮与顶栏 IconButton aria-label 重复；且 `getByRole` name 默认**子串匹配**，第一版「图表设置（底部）」仍含目标子串、修复无效 | 底部齿轮 aria-label → 「图表底部设置」（StatusBar.tsx:102），title 保持「图表设置」 |
| settings.spec.ts:35 getByLabel('网格线') 潜在落空 | 原生 input 靠包裹 `<label>` 被 getByLabel 命中；换 TV 化 CheckRow（button role=checkbox）后需 aria-label | primitives.tsx CheckRow 补 `aria-label={label}`；全部 6 类 getByLabel 查询审计无恙 |

运行时 E2E 复跑受阻：本沙盒 @playwright/test runner 环境性挂起（safe-delete shim ETIMEDOUT + 僵尸 Chrome 累积），已交前端队友在健康环境复跑闭环。
