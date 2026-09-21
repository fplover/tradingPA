import type { Bar } from '@/types/market';

const DB_NAME = 'tradingpa';
const STORE = 'klines';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE); // key: `${symbol}:${interval}`
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyOf(symbol: string, interval: string): string {
  return `${symbol}:${interval}`;
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
    try {
      const db = await openDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(bars, keyOf(symbol, interval));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      /* 缓存写入失败不影响主流程 */
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
