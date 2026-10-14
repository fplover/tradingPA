import { useAlertStore } from '@/store/alertStore';
import { CheckRow } from '@/ui/controls';
import { fontSize, space } from '@/ui/tokens';

/**
 * 图表设置「警报」页（三期-B4，用户裁决 2026-10-14：补页签承载提示音开关）。
 *
 * 改造前的形态是「能力在、入口无」：`alertStore.check()` 一直按 `soundEnabled` 决定是否
 * `playAlertBeep()`，该字段也随 v2 存档持久化，但 `setSoundEnabled` 全仓调用点为 0——
 * 用户要静音只能手改 localStorage。本页补的就是那个入口，值仍由 alertStore 持有并落盘。
 *
 * 有意只放一项：触发判定、历史登记与系统通知都不受该开关影响（`check()` 里
 * `recordAlertFires` / `notifyBatch` 与声音是平行的三行），把它们做成同页开关只会造出
 * 一个关不掉的假开关或一个越权的开关；系统通知的开关位本身在浏览器通知权限上。
 */
export function ChartAlertSection() {
  const soundEnabled = useAlertStore((s) => s.soundEnabled);
  const setSoundEnabled = useAlertStore((s) => s.setSoundEnabled);

  return (
    <>
      <CheckRow label="警报触发时播放提示音" checked={soundEnabled} onChange={setSoundEnabled} />
      <p style={hintStyle}>
        只影响画布提示音。警报的触发判定、历史登记与系统通知均不受本页开关影响；系统通知另受浏览器通知权限约束。
        提示音走 Web Audio，浏览器在页面首次交互前会挂起 AudioContext，该窗口内不发声属预期。
      </p>
    </>
  );
}

const hintStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: fontSize.sm,
  lineHeight: 1.7,
  margin: `${space.xs}px 0 0`,
};
