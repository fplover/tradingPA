import type { Bar } from '@/types/market';

/**
 * Volume Profile 计算核心（P1-F，ADR-001 kline 近似）。
 * 每根 bar 的 volume 均匀摊入其 [low, high] 覆盖的价格行（TV 同语义）；
 * delta 源沿用 CVD 近似式 buyRatio=(close-low)/(high-low)（见 builtin/volume.ts）。
 * 纯函数无副作用；渲染层经 VolumeProfileModel 签名缓存，全量重算 O(可见bar×行数)。
 */

export interface VolumeProfileParams {
  /** 价格行数（Number of Rows 模式） */
  rowCount: number;
  /** 价值区域百分比（POC 起逐行扩张的累计阈值） */
  vaPercent: number;
  /** 量源：volume=按 K 线涨跌整笔归边；delta=按买卖量差近似拆分 */
  source: 'volume' | 'delta';
  /** 可选颜色覆盖（缺省跟随主题 token，绘制层读取） */
  upColor?: string;
  downColor?: string;
  pocColor?: string;
}

export const DEFAULT_VP_PARAMS: VolumeProfileParams = { rowCount: 24, vaPercent: 70, source: 'volume' };

/** 单价格行：up/down 分色累计量与行总量 */
export interface ProfileRow {
  low: number;
  high: number;
  up: number;
  down: number;
  total: number;
}

export interface ProfileResult {
  rows: ProfileRow[];
  /** 最大量行中心价 */
  poc: number;
  /** 价值区域上/下沿（覆盖行的最高/最低价） */
  vah: number;
  val: number;
  /** 全部行量合计 */
  total: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 参数清洗：UI 下发的 ParamValue 宽容收敛到合法域（行数 10-100、VA% 50-95） */
export function coerceVpParams(raw: Record<string, string | number | boolean> | undefined): VolumeProfileParams {
  const src = raw?.source;
  const source = src === 'delta' ? 'delta' : 'volume';
  const rowCount = clamp(
    Math.round(Number(raw?.rowCount ?? DEFAULT_VP_PARAMS.rowCount)) || DEFAULT_VP_PARAMS.rowCount,
    10,
    100,
  );
  const vaPercent = Number(raw?.vaPercent ?? DEFAULT_VP_PARAMS.vaPercent) || DEFAULT_VP_PARAMS.vaPercent;
  const out: VolumeProfileParams = {
    rowCount,
    vaPercent: clamp(vaPercent, 50, 95),
    source,
  };
  for (const key of ['upColor', 'downColor', 'pocColor'] as const) {
    const v = raw?.[key];
    if (typeof v === 'string' && v.length > 0) out[key] = v;
  }
  return out;
}

/**
 * 可见区间分桶：
 * - 价格域 [minLow, maxHigh] 均分 rowCount 行；
 * - 行归属：low 落入 floor、high 落入 ceil-1（价格点触上边界不占上一行，避免零测度行分摊）；
 * - POC = 最大量行（同量取更低价行）；VA 从 POC 起每次并入相邻较大行，累计 ≥ vaPercent%。
 * 无有效区间（空/零价差）返回 null。
 */
export function computeProfile(
  bars: readonly Bar[],
  from: number,
  to: number,
  params: VolumeProfileParams,
): ProfileResult | null {
  if (to < from) return null;
  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    if (!b) continue;
    if (b.low < minLow) minLow = b.low;
    if (b.high > maxHigh) maxHigh = b.high;
  }
  if (!Number.isFinite(minLow) || maxHigh <= minLow) return null;

  const n = Math.max(1, Math.floor(params.rowCount));
  const rowH = (maxHigh - minLow) / n;
  const rows: ProfileRow[] = [];
  for (let r = 0; r < n; r++)
    rows.push({ low: minLow + r * rowH, high: minLow + (r + 1) * rowH, up: 0, down: 0, total: 0 });

  const EPS = 1e-9;
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    if (!b) continue;
    let r0 = Math.floor((b.low - minLow) / rowH + EPS);
    let r1 = Math.ceil((b.high - minLow) / rowH - EPS) - 1;
    r0 = clamp(r0, 0, n - 1);
    r1 = clamp(r1, r0, n - 1);
    const span = r1 - r0 + 1;
    const range = b.high - b.low;
    // volume 源按 K 线涨跌整笔归边；delta 源按买卖量差近似式拆分（与 CVD 同式）
    const buyRatio =
      params.source === 'delta' ? (range === 0 ? 0.5 : (b.close - b.low) / range) : b.close >= b.open ? 1 : 0;
    const upPart = (b.volume * buyRatio) / span;
    const downPart = (b.volume - b.volume * buyRatio) / span;
    for (let r = r0; r <= r1; r++) {
      rows[r].up += upPart;
      rows[r].down += downPart;
      rows[r].total += upPart + downPart;
    }
  }

  let pocIdx = 0;
  let total = 0;
  for (let r = 0; r < n; r++) {
    total += rows[r].total;
    if (rows[r].total > rows[pocIdx].total) pocIdx = r;
  }
  if (!(total > 0)) return null;

  // VA 扩张：POC 起，每次并入上下相邻行中较大者（同量并入上方），累计至阈值
  const target = total * (clamp(params.vaPercent, 0, 100) / 100);
  let lo = pocIdx;
  let hi = pocIdx;
  let acc = rows[pocIdx].total;
  while (acc < target && (lo > 0 || hi < n - 1)) {
    const above = hi < n - 1 ? rows[hi + 1].total : -1;
    const below = lo > 0 ? rows[lo - 1].total : -1;
    if (above >= below) {
      hi++;
      acc += above;
    } else {
      lo--;
      acc += below;
    }
  }

  const pocRow = rows[pocIdx];
  return { rows, poc: (pocRow.low + pocRow.high) / 2, vah: rows[hi].high, val: rows[lo].low, total };
}

/** 缓存签名：可视区间（平移/缩放/复盘）+ 参数 + 数据纪元（applyData 自增）全覆盖 */
interface VPSignature {
  from: number;
  to: number;
  dataEpoch: number;
  rowCount: number;
  vaPercent: number;
  source: 'volume' | 'delta';
}

/** 帧级缓存模型：签名命中直接复用上次结果，避免每帧重算 */
export class VolumeProfileModel {
  private sig: VPSignature | null = null;
  private cache: ProfileResult | null = null;

  getProfile(
    bars: readonly Bar[],
    from: number,
    to: number,
    params: VolumeProfileParams,
    dataEpoch: number,
  ): ProfileResult | null {
    const s = this.sig;
    if (
      this.cache &&
      s &&
      s.from === from &&
      s.to === to &&
      s.dataEpoch === dataEpoch &&
      s.rowCount === params.rowCount &&
      s.vaPercent === params.vaPercent &&
      s.source === params.source
    ) {
      return this.cache;
    }
    const result = computeProfile(bars, from, to, params);
    this.sig = { from, to, dataEpoch, rowCount: params.rowCount, vaPercent: params.vaPercent, source: params.source };
    this.cache = result;
    return result;
  }
}
