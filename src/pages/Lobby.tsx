type Props = {
  onBack: () => void
}

/**
 * 联机大厅占位页。
 * 房间创建、房间码加入、Socket.IO 连接在后续迭代中实现。
 */
export default function Lobby({ onBack }: Props) {
  return (
    <div className="lobby">
      <div className="menu__bg" aria-hidden="true" />
      <div className="menu__scrim" aria-hidden="true" />
      <div className="lobby__panel">
        <h2 className="lobby__title">联机大厅</h2>
        <p className="lobby__desc">房间系统尚未接入</p>
        <button type="button" className="menu-btn" onClick={onBack}>
          返回主界面
        </button>
      </div>
    </div>
  )
}
