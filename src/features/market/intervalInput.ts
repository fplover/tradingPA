import { TIMEFRAMES, type TimeframeId } from '@/types/market';

/** TV 式周期输入的纯函数层：解析用户输入 → 档位表命中。
 *  与 IntervalInputDialog 组件分离（同 goToDate / customInterval 的纯函数模块惯例），可独立单测。 */

/** 解析 TV 式周期输入：纯数字 = 分钟（60 的倍数折合小时）；数字 + 单位 s/m/h/d/w
 *  （大写 M = 月）；裸单位字母 = 1 个单位。按秒数/日历匹配档位表（内置 + 运行时注册的
 *  自定义周期一并命中，如已存 custom:7 时输 7 即命中）；不在表内返回 null。 */
export function parseIntervalInput(raw: string): TimeframeId | null {
  const m = /^\s*(\d*)\s*([smhdwSMHDW]?)\s*$/.exec(raw);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 1;
  if (!Number.isInteger(n) || n < 1) return null;
  const unit = m[2];
  // 周/月秒数为 0 走日历分桶，按 calendar 匹配；其余按秒数匹配
  if (unit === 'w' || unit === 'W') {
    const hit = TIMEFRAMES.find((t) => t.calendar === 'week');
    return hit ? hit.id : null;
  }
  if (unit === 'M') {
    const hit = TIMEFRAMES.find((t) => t.calendar === 'month');
    return hit ? hit.id : null;
  }
  const sec = !unit ? n * 60 : unit === 's' ? n : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : n * 86400;
  const hit = TIMEFRAMES.find((t) => t.seconds === sec && !t.calendar);
  return hit ? hit.id : null;
}
