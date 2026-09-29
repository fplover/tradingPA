# ADR-001: Volume Profile 采用 kline 近似（TV 同语义）

## Status: Accepted (2026-09-29)

## Background

P1-F 需要实现 Volume Profile（POC/VAH/VAL 价格分布直方图）。候选数据管线有三条：Binance aggTrades 逐笔聚合、kline 近似、两者混合。aggTrades 有明确请求预算问题（可见区间 500 根 1m bar 需 100-400 次请求、weight 400-1600，占 6000/min 配额 7-27%），且 `src/data/sources/binance.ts:7` 证实当前网络环境 Binance 不可达。

## Decision

VP 计算一律基于图表 K 线（Bar[]）：每根 bar 的 volume 均匀分布到其 [low,high] 覆盖的价格行。这与 TradingView 自家 VP 的计算语义一致（TV 也是按 bar 而非 tick）。全市场数据源（crypto/A股/港股/美股/期货）统一算法。设计详见 `docs/DESIGN-volume-profile.md`。

## Consequences

- 正面：零新增网络请求、零限频队列、mock 降级模式可用、全市场一套算法；工作量从 8-12 降至 6-8 人日。
- 负面：单 bar 内部分布为近似（无逐笔精度）；delta 源沿用 buyRatio 近似式，A股日线精度更粗。
- 缓解：aggTrades 精确 delta 增强留作 P2 Feature Flag；GAP §1.4 已裁定 Bar Magnifier/footprint（真 tick 依赖）接付费源前不做，决策一致。

## Related ADRs

- GAP_ANALYSIS_TV_vs_tradingPA.md §3 第 6 条（tick 依赖功能降级裁定）
