/** 拖拽中画线变更的合帧广播器（P2-D③遗留接线）：画线警报面板清单/对象树不逐像素刷新。
 *  rAF 运行中只记 pending，由主循环每帧至多冲刷一次（与收盘倒计时唤醒同源的合帧
 *  机制——借既有 rAF，不另起定时器抢帧）；rAF 未运行（测试/暂停）立即广播，不丢事件。
 *  从 ChartController 抽出：门面保持纯委托，合帧状态机独立可测。 */
export class DrawingsNotifyCoalescer {
  private pending = false;

  /** 请求一次广播。loopActive = rAF 运行中 → 合帧到下一帧；否则立即广播 */
  request(loopActive: boolean, notify: () => void): void {
    if (loopActive) {
      this.pending = true;
      return;
    }
    notify();
  }

  /** 主循环每帧调用：有待冲刷广播则执行一次（每帧至多一次） */
  flush(notify: () => void): void {
    if (!this.pending) return;
    this.pending = false;
    notify();
  }
}
