import type { Bar } from '@/types/market';
import type { S } from './series';

/**
 * Pine strategy 骨架模拟器（向量化离线模型）。
 *
 * 语义边界（骨架最小集，与 TV 实时撮合的差异均为有意取舍）：
 * - strategy.entry：mask=1 的 bar 上按收盘价开仓；持仓反向时先平后反向开
 *   （收盘价撮合近似）；同向重复开仓忽略（pyramiding=0 语义）。
 * - strategy.close(id)：仅当当前持仓由同 id 的 entry 开出时按收盘价平仓。
 * - strategy.exit：stop/limit 对收盘价近似触发（TV 为盘中触发），先于本 bar
 *   的新开仓检查；不校验 from_entry（作用于当前持仓）。
 * - 数量固定 1 单位，盈亏 = 价差 × 方向；无手续费/滑点。
 * - 内置序列 strategy.position_size / netprofit / equity 仅在脚本体执行完毕
 *   后可用（plot/hline/警报语境）：向量化模型下分支掩码要等全部语句求值
 *   后才确定，脚本体中途引用会读到不完整的模拟结果，故直接报错。
 * - varip 与 var 同义（离线模型无实时回滚）。
 */

export const STRATEGY_BUILTINS: ReadonlySet<string> = new Set([
  'strategy.position_size',
  'strategy.netprofit',
  'strategy.equity',
]);

interface StratEvent {
  op: 'entry' | 'close' | 'exit';
  id: string;
  dir?: 1 | -1;
  mask: S | null;
  stop: S | null;
  limit: S | null;
}

export interface StratResult {
  /** 持仓方向序列：1 多头 / -1 空头 / 0 空仓 */
  positionSize: S;
  /** 已实现盈亏序列 */
  netprofit: S;
  /** 净值序列 = 已实现盈亏 + 浮动盈亏 */
  equity: S;
}

export class StratSim {
  private events: StratEvent[] = [];
  private result: StratResult | null = null;

  entry(dir: 1 | -1, id: string, mask: S | null): void {
    this.events.push({ op: 'entry', id, dir, mask, stop: null, limit: null });
  }

  close(id: string, mask: S | null): void {
    this.events.push({ op: 'close', id, mask, stop: null, limit: null });
  }

  exit(id: string, mask: S | null, stop: S | null, limit: S | null): void {
    this.events.push({ op: 'exit', id, mask, stop, limit });
  }

  /** 脚本体执行完毕后逐 bar 结算（登记序即脚本序，对齐 Pine 逐 bar 指令顺序） */
  finalize(bars: readonly Bar[]): void {
    if (this.result) return;
    const n = bars.length;
    const positionSize: S = new Array<number>(n).fill(0);
    const netprofit: S = new Array<number>(n).fill(0);
    const equity: S = new Array<number>(n).fill(0);
    let pos = 0;
    let entryPrice = 0;
    let curId = '';
    let realized = 0;
    const closeAt = (price: number): void => {
      realized += (price - entryPrice) * pos;
      pos = 0;
      entryPrice = 0;
      curId = '';
    };
    for (let i = 0; i < n; i++) {
      const c = bars[i].close;
      // 1) exit 触发检查（stop/limit 对 close 近似；先于本 bar 新开仓）
      for (const ev of this.events) {
        if (ev.op !== 'exit' || pos === 0) continue;
        if (ev.mask && ev.mask[i] !== 1) continue;
        const s = ev.stop?.[i];
        const l = ev.limit?.[i];
        if (pos > 0) {
          if (s !== undefined && c <= s) {
            closeAt(s);
            continue;
          }
          if (l !== undefined && c >= l) {
            closeAt(l);
            continue;
          }
        } else if (s !== undefined && c >= s) {
          closeAt(s);
          continue;
        } else if (l !== undefined && c <= l) {
          closeAt(l);
          continue;
        }
      }
      // 2) entry/close 按登记序处理
      for (const ev of this.events) {
        if (ev.op === 'exit' || (ev.mask && ev.mask[i] !== 1)) continue;
        if (ev.op === 'entry' && ev.dir !== undefined) {
          if (pos === ev.dir) continue; // 同向加仓忽略
          if (pos !== 0) closeAt(c); // 反向：先按本 bar 收盘平仓
          pos = ev.dir;
          entryPrice = c;
          curId = ev.id;
        } else if (ev.op === 'close' && pos !== 0 && ev.id === curId) {
          closeAt(c);
        }
      }
      positionSize[i] = pos;
      netprofit[i] = realized;
      equity[i] = realized + (pos !== 0 ? (c - entryPrice) * pos : 0);
    }
    this.result = { positionSize, netprofit, equity };
  }

  /** 内置序列取值：仅在 finalize 之后（plot/hline/警报语境）可用 */
  value(name: string): S {
    if (!this.result) {
      throw new Error(`「${name}」需在脚本体结束后引用（plot/hline/警报）：向量化模型下脚本体中途不可用`);
    }
    if (name === 'strategy.position_size') return this.result.positionSize;
    if (name === 'strategy.netprofit') return this.result.netprofit;
    return this.result.equity;
  }
}
