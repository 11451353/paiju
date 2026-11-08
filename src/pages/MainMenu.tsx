import { useEffect, useState } from 'react'
import RulesBook from '../components/RulesBook'
import SettingsSheet from '../components/SettingsSheet'
import type { Settings } from '../lib/settings'
import { AVATARS, type Profile } from '../lib/profile'

type Props = {
  settings: Settings
  onChangeSettings: (patch: Partial<Settings>) => void
  profile: Profile
  onChangeProfile: (patch: Partial<Profile>) => void
  onMatch: () => void
  onSinglePlayer: () => void
  onCodex: () => void
  offline?: boolean
}

export default function MainMenu({
  settings,
  onChangeSettings,
  profile,
  onChangeProfile,
  onMatch,
  onSinglePlayer,
  onCodex,
  offline,
}: Props) {
  const [showSettings, setShowSettings] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showAvatars, setShowAvatars] = useState(false)
  const [exited, setExited] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  function handleExit() {
    // 先让本地服务进程退出，再关窗口。
    // 浏览器安全限制：脚本只能关闭由脚本打开的窗口，所以关闭可能失败，失败时显示兜底遮罩。
    // 开发服务器（vite）通过代理转发该接口，转发不到就忽略。
    try {
      void fetch('/__shutdown', { method: 'POST', keepalive: true }).catch(() => {})
    } catch {
      /* 忽略 */
    }
    window.close()
    window.setTimeout(() => setExited(true), 320)
  }

  return (
    <div className="menu">
      <div className="menu__bg" aria-hidden="true" />
      <div className="menu__scrim" aria-hidden="true" />

      <div className="account">
        <button
          type="button"
          className="account__avatar"
          onClick={() => setShowAvatars(true)}
          aria-label="更换头像"
        >
          {profile.avatar || '🙂'}
        </button>
        <input
          className="account__name"
          value={profile.name}
          maxLength={10}
          placeholder="你的名字"
          aria-label="昵称"
          onChange={(e) => onChangeProfile({ name: e.target.value.slice(0, 10) })}
        />
      </div>

      <header className="menu__header">
        <h1 className="menu__title">
          <span className="menu__title-text">牌 局</span>
          <span className="menu__title-rule" />
        </h1>
      </header>

      <div className="menu__spacer" />

      <nav className="menu__actions" aria-label="主菜单">
        <button
          type="button"
          className="menu-btn menu-btn--primary"
          onClick={() => {
            if (offline) {
              setNotice('单机版不支持联机匹配，请使用单人模式')
              return
            }
            onMatch()
          }}
        >
          匹配游戏
        </button>
        <button type="button" className="menu-btn" onClick={onSinglePlayer}>
          单人模式
        </button>
        <button type="button" className="menu-btn" onClick={onCodex}>
          卡牌图鉴
        </button>
        <button type="button" className="menu-btn" onClick={() => setShowRules(true)}>
          规则书
        </button>
        <button type="button" className="menu-btn" onClick={() => setShowSettings(true)}>
          设置
        </button>
        <button type="button" className="menu-btn menu-btn--danger" onClick={handleExit}>
          退出游戏
        </button>
      </nav>

      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={onChangeSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showRules && <RulesBook onClose={() => setShowRules(false)} />}

      {showAvatars && (
        <div className="avatarpop" onClick={() => setShowAvatars(false)}>
          <div className="avatarpop__panel" onClick={(e) => e.stopPropagation()}>
            <p className="avatarpop__title">选择头像</p>
            <div className="avatarpop__grid">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`avatarpop__opt${emoji === profile.avatar ? ' avatarpop__opt--on' : ''}`}
                  onClick={() => {
                    onChangeProfile({ avatar: emoji })
                    setShowAvatars(false)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {exited && (
        <div className="exited">
          <p className="exited__text">已退出游戏</p>
          <p className="exited__hint">当前窗口无法自动关闭，请手动关闭</p>
        </div>
      )}
    </div>
  )
}
