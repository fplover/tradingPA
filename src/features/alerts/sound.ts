let ctx: AudioContext | null = null;

/**
 * 警报提示音：Web Audio 短哔（880Hz 正弦 ~0.2s，音量包络防爆音）。
 * 浏览器不支持 / 用户未交互导致 AudioContext 不可用时静默降级为仅通知。
 * 返回是否成功发声（仅供调试，不参与 UI 决策）。
 */
export function playAlertBeep(): boolean {
  try {
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
    return true;
  } catch {
    return false;
  }
}
