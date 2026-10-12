import { localTzOffsetMinutes } from '@/data/tz';
import { TZ_OFFSET_LIMITS, useChartConfigStore } from '@/store/chartConfigStore';
import { NumberStepper, Segmented, SettingRow } from '@/ui/controls';
import { fontSize, space } from '@/ui/tokens';

/** 时区档形态（三期-B3「一般」页）：null = 浏览器本地，其余 = 固定偏移分钟 */
const TZ_MODE_OPTIONS: Array<{ value: 'local' | 'fixed'; label: string }> = [
  { value: 'local', label: '浏览器本地' },
  { value: 'fixed', label: '固定偏移' },
];

/**
 * 图表设置「一般」页（三期-B3）：时间标签显示时区。
 *
 * 值由 chartConfigStore 持有并落盘（null = 浏览器本地，即 B3 改造前口径），本页只读写。
 * 上下限取 TZ_OFFSET_LIMITS，与落盘读档的 clamp 同一份口径（B2 同例）。
 *
 * 有意越界之处只有一条，且是设计而非遗漏：本页是**仅显示层**口径——改的是读数，
 * 不改数据。K 线时间戳与周/月/日日历桶的归桶时区仍按数据源派生（见 data/tz.ts），
 * 两者分离的代价与历史事故记录在该文件头注释里。
 */
export function ChartGeneralSection() {
  const tzOffsetMinutes = useChartConfigStore((s) => s.tzOffsetMinutes);
  const setTzOffsetMinutes = useChartConfigStore((s) => s.setTzOffsetMinutes);

  /** 由本地切入固定档时以当前本地偏移起算：切档瞬间读数不跳 */
  const toFixed = () => setTzOffsetMinutes(tzOffsetMinutes ?? localTzOffsetMinutes());

  return (
    <>
      <SettingRow label="时间标签时区">
        <Segmented
          ariaLabel="时间标签时区"
          value={tzOffsetMinutes === null ? 'local' : 'fixed'}
          options={TZ_MODE_OPTIONS}
          onChange={(v) => (v === 'local' ? setTzOffsetMinutes(null) : toFixed())}
        />
      </SettingRow>
      {tzOffsetMinutes !== null && (
        <SettingRow label="偏移（分钟，东为正）">
          <NumberStepper
            ariaLabel="时区偏移"
            value={tzOffsetMinutes}
            min={TZ_OFFSET_LIMITS.min}
            max={TZ_OFFSET_LIMITS.max}
            step={30}
            onChange={setTzOffsetMinutes}
          />
        </SettingRow>
      )}
      <p style={hintStyle}>
        只改时间轴标签、十字光标时间读数与底部时区标的读时口径，不改 K 线时间戳，也不改周 / 月 / 日
        日历桶的归桶时区（归桶按数据源口径：crypto 走 UTC，其余走浏览器本地，见 data/tz.ts）。 固定偏移填 0 即
        UTC；半小时档（如 +5:30 = 330）直接输入。
        列表类时间（回放条、成交记录、警报时刻、布局存档时间）不在本页口径内，仍按浏览器本地读数。
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
