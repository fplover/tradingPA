import type { Bar } from '@/types/market';

const DB_NAME = 'tradingpa';
const STORE = 'klines';
const VERSION = 1;

/**
 * 写入节流最小间隔：轮询每拍都 put 会整表重写整段历史（800 根），
 * 而轮询本身 5–30s 一拍、内容多为不变。内容指纹相同直接跳过；
 * 指纹变化但距上次写入不足该间隔时也跳过（下一拍再落）。
 */
const MIN_WRITE_INTERVAL_MS = 5_000;

/**
 * 连接单例（第四轮审查修复）：此前每次 get/put 都 `indexedDB.open()` 新开连接
 * 且**从不 close**，而 `put` 由聚合路径的每个轮询拍调用（aggregatePath.ts 的 onBars）
 * → 连接与事务持续累积。改为模块级单例 + 异常/被关闭时丢弃重建。
 */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE); // key: `${symbol}:${interval}`
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 版本变更/存储被清理等异常关闭 → 丢弃单例，下次调用重开
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null; // 不缓存失败的 promise，否则后续调用永远失败
      reject(req.error);
    };
  });
  return dbPromise;
}

function keyOf(symbol: string, interval: string): string {
  return `${symbol}:${interval}`;
}

/** 内容指纹：长度 + 首末时间 + 末根收盘（末根就地更新是实时路径，必须进指纹） */
function fingerprint(bars: readonly Bar[]): string {
  const first = bars[0];
  const last = bars[bars.length - 1];
  return `${bars.length}:${first?.time ?? 0}:${last?.time ?? 0}:${last?.close ?? 0}`;
}

/** key → 上次落盘的指纹与时刻（节流用；进程内有效） */
const lastWrite = new Map<string, { fp: string; at: number }>();

/**
 * 是否值得落盘：内容指纹变了、且距上次写入已超过最小间隔（导出以便单测）。
 * 轮询路径（aggregatePath.onBars 每拍调用 put）在没有这道门时会把整段历史
 * 反复整表重写——800 根 × 每 5s 一次。
 */
export function shouldWrite(
  prev: { fp: string; at: number } | undefined,
  fp: string,
  now: number,
  minIntervalMs = MIN_WRITE_INTERVAL_MS,
): boolean {
  if (!prev) return true;
  if (prev.fp === fp) return false;
  return now - prev.at >= minIntervalMs;
}

/** 历史 K 线本地缓存（IndexedDB，不可用时静默降级） */
export const klineCache = {
  async get(symbol: string, interval: string): Promise<Bar[]> {
    try {
      const db = await openDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(keyOf(symbol, interval));
        req.onsuccess = () => resolve((req.result as Bar[]) ?? []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async put(symbol: string, interval: string, bars: Bar[]): Promise<void> {
    const key = keyOf(symbol, interval);
    const fp = fingerprint(bars);
    const now = Date.now();
    if (!shouldWrite(lastWrite.get(key), fp, now)) return; // 内容未变 / 间隔不足：跳过整表重写

    try {
      const db = await openDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(bars, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      /* 缓存写入失败不影响主流程 */
    } finally {
      // 无论成败都记录：避免存储持续失败时形成重试风暴
      lastWrite.set(key, { fp, at: now });
    }
  },

  /** 合并缓存与新数据（按时间去重，升序） */
  merge(cached: Bar[], fresh: Bar[]): Bar[] {
    const map = new Map<number, Bar>();
    for (const b of cached) map.set(b.time, b);
    for (const b of fresh) map.set(b.time, b);
    return [...map.values()].sort((a, b) => a.time - b.time);
  },
};
