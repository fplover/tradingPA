# Design - Volume Profile 数据管线与集成架构（P1-F）

> 作者：首席架构师 高见远 ｜ 日期：2026-09-29 ｜ 状态：已评审通过（team-lead 采信，Wave 2 施工依据）
> 上游：docs/SPEC-P1.md §2 P1-F / §5 AC-F1
> 关联决策：ADR-001（本文档同日落档）

## 1. 核心裁决：kline 近似（纯计算，零新增请求）

### 1.1 否决 aggTrades 的证据链

1. **请求预算不可行**：GET /api/v3/aggTrades weight 4/请求、limit 上限 1000、配额 6000/min/IP。BTCUSDT 聚合成交约 200-800 笔/分钟，可见区间 500 根 1m bar ≈ 10-40 万 aggTrades → 100-400 次请求、weight 400-1600，占单分钟配额 7-27%；用户平移/切周期必然请求风暴，需自建限频队列，ROI 为负。
2. **TV 语义本身即 bar 近似**：TradingView 自家 VP 按图表 bar 计算——每根 bar 的 volume 均匀分布到其 [low,high] 覆盖的价格行，并非 tick 聚合。kline 近似不是降级，是 TV 语义本身。
3. **环境事实**：`src/data/sources/binance.ts:7` 注释明示当前网络环境 Binance 不可达、失败降级。VP 地基不能押在不可达端点上；kline 近似在 mock 降级模式同样出图。
4. **混合方案否决**：实时 aggTrades + 历史 kline 两段语义不一致 → 直方图接缝跳变 + 对账逻辑，ROI 为负。aggTrades delta 精确化列入未来 Feature Flag 增强项，本批 out-of-scope。

### 1.2 全市场覆盖

新浪/腾讯/东财无逐笔数据；registry.bars 统一返回 Bar[]，VP 计算只吃 Bar[]，天然全市场通用。delta 源沿用 `src/indicators/builtin/volume.ts:66` CVD 已验证近似式 `buyRatio=(close-low)/(high-low)`（A股日线精度更粗属已知近似，文档标注）。

## 2. 分桶算法（对齐 TV 默认）

- **行数**：默认 24 行（Number of Rows 模式），参数范围 10-100。不做 tick-size 行高模式。
- **计算**：可见区间 [from,to]（`ChartState.visibleRange()`，已内建 replay 裁剪）→ 价格域 [minLow,maxHigh] 均分 N 行 → 每 bar volume 均匀摊入其 [low,high] 覆盖的行。
- **POC** = 最大量行；**VA**：从 POC 起，每次并入相邻两行中较大者，累计至 ≥ vaPercent%（默认 70）总量 → VAH/VAL。
- **增量策略**：全量重算（O(可见bar×行数) ≈ 2 万次加法 <0.5ms），不做尾部增量。**缓存签名** `{from,to,rowCount,vaPercent,source,dataEpoch}`，dataEpoch 在 ChartState.applyData/updateBar 自增——平移/缩放/实时跳动全被签名覆盖。

## 3. 渲染集成：主图右侧横置直方图（TV 形态），不做独立副图

理由：TV VP 画在价格面板右侧（水平直方图 + POC/VAH/VAL 三横线，与主图共享价格轴）。副图指标框架（IndicatorManager 独立 pane + `Record<string, Array<number|undefined>>` 逐 bar 序列契约）与 VP 区间几何不匹配，硬塞破坏契约。主图右侧方案不动 pane 布局、不动 autoscale、与价格轴倒计时几何不重叠。

## 4. 模块落点（全部 ≤300 行）

| 文件 | 动作 | 内容 | 行数 |
|---|---|---|---|
| `src/engine/profile/volumeProfile.ts` | 新增 | computeProfile(bars, from, to, params) → {rows[], poc, vah, val} + 签名缓存模型 | ~120 |
| `src/engine/renderer/drawVolumeProfile.ts` | 新增 | 右对齐水平直方图（涨跌双色，最大行宽 = 视口宽 25%）+ 三横线 + POC 价签 | ~150 |
| `src/engine/renderer/PaneRenderer.ts` | 改 | price 分支 drawPriceSeries 后追加 drawVolumeProfile 调用 | +5 |
| `src/engine/renderer/ChartState.ts` | 改 | volumeProfileOn/params 状态 + dataEpoch 计数器 | +15 |
| `src/indicators/core/types.ts` | 改 | IndicatorDef 加可选 `profile?: boolean` | +1 |
| `src/indicators/builtin/profile.ts` | 新增 | VP def 条目（成交量类、overlay、params schema） | ~60 |
| `src/indicators/registry.ts` | 改 | 注册 VP 条目 | +2 |
| `src/engine/renderer/IndicatorManager.ts` | 改 | add()/remove()/update() 对 profile 标记 def 走分支：不建实例不建 pane，切 ChartState.volumeProfileOn + 挂参数；模板持久化自动兼容 | +10 |
| `tests/unit/volumeProfile.test.ts` | 新增 | 固定 bars → 分桶/POC/VAH/VAL 金标准断言 | ~150 |

**颜色 token**：`src/engine/theme.ts` ChartTheme 新增 4 token × 双主题：`profileUp`/`profileDown`（对齐既有 up/down 色系半透明）、`profilePoc`、`profileVa`。drawVolumeProfile 只读 theme.*，零硬编码 hex。

## 5. 参数 schema（对齐 IndicatorParam 模式）

```ts
params: [
  { key: 'rowCount',  label: '行数',       type: 'number', default: 24, min: 10, max: 100, step: 1 },
  { key: 'vaPercent', label: '价值区域 %', type: 'number', default: 70, min: 50, max: 95,  step: 1 },
  { key: 'source',    label: '数据源',     type: 'select', default: 'volume',
    options: [{ label: '成交量', value: 'volume' }, { label: '买卖量差', value: 'delta' }] },
  { key: 'upColor', type: 'color' },  // 默认值引用 theme token 同源色
  { key: 'downColor', type: 'color' }, { key: 'pocColor', type: 'color' },
]
```

复用既有设置对话框通用参数渲染与 hideWhenPlotsHidden 机制，UI 层零新代码。

## 6. 风险清单

| 风险 | 等级 | 对策 |
|---|---|---|
| 重算频率 | 低 | O(2万) 加法 <0.5ms + 签名门控；实测超 1ms 再降级手势期间冻结（预案不预做） |
| 与倒计时冲突 | 无 | 倒计时在 AXIS_WIDTH 轴区，VP 在 chartW 区右对齐，几何不重叠 |
| 与挂单线/画线叠加 | 低 | drawVolumeProfile 插在 drawTrading 之前，订单线浮于其上（TV 同序） |
| 变换类图表（Renko/Kagi/PnF/Range） | 中 | 仅 `timeBasedChart===true` 时绘制，否则隐藏 |
| 复盘模式 | 无 | visibleRange 已裁剪 replayIndex，自动跟随 |
| 多图表布局 | 无 | 状态挂各 ChartState 实例，无跨图耦合 |

## 7. 数据流时序

```
useChartSeries → ChartController.setData/updateBar → ChartState.applyData(dataEpoch++) → invalidate
RenderPipeline.draw → PaneRenderer.draw(price pane) → drawVolumeProfile(host)
  → VolumeProfileModel.getProfile(签名含 dataEpoch/from/to/params)
    命中缓存直接画；否则重算 → 右对齐直方图 + POC/VAH/VAL 横线（theme token 取色）
指标对话框点 Volume Profile → IndicatorManager.add 分支 → ChartState.volumeProfileOn=true + params → invalidate
模板保存/加载经 exportTemplate/importTemplate 既有通路，零改动
```

## 8. 工作量复估：6-8 人日（Spec 预算 8-12，偏下限）

数据层工作量为零（无新适配器/限频队列/缓存）故低于原估。分布：计算核心 1d ｜ 渲染 1.5d ｜ 状态+IndicatorManager+参数接线 1.5d ｜ 金标准单测 1.5d ｜ e2e+边界 1d ｜ 打磨 0.5d。

## 9. Wave 2 施工注意事项（team-lead 批注）

1. **并行冲突**：`src/indicators/core/types.ts` 与 `src/indicators/registry.ts` 与 P1-A 指标流同文件——VP 实装必须等 P1-A 回传合并后启动（advisory 采纳）。
2. e2e 变换类图表隐藏行为、主题切换双主题断言纳入验收。
3. 实装 agent 白名单：§4 表格全部文件 + theme.ts + tests/unit/volumeProfile.test.ts。
