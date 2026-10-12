import { TRADE_LIMITS, useTradeSettingsStore } from '@/store/tradeSettingsStore';
import { CheckRow, NumberStepper, SettingRow } from '@/ui/controls';
import { fontSize, space } from '@/ui/tokens';

/**
 * 图表设置「交易」页（三期-B2）：下单默认量 / 止损价偏移 / 模拟盘初始资金 / 交易可视化显隐。
 *
 * 四值全部由 tradeSettingsStore 持有并落盘，本页只做读写；上下限取自 TRADE_LIMITS，
 * 与落盘读档的 clamp 同一份口径，避免「UI 能调出存档读不回的值」。
 *
 * 有意不提供项：手续费与滑点。paperEngine 无这两个概念，做成开关只能是假 UI。
 */
export function ChartTradingSection() {
  const defaultQty = useTradeSettingsStore((s) => s.defaultQty);
  const setDefaultQty = useTradeSettingsStore((s) => s.setDefaultQty);
  const stopOffsetPct = useTradeSettingsStore((s) => s.stopOffsetPct);
  const setStopOffsetPct = useTradeSettingsStore((s) => s.setStopOffsetPct);
  const initialBalance = useTradeSettingsStore((s) => s.initialBalance);
  const setInitialBalance = useTradeSettingsStore((s) => s.setInitialBalance);
  const showTrading = useTradeSettingsStore((s) => s.showTrading);
  const setShowTrading = useTradeSettingsStore((s) => s.setShowTrading);

  return (
    <>
      <SettingRow label="默认下单数量">
        <NumberStepper
          ariaLabel="默认下单数量"
          value={defaultQty}
          min={TRADE_LIMITS.qty.min}
          max={TRADE_LIMITS.qty.max}
          step={0.01}
          onChange={setDefaultQty}
        />
      </SettingRow>
      <SettingRow label="止损价偏移（%）">
        <NumberStepper
          ariaLabel="止损价偏移"
          value={stopOffsetPct}
          min={TRADE_LIMITS.slPct.min}
          max={TRADE_LIMITS.slPct.max}
          step={0.5}
          onChange={setStopOffsetPct}
        />
      </SettingRow>
      <SettingRow label="模拟盘初始资金">
        <NumberStepper
          ariaLabel="模拟盘初始资金"
          value={initialBalance}
          min={TRADE_LIMITS.balance.min}
          max={TRADE_LIMITS.balance.max}
          step={1000}
          onChange={setInitialBalance}
        />
      </SettingRow>
      <CheckRow label="显示交易可视化（挂单线 / 持仓线 / 止盈止损）" checked={showTrading} onChange={setShowTrading} />
      <p style={hintStyle}>
        默认量与止损偏移在下一次打开下单表单时生效；初始资金在下一次进入回放（新会话重置引擎）时生效，
        不打断进行中的会话。止损价 = 当前价 × (1 + 偏移% ÷ 100)。
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
