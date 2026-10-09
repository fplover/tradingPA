import { test, expect } from '@playwright/test';

/**
 * 二期-G 登记边界的收口：百万根 K 线**画布全管线**视口压测。
 * Node 探针（tests/unit/million-bars.test.ts）已证明数据面无 1M 级退化
 * （构建 364ms、装载 0.02ms、万次二分 13.1ms、1500 根视口+VP 0.19ms），
 * 但「整条渲染管线在 1M 序列上每帧多久」只能在真实浏览器量——本用例补这块证据。
 *
 * 本机实测（2026-10-09，六轮）：造 1M 根 40–51ms、setData 0.0–0.2ms；
 * 视野 1500 根时 0.5–0.6ms/帧（与千根 mock 基线同量级，比值 1.6–3.8×，增量来自二分定位
 * 与自动缩放侧的 log n / 缓存效应，不是逐根线性绘制）；把 1M 根全压进一屏（可见=1M，
 * 间距落到「铺满全部数据」的下限）中位 119–146ms、最差单帧 ~233ms——这是「可见 bar 数」
 * 自身的线性代价，属极端姿态而非退化路径，故量出来钉住数量级即可。
 *
 * 口径：预算卡数量级、不卡优化目标（CI 机器噪声大），与 Node 探针同一哲学。
 * 常量必须由参数传入——page.evaluate 只序列化函数体，测试文件的模块作用域不进页面。
 */

interface BarLike {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** DEV 调试句柄在本用例需要的窄接口（Chart.tsx 仅 dev 构建挂载） */
interface RendererLike {
  setData(bars: BarLike[]): void;
  redraw(): void;
  setViewportTimeRange(range: { fromTime: number; toTime: number }): void;
  lastBarTime: number;
  lastFrameMs: number;
}

interface Probe {
  has: boolean;
  buildMs: number;
  loadMs: number;
  fitAllMs: number[];
  deepMidMs: number[];
  denseMs: number[];
  loadedLastBarTime: number;
}

interface Args {
  n: number;
  t0: number;
  iv: number;
  samples: number;
}

test('1M 根画布全管线：全域视野 / 历史中段 / 常规密度的每帧时长预算', async ({ page }) => {
  test.setTimeout(180_000); // 页面里现造 1M 根 + 装载 + 逐帧测量，留足余量

  const args: Args = { n: 1_000_000, t0: Date.UTC(2024, 0, 1), iv: 60_000, samples: 8 };

  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const probe = await page.evaluate<Probe, Args>(({ n, t0, iv, samples }) => {
    const r = (window as unknown as { __chartRenderer?: RendererLike }).__chartRenderer;
    if (!r) {
      return { has: false, buildMs: 0, loadMs: 0, fitAllMs: [], deepMidMs: [], denseMs: [], loadedLastBarTime: 0 };
    }
    // 确定性锯齿序列（与 Node 探针同规格，避免随机数带来的用例间抖动）
    const tBuild = performance.now();
    const bars: BarLike[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const close = 100 + (i % 1000) * 0.01;
      bars[i] = { time: t0 + i * iv, open: close - 0.05, high: close + 0.5, low: close - 0.5, close, volume: 100 };
    }
    const buildMs = performance.now() - tBuild;

    const tLoad = performance.now();
    r.setData(bars);
    const loadMs = performance.now() - tLoad;
    const lastTime = t0 + (n - 1) * iv;

    /** 每帧时长：redraw() 同步走完整管线，lastFrameMs 由 RenderPipeline 逐帧回写 */
    const sample = (setup: () => void): number[] => {
      setup();
      const out: number[] = [];
      for (let k = 0; k < samples; k++) {
        r.redraw();
        out.push(r.lastFrameMs);
      }
      return out;
    };

    // 1) 全域视野：1M 根压进图表区宽（spacing 下限 0.001 允许铺满），LOD + 满序列二分
    const fitAllMs = sample(() => r.setViewportTimeRange({ fromTime: t0, toTime: lastTime }));
    // 2) 历史深处等宽窗口：first≈50 万，检验平移不是 O(n)
    const deepMidMs = sample(() => {
      const mid = Math.floor(n / 2);
      r.setViewportTimeRange({ fromTime: t0 + mid * iv, toTime: t0 + (mid + 1500) * iv });
    });
    // 3) 常规密度：1500 根可见（与 2 同宽，但视口贴最新端——实时侧路径）
    const denseMs = sample(() => r.setViewportTimeRange({ fromTime: lastTime - 1500 * iv, toTime: lastTime }));
    return {
      has: true,
      buildMs,
      loadMs,
      fitAllMs,
      deepMidMs,
      denseMs,
      loadedLastBarTime: r.lastBarTime,
    };
  }, args);

  test.skip(!probe.has, '无 DEV 调试句柄（仅 dev 构建暴露 window.__chartRenderer）');
  // 装载确实到齐 1M 根：末根时间戳即序列长度证据
  expect(probe.loadedLastBarTime).toBe(args.t0 + (args.n - 1) * args.iv);

  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const med = { fitAll: median(probe.fitAllMs), deepMid: median(probe.deepMidMs), dense: median(probe.denseMs) };
  const worst = Math.max(...probe.fitAllMs, ...probe.deepMidMs, ...probe.denseMs);

  console.log(
    `[perf-1M] 构建=${probe.buildMs.toFixed(0)}ms setData=${probe.loadMs.toFixed(1)}ms | 帧中位 ` +
      `全域铺满=${med.fitAll.toFixed(1)}ms 历史中段=${med.deepMid.toFixed(2)}ms 常规=${med.dense.toFixed(2)}ms | ` +
      `最差单帧=${worst.toFixed(1)}ms`,
  );

  expect(probe.buildMs).toBeLessThan(8_000); // 页面侧造 1M 根
  expect(probe.loadMs).toBeLessThan(3_000); // setData 装载（引用赋值 + 置脏，Node 侧实测 0.02ms）
  // 常规交互姿态：视野固定 1500 根时，序列从千根涨到 1M 根，帧时长不涨——O(可见) 的直接证据
  expect(med.deepMid).toBeLessThan(16.7);
  expect(med.dense).toBeLessThan(16.7);
  // 全域铺满（可见=1M）是线性代价的极端姿态，本用例把它量出来并钉住数量级：
  // 实测中位 ~140ms（本机），门槛 400ms——退化到秒级/十秒级必红，正常抖动必绿
  expect(med.fitAll).toBeLessThan(400);
});

/**
 * 对照：同一份 1M 序列在「常规视野」下的帧时长，必须与 600 根基线同量级——
 * 这条断言才是「管线 O(可见 bar) 而非 O(总 bar)」的直接证据。
 */
test('1M 序列的常规视野帧时长与千根基线同量级（O(可见) 证据）', async ({ page }) => {
  test.setTimeout(180_000);

  const args = { n: 1_000_000, visible: 1500, t0: Date.UTC(2024, 0, 1), iv: 60_000, samples: 12 };

  await page.goto('/');
  await expect(page.getByText(/[1-9][0-9,]* 根/)).toBeVisible({ timeout: 20_000 });

  const out = await page.evaluate<
    { has: boolean; baselineMs: number; millionMs: number },
    { n: number; visible: number; t0: number; iv: number; samples: number }
  >(({ n, visible, t0, iv, samples }) => {
    const r = (window as unknown as { __chartRenderer?: RendererLike }).__chartRenderer;
    if (!r) return { has: false, baselineMs: 0, millionMs: 0 };
    const frame = (): number => {
      let acc = 0;
      for (let k = 0; k < samples; k++) {
        r.redraw();
        acc += r.lastFrameMs;
      }
      return acc / samples;
    };
    const view = (count: number, endTime: number) =>
      r.setViewportTimeRange({ fromTime: endTime - count * iv, toTime: endTime });

    // 基线：应用自带的 mock 序列（千根级），常规视野
    const baselineEnd = r.lastBarTime;
    view(visible, baselineEnd);
    const baselineMs = frame();

    // 1M：同宽度常规视野，只是序列长了三个数量级
    const bars: BarLike[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const close = 100 + (i % 1000) * 0.01;
      bars[i] = { time: t0 + i * iv, open: close - 0.05, high: close + 0.5, low: close - 0.5, close, volume: 100 };
    }
    r.setData(bars);
    view(visible, t0 + (n - 1) * iv);
    const millionMs = frame();
    return { has: true, baselineMs, millionMs };
  }, args);

  test.skip(!out.has, '无 DEV 调试句柄（仅 dev 构建暴露 window.__chartRenderer）');
  const ratio = out.millionMs / Math.max(out.baselineMs, 0.01);
  console.log(
    `[perf-1M] 同视野(1500 根)对照 基线(千根)=${out.baselineMs.toFixed(2)}ms/帧 → 1M=${out.millionMs.toFixed(
      2,
    )}ms/帧（比值 ${ratio.toFixed(2)}×）`,
  );
  // 绝对门槛：常规视野满管线必须停在一帧预算内（本机实测 1M 侧 ~2.3ms）
  expect(out.millionMs).toBeLessThan(16.7);
  // 数量级门槛：同视野下 1M 相对千根的退化不得超过 10×（实测 ~4×，
  // 增量来自二分定位与自动缩放遍历的 log n / 缓存效应，而非逐根线性绘制——
  // 若哪天变成 O(总 bar)，比值会跳到千倍级，这里必然红）
  expect(ratio).toBeLessThan(10);
});
