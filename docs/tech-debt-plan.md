# tradingPA 技术债收尾施工蓝图（遗留 1-4）

> 作者：首席架构师 高见远 ｜ 日期：2026-09-28 ｜ 状态：待施工
> 范围：SPEC-TV-ALIGNMENT v2.0 范围外的四项在案债务收尾（拆分 ×2 + 数据层 defer ×2）。
> 方法：沿用 D 批次 ChartRenderer 拆分既定范式（docs/tech-refactor-assessment.md §2.1）：
> 原文件变 barrel/薄 shim 重导出，调用点 diff 为 0，纯搬迁零行为变更。

## 0. 全程硬约束（施工与验收共用）

1. 公开 API 零改动：所有既有 import 路径（`./seriesRenderers`、`./drawCrosshair`、`useChartSeries` 返回的 `ChartSeries` 接口）签名与语义不变，调用点 diff = 0。
2. 每模块 ≤300 行；新文件单一职责；入口只装配。
3. 像素中性：20 面黄金截图零 diff；E2E 47 例全绿；`npm run typecheck` + `npm test`（44+ 单测）全过。
4. 提交纪律：单文件提交白名单，`git add <明确路径>`，禁 `add -A`、禁 `.bak`；建议一遗留一到两个提交。
5. 团队 P0：canvas 内的 eye/gear/remove 图标已是 path 绘制（非 Unicode/emoji），拆分仅搬迁，不重绘、不改样式。

---

## 1. 遗留 1：seriesRenderers.ts（470 行）拆分

### 1.1 调用点闭合（grep 已验证）

| 调用方 | import 内容 | 兼容方式 |
|--------|-------------|----------|
| `src/engine/renderer/PaneRenderer.ts:13` | 10 个 draw 函数 | barrel 重导出，零改动 |
| `tests/unit/series-renderers.test.ts:9-16` | 同 10 个函数（经 `@/engine/renderer/seriesRenderers`） | 同上 |

全仓仅此两个 import 点，barrel 方案闭合。

### 1.2 模块映射表（按绘制家族分组，依赖 DAG 单向）

```
seriesTheme.ts        主题色解析（--accent 令牌 + 回落）            ~30 行
   ↑ 被 lineSeries / areaSeries 依赖
ohlcSeries.ts         竹线/高低图家族：drawOhlcBars + drawOhlc + drawHighLow   ~95 行
lineSeries.ts         线形家族：drawLine + drawBaseline + drawStepLine + drawLineMarkers  ~155 行
   （drawBaseline 复用 drawLine；drawLineMarkers 复用 drawLine + seriesLineColor）
areaSeries.ts         面积家族：drawArea + drawHlcArea（几何同构，均双色渐变填充）  ~140 行
columnSeries.ts       实体柱家族：drawColumns + drawVolumeCandles（实体宽度编码族）  ~95 行
   （drawVolumeCandles 降级时调用既有 drawSeries.drawCandles）
seriesRenderers.ts    barrel：仅 re-export，无逻辑                    ~15 行
```

| 模块 | 职责 | 行数预算 | 导出 |
|------|------|----------|------|
| `seriesTheme.ts` | `seriesLineColor()`（含模块级缓存），私有 | ~30 | 无（模块内私有，仅同目录导出给 line/area） |
| `ohlcSeries.ts` | OHLC tick 几何（竖线 + 左开右收） | ~95 | `drawOhlc`, `drawHighLow` |
| `lineSeries.ts` | 收盘价折线族（线形/基线/阶梯/带标记） | ~155 | `drawLine`, `drawBaseline`, `drawStepLine`, `drawLineMarkers` |
| `areaSeries.ts` | 渐变填充面积族（面积/HLC 面积） | ~140 | `drawArea`, `drawHlcArea` |
| `columnSeries.ts` | 实体柱族（柱状/成交量蜡烛） | ~95 | `drawColumns`, `drawVolumeCandles` |
| `seriesRenderers.ts` | barrel | ~15 | 上述全部 10 个函数原签名 |

分组理由：TV 图表类型按「几何同构」聚族——line 族共享折线骨架与 seriesLineColor；area 族共享渐变填充模板；ohlc 族共享 tick 几何；column 族共享实体宽度逻辑。后续按 TV 类型逐个对齐像素时，修改面收敛到单一家族文件。

### 1.3 barrel 形态（照 ChartRenderer.ts shim 先例）

```ts
// src/engine/renderer/seriesRenderers.ts
export { drawOhlc, drawHighLow } from './ohlcSeries';
export { drawLine, drawBaseline, drawStepLine, drawLineMarkers } from './lineSeries';
export { drawArea, drawHlcArea } from './areaSeries';
export { drawColumns, drawVolumeCandles } from './columnSeries';
```

### 1.4 迁移注意（内嵌坑）

- `seriesLineColor()` 的模块级缓存（lineColorCache/lineColorCacheKey）**必须随函数整体迁入 seriesTheme.ts**，不得在新模块各建一份缓存——双缓存会导致主题切换后两族颜色不一致。
- `drawBaseline` 内联调用 `drawLine(...)`，两函数须同模块（lineSeries.ts），保持调用为模块内直接引用。
- 所有搬迁为**逐字节剪切**：clip 矩形、`Math.round(x)+0.5` 半像素对齐、渐变 `addColorStop` 的 alpha 后缀拼接（`color + '55'`）一个字符都不能动，否则黄金截图立即 diff。
- 搬迁后 `seriesRenderers.ts` 原 import（theme、drawCandles、各类型）随函数分散到新模块，barrel 自身无 import。

---

## 2. 遗留 2：drawCrosshair.ts（337 行）拆分

### 2.1 调用点闭合（grep 已验证，共 10 个 import 点）

| 调用方 | import 内容 |
|--------|-------------|
| `RenderPipeline.ts:9` | `drawCrosshair`, `drawLegendBlock`, `LegendInfo`, `LegendStudyValues`, `LegendDrawInfo` |
| `ChartState.ts:9` | `DEFAULT_LEGEND_OPTIONS`, `LegendOptions`, `StudyLegendRect` |
| `ChartController.ts:10` | `LegendInfo`, `LegendOptions`（type） |
| `App.tsx:41-42` | `LegendOptions`（type）, `DEFAULT_LEGEND_OPTIONS` |
| `ChartSettingsDialog.tsx:6` | `LegendOptions`（type） |
| `LegendContextMenu.tsx:3` | `LegendOptions`（type） |
| `cursor.ts:8` / `HoverController.ts:5` / `InputController.ts:7` | `StudyLegendRect`（type） |
| `tests/unit/legend-fields.test.ts:2` | `legendFieldsFor` |

全部经 `./drawCrosshair` 或 `@/engine/renderer/drawCrosshair` 单点导入，barrel 方案闭合。

### 2.2 模块映射表

| 模块 | 职责 | 行数预算 | 导出 |
|------|------|----------|------|
| `legendTypes.ts` | 全部类型与常量：LegendInfo / LegendOptions / DEFAULT_LEGEND_OPTIONS / LegendDrawInfo / LegendStudyValues / StudyLegendRect | ~75 | 5 个 interface + 1 个 const，全部 type-only 导出 |
| `drawLegend.ts` | 图例绘制：`drawLegendBlock` + 私有 `drawStudyButtons` / `formatVolume` / `formatIndicatorValue` + 纯函数 `legendFieldsFor` | ~190 | `drawLegendBlock`, `legendFieldsFor` |
| `crosshairOverlay.ts` | 十字光标：`drawCrosshair` + 私有 `drawAxisLabel`（价格/时间轴标签，仅被 drawCrosshair 使用） | ~80 | `drawCrosshair` |
| `drawCrosshair.ts` | barrel | ~20 | `drawCrosshair`, `drawLegendBlock`, `legendFieldsFor`, `DEFAULT_LEGEND_OPTIONS` + 5 类型 |

拆分理由：文件实为「十字光标 + 图例」两个绘制家族误置同名文件；类型先行独立成 legendTypes.ts，避免 drawLegend 逼近 300 行红线，也给后续图例右键菜单扩展留量。

### 2.3 barrel 形态

```ts
// src/engine/renderer/drawCrosshair.ts
export { drawCrosshair } from './crosshairOverlay';
export { drawLegendBlock, legendFieldsFor } from './drawLegend';
export {
  DEFAULT_LEGEND_OPTIONS,
  type LegendInfo,
  type LegendOptions,
  type LegendDrawInfo,
  type LegendStudyValues,
  type StudyLegendRect,
} from './legendTypes';
```

### 2.4 迁移注意（内嵌坑）

- `drawLegendBlock` 与 `drawCrosshair` 之间**无相互调用**，两模块完全解耦，可任意顺序搬迁。
- `drawLegendBlock` 依赖 `formatTime`（来自 `./drawAxes`）与 `DrawGeometry`（来自 `./drawSeries`），import 路径不变，仅宿主文件迁移。
- `legendFieldsFor` 是被单测直接点名的纯函数，签名与返回形状逐字保留。
- eye/gear/remove 三个悬停按钮为 canvas path 绘制（团队 P0 合规存量），原样剪切。

---

## 3. 遗留 3+4：useChartSeries 聚合路径数据层补实

### 3.1 现状勘察结论（代码已读，行号以当前 HEAD 为准）

- 聚合路径（useChartSeries.ts L97-123）：非原生周期 crypto → `nativeBaseInterval` 推导基期 → 一次性 `fetchKlines` → `aggregateBars` → `setHistory` → return，**无 WS、无轮询、无翻页**。L100-101 注释自述两个已知边界。
- `klineCache.merge(cached, fresh)` 语义（klineCache.ts L56-61）：**fresh 覆盖 cached 中同 time 的 bar**，按 time 升序输出。即「后者赢」——这决定轮询/翻页合并必须把"更完整的那一侧"放在 fresh 参数位。
- `loadMore`（L219-225）：crypto 统一路由 `feedRef.current?.loadMore()`，聚合路径下 feedRef 为 null → 空操作。
- 黄金截图事实（已核实）：`tests/e2e/visual-regression.spec.ts` 的 timeframe-2m/45m 表面走 **harness 路径**（`openHarness`，1m 种子数据经 `aggregateBars` 直接 `setData`），不经 useChartSeries、不发起任何网络请求。轮询/翻页改动对黄金表面**结构性不可见**；但防御性约束仍然成立（见 §3.6）。
- E2E 计数已核实：drawing 1 + interactions 5 + pine 1 + settings 2 + smoke 10 + visual-regression 20 + watchlist 8 = **47 例**。
- 既有状态机（非 crypto 路径）：`pagingRef` 防重入 / `noMoreRef`（连续 2 次空或失败）/ `pageFailsRef` / `retryAtRef`（3s 退避）/ `readyRef`（在途禁翻页）/ `loadTokenRef`（周期切换 token 失效）。

### 3.2 总体设计：抽 `AggregateFeedPath` 控制器 + 纯函数库

新逻辑全部落 `src/data/aggregatePath.ts`（放 data 层理由：纯数据编排、零 React、与 feed/ 同层，便于注入 fetch mock 单测；useChartSeries 只做装配）。

**关键决策：hook 行数预算。** useChartSeries.ts 当前 257 行，逼近 300 红线。轮询定时器 + 翻页编排若内联写入将破线。因此编排逻辑整体迁入 `AggregateFeedPath` 类（~150 行），hook 内净增 ≤20 行（构造 + cleanup + loadMore 分支），成品预估 ~275 行，守住红线。

### 3.3 AggregateFeedPath 接口设计

```ts
// src/data/aggregatePath.ts
import type { Bar, Timeframe } from '@/types/market';

/** 依赖注入：fetch 可替换为 mock（vitest 注入假 fetchKlines） */
export interface AggregatePathDeps {
  symbol: string;                 // inst.code
  baseInterval: string;           // binanceIntervalString(baseSeconds)，如 '1m'/'15m'
  tf: Timeframe;                  // 目标周期
  ratio: number;                  // Math.ceil(tf.seconds / baseSeconds)
  historyLimit: number;           // HISTORY_LIMIT（800）
  fetch: (symbol: string, interval: string, opts: { endTime?: number; startTime?: number; limit?: number }) => Promise<Bar[]>;
  onBars: (agg: Bar[]) => void;   // hook 侧：setHistory + klineCache.put（缓存键 = 目标周期 id，沿用现状）
  onError?: (message: string) => void;
}

export class AggregateFeedPath {
  constructor(deps: AggregatePathDeps);

  /** 初始拉取（limit = min(BINANCE_LIMIT_MAX, historyLimit*ratio)）→ 聚合 → onBars → 起轮询 */
  start(): Promise<void>;

  /** 向左翻页：拉 endTime = 最早基期 time - 1 的更早窗口，拼接基期数组，全量重聚合，onBars。
   *  返回本次拉到的基期 bar 数（0 = 源已无更早数据）。内部 loadingMore 防重入。
   *  语义与 LiveDataFeed.loadMore(): Promise<number> 对齐，hook 分支可对称替换。 */
  loadMore(): Promise<number>;

  /** 当前最早基期 bar time；null = 尚无数据 */
  get earliestBaseTime(): number | null;

  /** 停轮询、置 disposed（防迟到回调）、拒绝后续 tick */
  dispose(): void;
}
```

### 3.4 纯函数签名（aggregatePath.ts 内导出，单测直接命中）

```ts
/** 轮询间隔：clamp(基期毫秒 / 2, 5000, 30000)。
 *  理由：桶封闭由轮询负责，bar 内价格由既有 quoteStore 5s 报价轮询经 applyQuote 维持——
 *  轮询无需秒级；基期/2 保证分钟级周期在半个基期内封闭新桶；上下 clamp 守住
 *  请求预算（30s 下限 = 每源 ≤2 次/分）与新鲜度（5s 上限，2m 图基期 1m → 30s 节拍）。 */
export function aggregatePollIntervalMs(baseSeconds: number): number;

/** 初始窗口 limit：min(BINANCE_LIMIT_MAX, historyLimit * ratio) */
export function initialWindowLimit(ratio: number, historyLimit: number): number;

/** 尾柱是否实质变化：length 或末 bar 的 time/close 变化即 true。
 *  轮询每拍合并后调用，false 则跳过 onBars——同数据不触发 setHistory，
 *  这是「同数据同渲染」非确定性的主防线（无引用级抖动）。 */
export function tailChanged(prev: Bar[], next: Bar[]): boolean;

/** 合并 + 重聚合：incoming 放 fresh 位（klineCache.merge 后者赢），
 *  保证交易所修订过的同 time 基期 bar 与更完整的边界桶覆盖旧值。 */
export function mergeAndAggregate(baseBars: Bar[], incomingBase: Bar[], tf: Timeframe): Bar[];

/** 翻页拉取参数 */
export function loadMoreOpts(earliestBaseTime: number, ratio: number, historyLimit: number):
  { endTime: number; limit: number };   // endTime = earliestBaseTime - 1；limit 同 initialWindowLimit
```

### 3.5 时序（文字版）

**轮询（遗留 3）：**

```
effect 装配（crypto 且 nativeBaseInterval 非 null）
  └─ aggPath = new AggregateFeedPath({ ..., fetch: fetchKlines, onBars: (agg) => {
       readyRef.current = true;
       setHistory(agg); void klineCache.put(inst.id, timeframe, agg); } })
     └─ start(): fetch 初始窗口 → mergeAndAggregate([], base, tf) → onBars → setInterval(poll)
cleanup: aggPath.dispose()  // 随 effect 返回，token/disposed 双守卫
每拍 tick:
  disposed? | document.hidden? | inflight? → 跳过        （三重守卫，防重入 + 后台静默）
  inflight = true
  fetch(尾部窗口 { limit }) → mergeAndAggregate(baseBars, fresh, tf)
  tailChanged(lastAgg, newAgg) ? onBars(newAgg) : 跳过      （引用稳定，无数据零渲染）
  inflight = false
迟到响应: disposed 后落地即丢弃（class 内统一守卫）
```

**翻页（遗留 4）——与既有状态机的协同方案：复用同一组 refs，不另起状态机。**
crypto 只可能走 feed 或 agg 一条路，refs 天然互斥；fail 语义（3s 退避、2 次停）与非 crypto 路径逐字一致：

```
loadMore():
  crypto && feedRef.current        → void feedRef.current.loadMore()          （现状不动）
  crypto && aggPathRef.current     →
    if (pagingRef.current || noMoreRef.current) return
    if (Date.now() < retryAtRef.current) return
    if (!readyRef.current) return                                （与既有注释同款：在途禁翻页）
    token = loadTokenRef.current
    pagingRef.current = true
    aggPath.loadMore()
      .then(n => { if (token !== loadTokenRef.current) return;
                    n === 0 ? fail() : pageFailsRef.current = 0 })
      .catch(fail)
      .finally(() => pagingRef.current = false)
    fail() = 同 L233-237 现文（pageFails+1 / retryAt=now+3s / ≥2 次 noMore=true）
```

翻页内部：baseBars = klineCache.merge(baseBars, older)（older 全为更早 time，边界桶由重聚合自然愈合——
这正是选「全量重聚合」而非「分段聚合 + merge」的原因：初始窗口起点落在一个桶中间时，前插更早基期后
重聚合能修正首桶的 open/high/low/volume；分段方案会在翻页接缝留下永久残桶。重聚合 O(n)、n ≤ 数千，<1ms）。

**effect cleanup 与 token 复位**：cleanup 内 `aggPathRef.current = null` + `aggPath.dispose()`；
`loadTokenRef.current += 1` 已在 effect 头部执行，翻页响应按 token 失效丢弃（与现有一致）。

### 3.6 渲染非确定性防线（黄金截图零 diff 的判定依据）

1. **结构性豁免**：timeframe-2m/45m 黄金面走 harness（seeded 1m → aggregateBars → setData），不实例化 useChartSeries，轮询/翻页代码路径物理不可达。
2. **同数据同渲染**：引擎 drawXxx 为纯函数；hook 侧唯一渲染触发源是 setHistory，已被 tailChanged 门控——同数据不 setHistory、不 invalidate。
3. **App 侧 E2E**（smoke/interactions 等走 App 的表面）：轮询仅在 crypto + 非原生周期 + effect 存活时启动；`document.hidden` 时跳拍（与 quoteStore 轮询同约定）；原生周期表面零影响。
4. **验证时跑全量**：`npx playwright test tests/e2e/` 47 例 + 黄金 PNG 目录 `git status` 干净，双证据。

### 3.7 单测清单（tests/unit/aggregate-path.test.ts，vitest + fake timers）

mock 层：`fetch` 注入假实现（记录调用参数、按脚本返回 Bar[]）；`onBars` spy。

| # | 用例 | 断言要点 |
|---|------|----------|
| 1 | aggregatePollIntervalMs | 1m 基期 → 30000；10s 基期 → 5000（下限）；1h 基期 → 30000（上限）；单调不减 |
| 2 | initialWindowLimit | ratio=2 → 1600→1000 clamp；ratio=1 → 800 |
| 3 | mergeAndAggregate 后者赢 | 同 time 基期 bar，incoming 的 OHLCV 覆盖（对照 klineCache.merge 语义，防沉默逻辑错误） |
| 4 | mergeAndAggregate 接缝愈合 | base 从桶中间起 + 前插更早 bar → 首桶 open/high/low/volume 为完整桶值 |
| 5 | tailChanged | 末 bar close 变 → true；仅中间 bar 变（交易所修订）→ false（不触发渲染，设计取舍写明）；length 变 → true |
| 6 | start 正常流 | 初始 fetch limit 正确 → onBars 收到聚合结果（barCount = 基期数/ratio 向上取整） |
| 7 | 轮询 tick 更新 | fake timers 推进 1 拍 → 第二次 fetch；新数据 → 第二次 onBars |
| 8 | 轮询同数据不重渲染 | 两次 fetch 返回相同尾部 → onBars 仅 1 次（tailChanged 门控） |
| 9 | 防重入 | tick 内 fetch 未 settle 时再来 tick → fetch 不并发（调用计数 +1 而非 +2） |
| 10 | dispose 后零副作用 | dispose 后推进 timers + 强制 resolve 迟到响应 → onBars 不再被调、无 unhandled rejection |
| 11 | 翻页正常流 | loadMore → endTime = earliest-1 → baseBars 前插 → 全量重聚合 → onBars 长度增加 |
| 12 | 翻页空结果 | fetch 返回 [] → loadMore resolves 0 → 由 hook fail 语义接管（class 不私设 noMore） |
| 13 | 翻页防重入 | loadingMore 期间二次 loadMore → 立即 resolve 0，fetch 仅 1 次 |
| 14 | start fetch 失败 | rejects → onError 收到消息，轮询**不启动**（失败路径不靠轮询兜底，交 hook degradeToMock） |

用例 5 是「沉默逻辑错误」定向点：中间 bar 修订被有意忽略，必须有测试钉死该取舍（避免后续有人"顺手修好"引入引用抖动）。

### 3.8 useChartSeries 改动面（装配代码，预估 +20 行内）

- L102-123 聚合分支：构造 AggregateFeedPath → `void aggPath.start()` → cleanup 增 `aggPath.dispose()`。
- 新增 `aggPathRef = useRef<AggregateFeedPath | null>(null)`，effect 头部置 null（同 feedRef 处置）。
- loadMore 的 crypto 分支按 §3.5 改写（feed 优先、agg 兜底）。
- L100-101 的「已知边界」注释更新为已实现表述（活规格：先改注释再改代码，避免文档失同步）。

---

## 4. 提交序列（每步可独立验证）

| 提交 | 内容 | 白名单路径 | 验证 |
|------|------|-----------|------|
| C1 | seriesRenderers 拆分（5 新模块 + barrel） | `src/engine/renderer/{seriesTheme,ohlcSeries,lineSeries,areaSeries,columnSeries,seriesRenderers}.ts` | typecheck + npm test + 视觉回归 20 面零 diff |
| C2 | drawCrosshair 拆分（3 新模块 + barrel） | `src/engine/renderer/{legendTypes,drawLegend,crosshairOverlay,drawCrosshair}.ts` | 同上 |
| C3 | 数据层补实（纯函数 + AggregateFeedPath + 单测） | `src/data/aggregatePath.ts`, `tests/unit/aggregate-path.test.ts` | typecheck + 新单测 14 例 |
| C4 | hook 装配接线 | `src/features/market/useChartSeries.ts` | 全部：typecheck + npm test + E2E 47 例 + 黄金零 diff |

C3/C4 也可合并为一提交（同一工作面），由施工者按验证成本决定；白名单纪律不变。

## 5. 风险与验收判定

| 风险 | 等级 | 缓解 |
|------|------|------|
| 搬迁引入半像素/渐变字符级 diff | 中 | 逐字节剪切纪律 + 黄金截图即时反馈 |
| seriesLineColor 双缓存分叉 | 低 | 缓存随函数整体迁入，单例模块 |
| 轮询导致 App 侧 E2E 数据漂移 | 低 | tailChanged 门控 + hidden 跳拍 + 仅非原生周期启动 |
| 翻页与非 crypto 路径状态机串扰 | 低 | refs 复用 + token 失效保护，路径互斥 |
| 基期数组无限增长 | 低 | 每页 ≤1000 根；重聚合 O(n) <1ms；后续如需要再加分页窗口裁剪（本期 out-of-scope） |

**验收判定方法（可执行）：**

1. 调用点 diff 空：`git diff --name-only` 后逐一核对，除白名单外零改动；`grep -rn "from './seriesRenderers'\|from './drawCrosshair'" src tests` 输出与本文 §1.1/§2.1 表格一致且全部指向 barrel。
2. 黄金截图零 diff：`npx playwright test tests/e2e/visual-regression.spec.ts` 全过且 golden PNG 目录无 `git status` 变更。
3. E2E 47 例全绿：`npx playwright test tests/e2e/` 汇总 47 passed（1+5+1+2+10+20+8）。
4. 单测：`npm test` 含新增 aggregate-path 14 例全绿，44+ 存量零回归。
5. typecheck：`npm run typecheck` 零错误。
6. 红线复核：拆分后 `wc -l src/engine/renderer/*.ts src/features/market/useChartSeries.ts` 全部 ≤300。
