let ctx: AudioContext | null = null
let master: GainNode | null = null

/**
 * 设置主音量。后续所有音效都应连接到这个 master 节点。
 * AudioContext 必须在用户手势中创建，本函数由滑杆交互触发，符合要求。
 */
export function setMasterVolume(percent: number): void {
  const value = Math.min(1, Math.max(0, percent / 100))

  if (!ctx) {
    const AC = window.AudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.connect(ctx.destination)
  }

  if (master) master.gain.value = value
}

export function getMasterNode(): GainNode | null {
  return master
}
