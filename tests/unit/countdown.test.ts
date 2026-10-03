// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CloseCountdown, formatCountdown, nextCalendarClose, nextCloseTime } from '@/engine/countdown';
import { ChartRenderer } from '@/engine/renderer/ChartRenderer';
import { getTimeframe, TIMEFRAMES } from '@/types/market';
import type { Bar } from '@/types/market';
import { PriceScale } from '@/engine/scale/PriceScale';
import { drawLastPrice } from '@/engine/renderer/drawAxes';
import { theme, TV_FONT } from '@/engine/theme';
import { asCtx, createMockCtx, fillTexts, hasCall, propSets, type MockCtx } from './helpers/mock-ctx';

/**
 * B3 收盘倒计时单测：纯函数（纪元对齐/日历分桶/格式化边界）+ CloseCountdown 状态机
 * + drawLastPrice 倒计时渲染。对齐约定对照 data/aggregate.ts 的 bucketStart。
 */

/** 2024-01-08 00:00 UTC（周一）：对全部秒级周期均为桶起点，周/月也落在桶起点 */
const BASE = Date.UTC(2024, 0, 8, 0, 0, 0);

// ---------- nextCloseTime：纪元对齐 ----------

describe('nextCloseTime：纪元对齐', () => {
  it('各秒级周期：桶起点 + interval；周期中时刻仍属当前桶；桶内偏移进下一桶', () => {
    for (const tf of TIMEFRAMES) {
      if (tf.seconds <= 0) continue;
      const iv = tf.seconds * 1000;
      const base = Math.floor(BASE / iv) * iv; // 该周期的纪元对齐桶起点（3D 不落在 BASE，见下）
      expect(nextCloseTime(iv, base)).toBe(base + iv);
      expect(nextCloseTime(iv, base + iv / 2)).toBe(base + iv);
      expect(nextCloseTime(iv, base + iv + 123)).toBe(base + 2 * iv);
    }
  });

  it('绝对锚点：1H/5m/1m 桶边界（与 aggregate.ts 同口径）', () => {
    expect(nextCloseTime(3_600_000, Date.UTC(2024, 0, 8, 9, 30))).toBe(Date.UTC(2024, 0, 8, 10, 0)); // 09:30 属 09:00 桶
    expect(nextCloseTime(300_000, Date.UTC(2024, 0, 8, 9, 32))).toBe(Date.UTC(2024, 0, 8, 9, 35)); // 09:32 属 09:30 桶
    expect(nextCloseTime(60_000, Date.UTC(2024, 0, 8, 9, 30))).toBe(Date.UTC(2024, 0, 8, 9, 31));
  });

  it('跨日：23:59 的 1m bar → 次日 00:00 收盘', () => {
    expect(nextCloseTime(60_000, Date.UTC(2024, 0, 8, 23, 59, 0))).toBe(Date.UTC(2024, 0, 9, 0, 0, 0));
  });

  it('跨周到周一：见 nextCalendarClose（周非固定间隔）', () => {
    // 1W 的 seconds = 0，必须走日历路径而非 7d 纪元取整外的桶
    expect(getTimeframe('1W').calendar).toBe('week');
  });

  it('非法入参：intervalMs ≤ 0 / 非有限值 → NaN', () => {
    expect(nextCloseTime(0, BASE)).toBeNaN();
    expect(nextCloseTime(-60_000, BASE)).toBeNaN();
    expect(nextCloseTime(Number.NaN, BASE)).toBeNaN();
    expect(nextCloseTime(60_000, Number.NaN)).toBeNaN();
    expect(nextCloseTime(60_000, Number.POSITIVE_INFINITY)).toBeNaN();
  });
});

// ---------- nextCalendarClose：周/月日历分桶 ----------

describe('nextCalendarClose：日历分桶（与 aggregate.ts 同锚点）', () => {
  it('周：桶内任意时刻 → 下周一 00:00 UTC', () => {
    expect(nextCalendarClose('week', Date.UTC(2024, 0, 8))).toBe(Date.UTC(2024, 0, 15)); // 周一 0 点
    expect(nextCalendarClose('week', Date.UTC(2024, 0, 10, 12, 0, 0))).toBe(Date.UTC(2024, 0, 15)); // 周三
    expect(nextCalendarClose('week', Date.UTC(2024, 0, 14, 23, 59, 59))).toBe(Date.UTC(2024, 0, 15)); // 周日 23:59:59
  });

  it('周：收盘 - 7 天 = 本周一 00:00 UTC（bucketStart 不变量）', () => {
    for (const t of [Date.UTC(2024, 0, 8), Date.UTC(2024, 0, 14, 23, 59, 59), Date.UTC(2024, 5, 15, 3, 21, 0)]) {
      const d = new Date(t);
      const day = (d.getUTCDay() + 6) % 7;
      const monday =
        t - day * 86_400_000 - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 1000;
      expect(nextCalendarClose('week', t) - 7 * 86_400_000).toBe(monday);
    }
  });

  it('月：自然月 1 日 → 下月 1 日，跨年/闰年正确', () => {
    expect(nextCalendarClose('month', Date.UTC(2024, 0, 8))).toBe(Date.UTC(2024, 1, 1));
    expect(nextCalendarClose('month', Date.UTC(2024, 0, 31, 23, 59))).toBe(Date.UTC(2024, 1, 1)); // 1 月最后一天
    expect(nextCalendarClose('month', Date.UTC(2024, 1, 10))).toBe(Date.UTC(2024, 2, 1)); // 闰年 2 月
    expect(nextCalendarClose('month', Date.UTC(2024, 11, 15))).toBe(Date.UTC(2025, 0, 1)); // 跨年
  });

  it('非法入参 → NaN', () => {
    expect(nextCalendarClose('week', Number.NaN)).toBeNaN();
    expect(nextCalendarClose('month', Number.NaN)).toBeNaN();
  });
});

// ---------- formatCountdown：mm:ss / h:mm:ss ----------

describe('formatCountdown', () => {
  it.each([
    [0, '0:00'],
    [-1, '0:00'],
    [-60_000, '0:00'],
    [Number.NaN, '0:00'],
    [Number.POSITIVE_INFINITY, '0:00'],
    [Number.NEGATIVE_INFINITY, '0:00'],
    [1, '0:01'],
    [500, '0:01'],
    [999, '0:01'],
    [1_000, '0:01'],
    [1_001, '0:02'],
    [59_000, '0:59'],
    [59_400, '1:00'], // ceil(59.4) = 60
    [60_000, '1:00'],
    [60_100, '1:01'],
    [3_599_000, '59:59'],
    [3_599_500, '1:00:00'], // ceil 跨入小时
    [3_600_000, '1:00:00'],
    [3_661_000, '1:01:01'],
    [25 * 3_600_000, '25:00:00'],
    [604_799_000, '167:59:59'], // 1W 周期最大剩余
    [604_800_000, '168:00:00'],
  ])('formatCountdown(%p) = %p', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });

  it('ceil 语义：0:01 恰好显示 1 秒（(0, 1000] → 1），不会出现停留 1 秒的 0:00', () => {
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(999)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00'); // 仅 ≤ 0 归零
  });
});

// ---------- CloseCountdown：状态机 ----------

describe('CloseCountdown', () => {
  it('进行中的 bar：文本随秒递减，收盘时刻起消失', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1m'));
    const barTime = Date.UTC(2024, 0, 8, 9, 30, 0);
    cd.setLastBar(barTime);
    expect(cd.textAt(barTime + 100)).toBe('1:00'); // ceil(59.9) = 60
    expect(cd.textAt(barTime + 30_500)).toBe('0:30');
    expect(cd.textAt(barTime + 59_500)).toBe('0:01');
    expect(cd.textAt(barTime + 60_000)).toBeNull(); // 收盘（新 bar 未到）→ 消失
    expect(cd.textAt(barTime + 65_000)).toBeNull(); // 数据断开（旧 bar 过期）→ 不显示
  });

  it('新 bar 生成：重置为完整周期', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('5m'));
    const barTime = Date.UTC(2024, 0, 8, 9, 30, 0);
    cd.setLastBar(barTime);
    expect(cd.textAt(barTime + 299_500)).toBe('0:01');
    expect(cd.textAt(barTime + 300_000)).toBeNull();
    cd.setLastBar(barTime + 300_000); // 新 bar
    expect(cd.textAt(barTime + 300_100)).toBe('5:00');
  });

  it('周期切换：同秒内文本立即变化（recompute 作废已呈现文本）', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1m'));
    const barTime = Date.UTC(2024, 0, 8, 9, 0, 0); // 09:00 对 1m/1H 均为桶起点
    cd.setLastBar(barTime);
    expect(cd.textAt(barTime + 10_000)).toBe('0:50'); // 1m：09:01 收盘
    cd.setTimeframe(getTimeframe('1H'));
    expect(cd.textAt(barTime + 10_000)).toBe('59:50'); // ceil(3590) = 3590s，10:00 收盘
  });

  it('未来 bar（now < lastBarTime）不显示', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1m'));
    cd.setLastBar(Date.UTC(2024, 0, 8, 9, 30, 0));
    expect(cd.textAt(Date.UTC(2024, 0, 8, 9, 29, 0))).toBeNull();
  });

  it('停用路径：未设 bar / setTimeframe(null) / 空数据（time ≤ 0）/ reset', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1m'));
    expect(cd.textAt(BASE)).toBeNull(); // 未 setLastBar
    cd.setLastBar(BASE);
    expect(cd.textAt(BASE + 1_000)).not.toBeNull();
    cd.setTimeframe(null);
    expect(cd.textAt(BASE + 1_000)).toBeNull(); // 周期缺失

    const empty = new CloseCountdown();
    empty.setTimeframe(getTimeframe('1m'));
    empty.setLastBar(0); // 空序列时 lastBarTime getter 返回 0
    expect(empty.textAt(1_000)).toBeNull();
    expect(empty.needsRedraw(1_000)).toBe(false); // 无唤醒

    const cleared = new CloseCountdown();
    cleared.setTimeframe(getTimeframe('1m'));
    cleared.setLastBar(BASE);
    expect(cleared.textAt(BASE + 1_000)).not.toBeNull();
    cleared.setLastBar(0); // setData([]) 清空
    expect(cleared.textAt(BASE + 1_000)).toBeNull();

    cleared.setLastBar(BASE);
    cleared.sample(BASE + 1_000);
    cleared.reset();
    expect(cleared.textAt(BASE + 1_000)).toBeNull();
    expect(cleared.needsRedraw(BASE + 1_000)).toBe(false);
  });

  it('needsRedraw：同秒不唤醒、跨秒唤醒、窗口翻转与重算立即唤醒', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1m'));
    const barTime = Date.UTC(2024, 0, 8, 9, 30, 0);
    cd.setLastBar(barTime);
    const t1 = barTime + 10_000;

    expect(cd.needsRedraw(t1)).toBe(true); // 尚未绘制
    expect(cd.sample(t1)).toBe('0:50');
    expect(cd.needsRedraw(t1 + 100)).toBe(false); // 同秒
    expect(cd.needsRedraw(t1 + 1_000)).toBe(true); // 跨秒
    cd.sample(t1 + 1_000);
    expect(cd.needsRedraw(t1 + 1_100)).toBe(false);

    cd.setTimeframe(getTimeframe('5m')); // 重算 → 同秒内也要唤醒
    expect(cd.needsRedraw(t1 + 1_100)).toBe(true);

    cd.sample(barTime + 299_500);
    expect(cd.needsRedraw(barTime + 300_000)).toBe(true); // 窗口消失 → 恰好再唤醒一次
    expect(cd.sample(barTime + 300_000)).toBeNull();
    expect(cd.needsRedraw(barTime + 300_100)).toBe(false); // 之后零唤醒
  });

  it('同根 bar 的实时刷新不重算（setLastBar 同值快速路径）', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1m'));
    const barTime = Date.UTC(2024, 0, 8, 9, 30, 0);
    cd.setLastBar(barTime);
    const t = barTime + 20_000;
    cd.sample(t);
    cd.setLastBar(barTime); // updateBar 同根 bar（价格刷新，time 不变）
    expect(cd.needsRedraw(t + 100)).toBe(false); // 已呈现文本未作废
  });

  it('日线：纪元对齐（00:00 UTC 桶），跨日重置', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1D'));
    cd.setLastBar(Date.UTC(2024, 0, 8));
    expect(cd.textAt(Date.UTC(2024, 0, 8, 12))).toBe('12:00:00');
    expect(cd.textAt(Date.UTC(2024, 0, 9))).toBeNull();
    cd.setLastBar(Date.UTC(2024, 0, 9));
    expect(cd.textAt(Date.UTC(2024, 0, 9, 6))).toBe('18:00:00');
  });

  it('周线：日历对齐到下周一，跨周重置', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1W'));
    const wed = Date.UTC(2024, 0, 10, 12, 0, 0);
    cd.setLastBar(wed);
    const close = Date.UTC(2024, 0, 15);
    expect(cd.textAt(wed + 1_000)).toBe(formatCountdown(close - wed - 1_000));
    expect(cd.textAt(close)).toBeNull();
    cd.setLastBar(close); // 新周 bar
    expect(cd.textAt(close + 1_000)).toBe(formatCountdown(7 * 86_400_000 - 1_000));
  });

  it('月线：日历对齐到自然月，跨月/跨年重置', () => {
    const cd = new CloseCountdown();
    cd.setTimeframe(getTimeframe('1M'));
    cd.setLastBar(Date.UTC(2024, 0, 31, 23, 0, 0));
    expect(cd.textAt(Date.UTC(2024, 1, 1))).toBeNull(); // 2 月 1 日已收盘
    cd.setLastBar(Date.UTC(2024, 1, 1)); // 2 月 bar
    expect(cd.textAt(Date.UTC(2024, 1, 15, 12))).toBe(
      formatCountdown(Date.UTC(2024, 2, 1) - Date.UTC(2024, 1, 15, 12)),
    );
  });

  it('全部周期端到端：对齐 bar → 合规倒计时文本，远超收盘时刻后消失', () => {
    for (const tf of TIMEFRAMES) {
      const cd = new CloseCountdown();
      cd.setTimeframe(tf);
      cd.setLastBar(BASE); // 周/月同样落在桶起点；3D 为桶中（末 bar 仍属当前桶）
      // +100ms 而非 +1s：1s 周期在 +1s 时恰好收盘，必须仍在窗口内
      expect(cd.textAt(BASE + 100)).toMatch(/^\d+:\d{2}(:\d{2})?$/);
      expect(cd.textAt(BASE + 40 * 86_400_000)).toBeNull();
    }
  });
});

// ---------- drawLastPrice：倒计时渲染（价格轴右端徽章旁） ----------

describe('drawLastPrice：收盘倒计时文本', () => {
  const geo = { chartW: 460, chartH: 300 };
  const upBar: Bar = { time: 0, open: 100, high: 106, low: 98, close: 104, volume: 1 };

  function scale(): PriceScale {
    const ps = new PriceScale();
    ps.setSize(geo.chartH);
    ps.autoScale(97, 107);
    return ps;
  }

  it('传入倒计时：徽章下方右对齐贴徽章右缘，11px TV_FONT + axisText 色', () => {
    const ctx = createMockCtx();
    const ps = scale();
    drawLastPrice(asCtx(ctx), ps, upBar, 100, 2, geo, '0:42');
    const y = Math.round(ps.priceToY(104)) + 0.5;
    const by = Math.min(Math.max(y - 9, 1), geo.chartH - 19);
    // 徽章文本照常 + 倒计时文本（measureText mock：6 字符 = 36px → w = max(58, 48) = 58）
    expect(fillTexts(ctx)).toContain('104.00');
    expect(hasCall(ctx, 'fillText', ['0:42', geo.chartW + 2 + 58, by + 18 + 9])).toBe(true);
    expect(propSets(ctx, 'font')).toContain(`11px ${TV_FONT}`);
    expect(propSets(ctx, 'fillStyle')).toContain(theme.axisText);
    expect(propSets(ctx, 'textAlign')).toContain('right');
  });

  it('徽章被钳到面板底部时：倒计时上翻到徽章上方', () => {
    const ctx = createMockCtx();
    const ps = scale();
    const bottomBar: Bar = { time: 0, open: 96, high: 96.5, low: 95.4, close: 95.4, volume: 1 };
    drawLastPrice(asCtx(ctx), ps, bottomBar, 96, 2, geo, '0:07');
    const y = Math.round(ps.priceToY(95.4)) + 0.5;
    const by = Math.min(Math.max(y - 9, 1), geo.chartH - 19);
    expect(by).toBe(geo.chartH - 19); // 确认徽章贴底
    expect(hasCall(ctx, 'fillText', ['0:07', geo.chartW + 2 + 58, by - 9])).toBe(true);
  });

  it('不传倒计时：无额外 fillText（向后兼容既有调用方）', () => {
    const ctx = createMockCtx();
    drawLastPrice(asCtx(ctx), scale(), upBar, 100, 2, geo);
    expect(fillTexts(ctx)).toEqual(['104.00']);
  });

  it('价格越界早退：零调用（含倒计时参数）', () => {
    const ctx: MockCtx = createMockCtx();
    const far = new PriceScale();
    far.setSize(geo.chartH);
    far.setRange(0, 1);
    drawLastPrice(asCtx(ctx), far, upBar, 100, 2, geo, '0:42');
    expect(ctx.calls).toHaveLength(0);
  });
});

// ---------- ChartRenderer 接线（jsdom + mock canvas） ----------

describe('ChartRenderer 收盘倒计时接线', () => {
  const CANVAS_W = 1280;
  const CANVAS_H = 800;
  let ctx: MockCtx;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    ctx = createMockCtx();
    HTMLCanvasElement.prototype.getContext = vi.fn(() =>
      asCtx(ctx),
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: CANVAS_W,
        bottom: CANVAS_H,
        width: CANVAS_W,
        height: CANVAS_H,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** 以（被 mock 的）墙钟构造 n 根 K 线，末根为进行中的 bar（与 nextCloseTime 同口径取整） */
  function liveBars(intervalMs = 60_000, n = 60): Bar[] {
    const last = Math.floor(Date.now() / intervalMs) * intervalMs;
    const out: Bar[] = [];
    for (let i = n - 1; i >= 0; i--) {
      out.push({ time: last - i * intervalMs, open: 100, high: 101, low: 99, close: 100, volume: 1 });
    }
    return out;
  }

  function makeRenderer(bars: Bar[], timeframeId: string): ChartRenderer {
    return new ChartRenderer(canvas, bars, { symbol: 'BTC/USDT', interval: '1m', decimals: 2, timeframeId });
  }

  it('实时数据：价格轴右端渲染 mm:ss 倒计时（Date.now 墙钟与 bar time 同时钟）', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2024, 0, 8, 9, 30, 30));
    const r = makeRenderer(liveBars(), '1m');
    ctx.calls.length = 0;
    r.redraw();
    expect(fillTexts(ctx)).toContain('0:30'); // 09:31:00 收盘 - 09:30:30
    r.dispose();
  });

  it('周期切换：setLegend(timeframeId) 后按新周期重算', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2024, 0, 8, 9, 30, 30));
    const r = makeRenderer(liveBars(), '1m');
    r.redraw();
    expect(fillTexts(ctx)).toContain('0:30');
    r.setLegend({ timeframeId: '1H' });
    ctx.calls.length = 0;
    r.redraw();
    expect(fillTexts(ctx)).toContain('29:30'); // 09:30 属 09:00 桶 → 10:00 收盘
    r.dispose();
  });

  it('新 bar（updateBar）：倒计时重置为完整周期', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2024, 0, 8, 9, 30, 30));
    const r = makeRenderer(liveBars(), '1m');
    r.redraw();
    expect(fillTexts(ctx)).toContain('0:30');
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2024, 0, 8, 9, 31, 5));
    r.updateBar({ time: Date.UTC(2024, 0, 8, 9, 31, 0), open: 100, high: 101, low: 99, close: 100.5, volume: 2 });
    ctx.calls.length = 0;
    r.redraw();
    expect(fillTexts(ctx)).toContain('0:55'); // 09:32:00 收盘 - 09:31:05
    r.dispose();
  });

  it('回放模式：倒计时隐藏；退出回放后恢复', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2024, 0, 8, 9, 30, 30));
    const bars = liveBars();
    const r = makeRenderer(bars, '1m');
    r.redraw();
    expect(fillTexts(ctx)).toContain('0:30');
    r.setReplayIndex(bars.length - 10);
    ctx.calls.length = 0;
    r.redraw();
    expect(fillTexts(ctx)).not.toContain('0:30');
    r.setReplayIndex(null);
    ctx.calls.length = 0;
    r.redraw();
    expect(fillTexts(ctx)).toContain('0:30');
    r.dispose();
  });
});
