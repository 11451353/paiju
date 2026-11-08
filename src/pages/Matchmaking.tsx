import { useEffect, useState } from 'react'
import type { GameSocket } from '../lib/useGameSocket'

const MAX_PLAYERS = 4

type Props = {
  sock: GameSocket
  onBack: () => void
}

export default function Matchmaking({ sock, onBack }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    sock.joinQueue()
    // 只在进入页面时入队一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function cancel() {
    sock.leaveQueue()
    onBack()
  }

  const size = sock.queue?.size ?? 1

  return (
    <div className="match">
      <div className="menu__bg" aria-hidden="true" />
      <div className="menu__scrim" aria-hidden="true" />

      <div className="match__panel">
        {sock.error ? (
          <>
            <p className="match__error">{sock.error}</p>
            <p className="match__hint">
              请确认已通过本地服务地址打开游戏，而不是直接打开文件
            </p>
            <button type="button" className="menu-btn" onClick={onBack}>
              返回主界面
            </button>
          </>
        ) : (
          <>
            <div className="radar" aria-hidden="true">
              <span className="radar__ring" />
              <span className="radar__ring" />
              <span className="radar__ring" />
              <span className="radar__core" />
            </div>
            <p className="match__title">正在寻找附近的对手</p>
            <p className="match__hint">
              {size > 1
                ? `同一网络已有 ${size} 人在等待，最多 ${MAX_PLAYERS} 人`
                : '等待同一网络下的其他设备加入'}
            </p>
            <p className="match__timer">{elapsed}s</p>
            <button type="button" className="menu-btn menu-btn--danger" onClick={cancel}>
              取消匹配
            </button>
          </>
        )}
      </div>
    </div>
  )
}
