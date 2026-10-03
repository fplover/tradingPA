# OPEN-DECISIONS 登记册

> 规范：只追加 + 就地关闭（OPEN → RESOLVED，补 Resolution 字段）。每次 Phase 开始时复现未决项到工作上下文。

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status | Resolution |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|------------|
| 2026-09-29 | P1-A 回传 | Anchored VWAP 指标未实装（TV 语义需用户点击锚定 bar 的交互 + 数据层锚点，超出指标流白名单） | src/indicators/** 白名单纪律；画线交互框架已有锚点能力 | 随画线工具/交互批次补（复用 fib 家族锚点落点交互） | P1 批次内不做，Wave 2 不含 | 用户提出或画线交互批次立项 | **RESOLVED**（2026-09-30） | P2-B（d77b8b7）交付：`indicators/builtin/avwap.ts` 指标 def + `engine/drawing/anchordrop.ts` 锚定落点状态机（复用画线锚点交互，点击 bar 落点），并已登记进 `indicators/registry.ts`；锚点经 `params.anchorTime` 承载，`01da50d` 补齐 engine→store 写回通道（同会话重建/布局切换不丢锚，跨刷新经指标模板恢复）。已知边界：图表重挂需重新落点 |
| 2026-09-29 | ADR-001 advisory | aggTrades 精确 delta 增强 VP 精度 | 依赖 Binance 端点（当前网络不可达）+ 限频预算 | P2 Feature Flag，不排期 | 接可达 tick 数据源 | 立项评估时 | OPEN | — |
