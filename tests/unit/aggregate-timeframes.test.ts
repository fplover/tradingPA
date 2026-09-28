import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aggregateBars, needsAggregation } from '@/data/aggregate';
import { getTimeframe, TIMEFRAMES } from '@/types/market';
import type { Bar, Timeframe, TimeframeId } from '@/types/market';
import {
  CUSTOM_INTERVAL_STORAGE_KEY,
  MAX_CUSTOM_INTERVALS,
  createCustomInterval,
  customIntervalId,
  customIntervalLabel,
  customIntervalMinutes,
  customIntervalOptions,
  forgetCustomInterval,
  initCustomIntervals,
  isCustomIntervalId,
  loadCustomIntervals,
  parseCustomIntervals,
  rememberCustomInterval,
  resolveCustomInterval,
  selectCustomInterval,
  serializeCustomIntervals,
  validateCustomInterval,
} from '@/features/market/customInterval';

/** 从 2024-01-01（周一）指定时刻起的 count 根 1m K 线：确定性价格游走 + 固定成交量 */
function minutes(count: number, startHour = 0, startMinute = 0): Bar[] {
  const bars: Bar[] = [];
  const base = Date.UTC(2024, 0, 1, startHour, startMinute);
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price + (i % 2 === 0 ? 1 : -1);
    bars.push({
      time: base + i * 60_000,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 10,
    });
    price = close;
  }
  return bars;
}

/** 独立 oracle：桶内 OHLC 直接折叠（不复用 aggregateBars 逻辑） */
function foldBucket(src: Bar[], bucketTime: number, seconds: number) {
  const inBucket = src.filter((b) => b.time >= bucketTime && b.time < bucketTime + seconds * 1000);
  return {
    count: inBucket.length,
    open: inBucket[0].open,
    close: inBucket[inBucket.length - 1].close,
    high: Math.max(...inBucket.map((b) => b.high)),
    low: Math.min(...inBucket.map((b) => b.low)),
    volume: inBucket.reduce((s, b) => s + b.volume, 0),
  };
}

describe('新周期档位（2m / 45m / 3H）', () => {
  it('档位表含 2m / 45m / 3H，秒数与顺序正确', () => {
    expect(getTimeframe('2m').seconds).toBe(120);
    expect(getTimeframe('45m').seconds).toBe(2700);
    expect(getTimeframe('3H').seconds).toBe(10800);
    // TV 档位顺序：2m 在 1m 后、45m 在 30m 后、3H 在 2H 后
    const ids = TIMEFRAMES.map((t) => t.id);
    expect(ids.indexOf('2m')).toBe(ids.indexOf('1m') + 1);
    expect(ids.indexOf('45m')).toBe(ids.indexOf('30m') + 1);
    expect(ids.indexOf('3H')).toBe(ids.indexOf('2H') + 1);
    expect(new Set(ids).size).toBe(ids.length); // id 不重复
  });

  it('getTimeframe 未知 id 仍回退 1m（TIMEFRAMES[4] 未因增档漂移）', () => {
    expect(TIMEFRAMES[4].id).toBe('1m');
    expect(getTimeframe('not-a-tf' as TimeframeId).id).toBe('1m');
  });

  it('needsAggregation：1m 基础上三者都需聚合', () => {
    expect(needsAggregation(60, getTimeframe('2m'))).toBe(true);
    expect(needsAggregation(60, getTimeframe('45m'))).toBe(true);
    expect(needsAggregation(60, getTimeframe('3H'))).toBe(true);
  });
});

describe('纪元对齐与聚合正确性（2m / 45m / 3H）', () => {
  it('2m：120 根 1m 聚合为 60 根，桶起点偶数分钟对齐', () => {
    const out = aggregateBars(minutes(120), getTimeframe('2m'));
    expect(out.length).toBe(60);
    expect(out[0].time).toBe(Date.UTC(2024, 0, 1, 0, 0));
    expect(out[1].time).toBe(Date.UTC(2024, 0, 1, 0, 2));
  });

  it('2m：奇数分钟起点归零到偶数边界，首桶只有 1 根', () => {
    // 00:01 / 00:02 / 00:03 → 00:00 桶 1 根、00:02 桶 2 根
    const src = minutes(3, 0, 1);
    const out = aggregateBars(src, getTimeframe('2m'));
    expect(out.length).toBe(2);
    expect(out[0].time).toBe(Date.UTC(2024, 0, 1, 0, 0));
    expect(out[0].volume).toBe(10);
    expect(out[1].time).toBe(Date.UTC(2024, 0, 1, 0, 2));
    expect(out[1].volume).toBe(20);
  });

  it('45m：60 根 1m 聚为 00:00 / 00:45 两桶', () => {
    const out = aggregateBars(minutes(60), getTimeframe('45m'));
    expect(out.length).toBe(2);
    expect(out[0].time).toBe(Date.UTC(2024, 0, 1, 0, 0));
    expect(out[1].time).toBe(Date.UTC(2024, 0, 1, 0, 45));
  });

  it('45m：跨午夜分桶（23:30 起 90 根 → 23:15 / 00:00 / 00:45）', () => {
    // 45m×32 = 一整天，桶边界整天对齐；23:30 归入 23:15 桶
    const out = aggregateBars(minutes(90, 23, 30), getTimeframe('45m'));
    expect(out.map((b) => b.time)).toEqual([
      Date.UTC(2024, 0, 1, 23, 15),
      Date.UTC(2024, 0, 2, 0, 0),
      Date.UTC(2024, 0, 2, 0, 45),
    ]);
    expect(out.map((b) => b.volume)).toEqual([300, 450, 150]); // 30 / 45 / 15 根
  });

  it('3H：360 根 1m 聚为 00:00 / 03:00 两桶', () => {
    const out = aggregateBars(minutes(6 * 60), getTimeframe('3H'));
    expect(out.length).toBe(2);
    expect(out[0].time).toBe(Date.UTC(2024, 0, 1, 0, 0));
    expect(out[1].time).toBe(Date.UTC(2024, 0, 1, 3, 0));
  });

  it('3H：不满一根的尾部单独成桶', () => {
    const out = aggregateBars(minutes(200), getTimeframe('3H'));
    expect(out.length).toBe(2);
    expect(out[0].volume).toBe(1800); // 180 根
    expect(out[1].time).toBe(Date.UTC(2024, 0, 1, 3, 0));
    expect(out[1].volume).toBe(200); // 尾部 20 根
  });

  it('三个新周期的桶起点全部 epoch 对齐（无秒/毫秒尾数）', () => {
    for (const id of ['2m', '45m', '3H'] as const) {
      const tf = getTimeframe(id);
      const out = aggregateBars(minutes(24 * 60), tf);
      for (const b of out) {
        expect(b.time % (tf.seconds * 1000)).toBe(0);
        expect(b.time % 1000).toBe(0);
      }
    }
  });

  it('成交量守恒（2m / 45m / 3H）', () => {
    const src = minutes(24 * 60);
    const sum = src.reduce((s, b) => s + b.volume, 0);
    for (const id of ['2m', '45m', '3H'] as const) {
      const out = aggregateBars(src, getTimeframe(id));
      expect(out.reduce((s, b) => s + b.volume, 0)).toBe(sum);
    }
  });

  it('OHLC 与独立折叠一致（首桶：open 取首根、close 取末根、high/low 取极值）', () => {
    const src = minutes(24 * 60);
    for (const id of ['2m', '45m', '3H'] as const) {
      const tf = getTimeframe(id);
      const out = aggregateBars(src, tf);
      const want = foldBucket(src, out[0].time, tf.seconds);
      expect(out[0].open).toBe(want.open);
      expect(out[0].close).toBe(want.close);
      expect(out[0].high).toBe(want.high);
      expect(out[0].low).toBe(want.low);
      expect(out[0].volume).toBe(want.volume);
    }
  });

  it('日历分桶毫秒归零：亚秒时间戳不产生未对齐桶起点（守卫 aggregate.ts 修复）', () => {
    const base = Date.UTC(2024, 0, 3); // 周三
    const src: Bar[] = [
      { time: base + 12_345, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: base + 86_400_000 - 1, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];
    const w = aggregateBars(src, getTimeframe('1W'));
    expect(w[0].time % 1000).toBe(0);
    expect(w[0].time).toBe(Date.UTC(2024, 0, 1)); // 归到周一 00:00
  });
});

describe('自定义间隔：id / 标签 / 校验', () => {
  it('createCustomInterval：分钟 → id/label/seconds', () => {
    expect(createCustomInterval(7)).toEqual({ id: 'custom:7', label: '7分', seconds: 420 });
    expect(createCustomInterval(90)).toEqual({ id: 'custom:90', label: '90分', seconds: 5400 });
    expect(createCustomInterval(120)).toEqual({ id: 'custom:120', label: '2时', seconds: 7200 });
  });

  it('id 助手：前缀识别与分钟数提取', () => {
    expect(customIntervalId(90)).toBe('custom:90');
    expect(isCustomIntervalId('custom:7')).toBe(true);
    expect(isCustomIntervalId('custom:0')).toBe(false);
    expect(isCustomIntervalId('custom:abc')).toBe(false);
    expect(isCustomIntervalId('custom:7m')).toBe(false); // 旧格式不再承认
    expect(isCustomIntervalId('45m')).toBe(false);
    expect(customIntervalMinutes('custom:90')).toBe(90);
    expect(customIntervalMinutes('1H')).toBeNull();
    expect(customIntervalMinutes('custom:x')).toBeNull();
  });

  it('customIntervalLabel：整小时折时，否则分', () => {
    expect(customIntervalLabel(7)).toBe('7分');
    expect(customIntervalLabel(90)).toBe('90分');
    expect(customIntervalLabel(120)).toBe('2时');
    expect(customIntervalLabel(600)).toBe('10时');
  });

  it('validateCustomInterval：TV 范围（分钟 1-1440 / 小时 1-24）', () => {
    expect(validateCustomInterval(1, 'm')).toBeNull();
    expect(validateCustomInterval(1440, 'm')).toBeNull();
    expect(validateCustomInterval(1441, 'm')).not.toBeNull();
    expect(validateCustomInterval(0, 'm')).not.toBeNull();
    expect(validateCustomInterval(1.5, 'm')).not.toBeNull(); // 必须整数
    expect(validateCustomInterval(1, 'H')).toBeNull();
    expect(validateCustomInterval(24, 'H')).toBeNull();
    expect(validateCustomInterval(25, 'H')).not.toBeNull();
    expect(validateCustomInterval(0, 'H')).not.toBeNull();
  });
});

describe('自定义间隔：解析 → 注册 → 聚合链路', () => {
  it('resolveCustomInterval 命中内置档位直接返回内置定义（不造重复项、不落盘）', () => {
    const before = TIMEFRAMES.length;
    expect(resolveCustomInterval(45, 'm').id).toBe('45m');
    expect(resolveCustomInterval(3, 'H').id).toBe('3H');
    expect(resolveCustomInterval(2, 'm').id).toBe('2m');
    expect(resolveCustomInterval(60, 'm').id).toBe('1H');
    expect(resolveCustomInterval(1440, 'm').id).toBe('1D'); // 1440 分钟 = 1 日
    expect(TIMEFRAMES.length).toBe(before);
  });

  it('resolveCustomInterval 非内置：创建 + 注册进 TIMEFRAMES（getTimeframe 可解析，幂等）', () => {
    const tf = resolveCustomInterval(7, 'm');
    expect(tf.id).toBe('custom:7');
    expect(tf.seconds).toBe(420);
    // 注册后既有取用路径全部认得它（useChartSeries / ChartCell / 顶栏下拉同源）
    expect(getTimeframe('custom:7' as TimeframeId).seconds).toBe(420);
    expect(TIMEFRAMES.filter((t) => t.id === 'custom:7').length).toBe(1);
    resolveCustomInterval(7, 'm'); // 再次解析不重复注册
    expect(TIMEFRAMES.filter((t) => t.id === 'custom:7').length).toBe(1);
  });

  it('自定义 7 分钟：聚合 + 尾部 + OHLC', () => {
    // 7m 不整除一天：纪元 floor 桶边界跨午夜漂移（…23:54 → 00:01 → 00:08）
    const tf = createCustomInterval(7);
    const src = minutes(10);
    const out = aggregateBars(src, tf);
    expect(out.map((b) => b.time)).toEqual([
      Date.UTC(2023, 11, 31, 23, 54),
      Date.UTC(2024, 0, 1, 0, 1),
      Date.UTC(2024, 0, 1, 0, 8),
    ]);
    expect(out.map((b) => b.volume)).toEqual([10, 70, 20]); // 首桶 1 根（00:00）、中桶 7 根、尾桶 2 根
    const want = foldBucket(src, out[0].time, tf.seconds);
    expect(out[0].open).toBe(want.open);
    expect(out[0].close).toBe(want.close);
    expect(out[0].high).toBe(want.high);
    expect(out[0].low).toBe(want.low);
  });

  it('自定义 90 分钟：聚合 + 不满一根尾部', () => {
    const out = aggregateBars(minutes(100), createCustomInterval(90));
    expect(out.map((b) => b.time)).toEqual([Date.UTC(2024, 0, 1, 0, 0), Date.UTC(2024, 0, 1, 1, 30)]);
    expect(out.map((b) => b.volume)).toEqual([900, 100]);
  });

  it('自定义 5 小时：聚合 + 跨午夜', () => {
    // 5H 不整除一天：纪元 floor 桶边界为 …22:00 → 03:00 → 08:00 → 13:00 → 18:00 → 23:00 → 04:00
    const out = aggregateBars(minutes(360), createCustomInterval(300));
    expect(out.map((b) => b.time)).toEqual([Date.UTC(2023, 11, 31, 22, 0), Date.UTC(2024, 0, 1, 3, 0)]);
    expect(out.map((b) => b.volume)).toEqual([1800, 1800]);
    const cross = aggregateBars(minutes(480, 22, 0), createCustomInterval(300));
    expect(cross.map((b) => b.time)).toEqual([
      Date.UTC(2024, 0, 1, 18, 0),
      Date.UTC(2024, 0, 1, 23, 0),
      Date.UTC(2024, 0, 2, 4, 0),
    ]);
    expect(cross.map((b) => b.volume)).toEqual([600, 3000, 1200]); // 60 / 300 / 120 根
  });

  it('自定义周期成交量守恒', () => {
    const src = minutes(600);
    const sum = src.reduce((s, b) => s + b.volume, 0);
    const out = aggregateBars(src, createCustomInterval(7));
    expect(out.reduce((s, b) => s + b.volume, 0)).toBe(sum);
  });
});

describe('自定义间隔：序列化与持久化', () => {
  it('serialize / parse 往返保持顺序', () => {
    const list = [createCustomInterval(7), createCustomInterval(90)];
    expect(parseCustomIntervals(serializeCustomIntervals(list)).map((t) => t.id)).toEqual(['custom:7', 'custom:90']);
  });

  it('parse 宽容：坏 JSON / null / 非对象条目一律跳过', () => {
    expect(parseCustomIntervals('{broken')).toEqual([]);
    expect(parseCustomIntervals(null)).toEqual([]);
    expect(parseCustomIntervals(JSON.stringify({ version: 1, items: 'nope' }))).toEqual([]);
    expect(
      parseCustomIntervals(
        JSON.stringify({ version: 1, items: [{ minutes: 0 }, { minutes: -5 }, { minutes: 2.5 }, { minutes: '7' }, { minutes: 7 }] }),
      ).map((t) => t.id),
    ).toEqual(['custom:7']);
  });

  it('parse 跳过与内置档位重复的分钟数（旧档位升级内置后不残留）', () => {
    const raw = JSON.stringify({ version: 1, items: [{ id: 'custom:45', minutes: 45 }, { id: 'custom:7', minutes: 7 }] });
    expect(parseCustomIntervals(raw).map((t) => t.id)).toEqual(['custom:7']);
  });

  it('parse 封顶 MAX_CUSTOM_INTERVALS', () => {
    const primes = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]; // 均不命中内置档位
    const raw = JSON.stringify({ version: 1, items: primes.map((m) => ({ id: `custom:${m}`, minutes: m })) });
    const out = parseCustomIntervals(raw);
    expect(out.length).toBe(MAX_CUSTOM_INTERVALS);
    expect(out[0].id).toBe('custom:7');
  });

  it('customIntervalOptions：下拉「自定义」分组选项', () => {
    const opts = customIntervalOptions();
    expect(opts.every((o) => o.group === '自定义')).toBe(true);
    for (const o of opts) expect(isCustomIntervalId(o.value)).toBe(true);
  });
});

describe('自定义间隔：localStorage 持久化（fake storage）', () => {
  const mem = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  };
  const g = globalThis as { localStorage?: typeof fakeStorage };

  beforeEach(() => {
    mem.clear();
    g.localStorage = fakeStorage;
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it('remember → load 往返；去重且最新在前；forget 移除', () => {
    rememberCustomInterval(createCustomInterval(7));
    expect(loadCustomIntervals().map((t) => t.id)).toEqual(['custom:7']);
    rememberCustomInterval(createCustomInterval(90));
    expect(loadCustomIntervals().map((t) => t.id)).toEqual(['custom:90', 'custom:7']);
    rememberCustomInterval(createCustomInterval(7)); // 重复 → 前移而非新增
    expect(loadCustomIntervals().map((t) => t.id)).toEqual(['custom:7', 'custom:90']);
    forgetCustomInterval('custom:7');
    expect(loadCustomIntervals().map((t) => t.id)).toEqual(['custom:90']);
  });

  it('remember 写入约定 key；resolveCustomInterval 非内置时落盘', () => {
    resolveCustomInterval(7, 'm');
    expect(mem.has(CUSTOM_INTERVAL_STORAGE_KEY)).toBe(true);
    expect(loadCustomIntervals().map((t) => t.id)).toEqual(['custom:7']);
  });

  it('remember 封顶 MAX_CUSTOM_INTERVALS，最新在前', () => {
    for (const m of [7, 11, 13, 17, 19, 23, 29, 31, 37]) rememberCustomInterval(createCustomInterval(m));
    const loaded = loadCustomIntervals();
    expect(loaded.length).toBe(MAX_CUSTOM_INTERVALS);
    expect(loaded.map((t) => t.id)).toEqual([
      'custom:37',
      'custom:31',
      'custom:29',
      'custom:23',
      'custom:19',
      'custom:17',
      'custom:13',
      'custom:11',
    ]);
  });

  it('selectCustomInterval：提到最新 + 注册可解析', () => {
    const stored: Timeframe = createCustomInterval(7);
    rememberCustomInterval(stored);
    rememberCustomInterval(createCustomInterval(90));
    const applied = selectCustomInterval(stored);
    expect(applied.id).toBe('custom:7');
    expect(loadCustomIntervals().map((t) => t.id)).toEqual(['custom:7', 'custom:90']);
    expect(getTimeframe('custom:7' as TimeframeId).seconds).toBe(420);
  });

  it('initCustomIntervals：预置存档 → 注册进 TIMEFRAMES（下次进入可复用）', () => {
    mem.set(
      CUSTOM_INTERVAL_STORAGE_KEY,
      JSON.stringify({ version: 1, items: [{ id: 'custom:11', minutes: 11 }] }),
    );
    initCustomIntervals();
    expect(getTimeframe('custom:11' as TimeframeId).seconds).toBe(660);
    expect(getTimeframe('custom:11' as TimeframeId).label).toBe('11分');
  });
});
