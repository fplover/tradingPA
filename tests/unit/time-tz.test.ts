import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarSeries } from '@/data/BarSeries';
import { Viewport } from '@/engine/viewport/Viewport';
import { DEFAULT_TIME_DISPLAY, drawTimeAxis, formatTime, tzDate, type TimeDisplay } from '@/engine/renderer/drawAxes';
import type { Bar } from '@/types/market';
import { asCtx, createMockCtx, fillTexts } from './helpers/mock-ctx';

/**
 * 三期-B3「一般」页时区口径（仅显示层）的读数证明。
 *
 * 三件事各自有反证：① tzOffsetMinutes = null 必须与改造前的浏览器本地读数逐位相同
 * （27 面黄金基线所凭，用进程时区切到带 DST 的纽约来证「DST 就地算」而非凑巧相等）；
 * ② 固定偏移档只看偏移、不看进程时区，也不随 DST 变；
 * ③ 时间轴的跨年判定与标签同口径（判定若仍走本地 getter，③ 的标签位置会分裂）。
 */

const TZ = (tzOffsetMinutes: number | null): TimeDisplay => ({ hour12: false, tzOffsetMinutes });

/** 2024-06-15 12:00 UTC（日内/日跨度用例的锚点瞬间） */
const NOON_UTC = Date.UTC(2024, 5, 15, 12, 0);
/** 同一 UTC 瞬间在北约夏令时 / 冬令时两侧：本地读数差 1 小时，偏移差 240/300 分钟 */
const SUMMER = Date.UTC(2024, 6, 15, 12, 0);
const WINTER = Date.UTC(2024, 11, 15, 12, 0);

/** 采集时的进程时区与偏移基线。
 *  还原必须显式写回区名而不是删键：探针实测 `vi.unstubAllEnvs()`（其语义是删掉 stub 的键）
 *  之后 ICU 仍缓存上一用例的时区，偏移读数是 330 而不是本机基线 480。 */
const ORIG_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ORIG_LOCAL_OFFSET_MINUTES = -new Date().getTimezoneOffset();

afterEach(() => {
  // TZ 是进程级状态，泄漏会把同线程后续文件的「本地」一起改掉
  vi.stubEnv('TZ', ORIG_ZONE);
});

describe('tzDate：显示时区折算', () => {
  it('null 档 = 该瞬时的浏览器本地读数；纽约档夏冬读出 8 点 / 7 点（DST 就地生效）', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect([tzDate(SUMMER, null).getUTCHours(), tzDate(WINTER, null).getUTCHours()]).toEqual([8, 7]);
    // 与改造前的本地 getter 逐位相同（等价性的直接表述，不依赖我们对纽约偏移的手算）
    expect(tzDate(SUMMER, null).getUTCHours()).toBe(new Date(SUMMER).getHours());
    expect(tzDate(WINTER, null).getUTCHours()).toBe(new Date(WINTER).getHours());
    expect([tzDate(SUMMER, null).getUTCMinutes(), tzDate(WINTER, null).getUTCMinutes()]).toEqual([0, 0]);
  });

  it('固定偏移档与进程时区无关，也不随 DST 变', () => {
    vi.stubEnv('TZ', 'America/New_York');
    for (const t of [SUMMER, WINTER]) {
      expect(tzDate(t, 0).getUTCHours()).toBe(12);
      expect(tzDate(t, 480).getUTCHours()).toBe(20);
      expect(tzDate(t, 330).getUTCHours()).toBe(17);
      expect(tzDate(t, 330).getUTCMinutes()).toBe(30);
    }
  });

  it('半小时档：加尔各答本地档读出 +5:30，与固定 330 档同读数', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata');
    expect(tzDate(NOON_UTC, null).getUTCHours()).toBe(17);
    expect(tzDate(NOON_UTC, null).getUTCMinutes()).toBe(30);
    expect(tzDate(NOON_UTC, null).toISOString()).toBe(tzDate(NOON_UTC, 330).toISOString());
  });
});

describe('stubEnv 还原', () => {
  it('afterEach 后进程偏移回到采集基线（上一条用例的加尔各答档不泄漏给后续用例与后续文件）', () => {
    expect(-new Date().getTimezoneOffset()).toBe(ORIG_LOCAL_OFFSET_MINUTES);
  });
});

describe('formatTime：显示时区读数', () => {
  it('日内：同一 UTC 瞬间按偏移档读出不同墙上时间', () => {
    expect(formatTime(NOON_UTC, 10, false, TZ(0))).toBe('12:00');
    expect(formatTime(NOON_UTC, 10, false, TZ(480))).toBe('20:00');
    expect(formatTime(NOON_UTC, 10, false, TZ(330))).toBe('17:30');
    expect(formatTime(NOON_UTC, 10, false, TZ(-720))).toBe('00:00');
  });

  it('日跨度：+14 档把 12:00 UTC 滚到次日', () => {
    expect(formatTime(NOON_UTC, 120, true, TZ(0))).toBe('2024年6月15日');
    expect(formatTime(NOON_UTC, 120, true, TZ(840))).toBe('2024年6月16日');
  });

  it('hour12 与 tz 正交：12 小时制只改日内段格式', () => {
    expect(formatTime(NOON_UTC, 10, false, { hour12: true, tzOffsetMinutes: 0 })).toBe('12:00 PM');
    expect(formatTime(NOON_UTC, 10, false, { hour12: true, tzOffsetMinutes: 480 })).toBe('8:00 PM');
    expect(formatTime(NOON_UTC, 120, false, { hour12: true, tzOffsetMinutes: 480 })).toBe('6月15日');
  });

  it('缺省参数 = 显式 null 档 = 本地读数（改造前后逐字等价）', () => {
    vi.stubEnv('TZ', 'America/New_York');
    const pad = (n: number) => String(n).padStart(2, '0');
    const localHHmm = (t: number) => {
      const d = new Date(t);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    for (const t of [SUMMER, WINTER]) {
      expect(formatTime(t, 10)).toBe(formatTime(t, 10, false, DEFAULT_TIME_DISPLAY));
      expect(formatTime(t, 10, false, TZ(null))).toBe(localHHmm(t));
      expect(formatTime(t, 120, true, TZ(null))).toBe(
        `${new Date(t).getFullYear()}年${new Date(t).getMonth() + 1}月${new Date(t).getDate()}日`,
      );
    }
  });
});

/** 日线序列：从 2024-12-28 12:00 UTC 起 n 根（12:00 而非 00:00，好让 +14 档整根滚到次日） */
function dailyBars(n: number): Bar[] {
  return Array.from({ length: n }, (_unused, i) => {
    const time = Date.UTC(2024, 11, 28, 12, 0) + i * 86_400_000;
    return { time, open: 100, high: 101, low: 99, close: 100, volume: 1 };
  });
}

describe('drawTimeAxis：跨年判定与标签同口径', () => {
  const CHART_W = 1216;
  const CHART_H = 776;

  function labels(tzOffsetMinutes: number | null): string[] {
    const series = new BarSeries();
    series.replace(dailyBars(20));
    const vp = new Viewport(CHART_W);
    vp.setBarCount(20);
    vp.setBarSpacing(120); // 日跨度档（60–300px）：标签形如 M月D日，跨年才带年
    vp.setFirstPublic(0); // lx = i*120，i=0 落在 30px 门前不标 → 标注 i=1..9
    const c = createMockCtx();
    drawTimeAxis(asCtx(c), series, vp, { chartW: CHART_W, chartH: CHART_H }, 'right', TZ(tzOffsetMinutes));
    return fillTexts(c);
  }

  it('UTC 档：年标记落在 1 月 1 日那根', () => {
    expect(labels(0)).toEqual([
      '12月29日',
      '12月30日',
      '12月31日',
      '2025年1月1日',
      '1月2日',
      '1月3日',
      '1月4日',
      '1月5日',
      '1月6日',
    ]);
  });

  it('+14 档：整条读数滚后一天，年标记随之前移一格（判定若仍按本地 getter 就会分裂）', () => {
    expect(labels(840)).toEqual([
      '12月30日',
      '12月31日',
      '2025年1月1日',
      '1月2日',
      '1月3日',
      '1月4日',
      '1月5日',
      '1月6日',
      '1月7日',
    ]);
  });

  it('默认档（null）的产出 = UTC+8 本地读数，且不带任何偏移档的痕迹', () => {
    vi.stubEnv('TZ', 'Asia/Shanghai');
    expect(labels(null)).toEqual(labels(480));
  });
});
