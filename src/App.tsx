import { useCallback, useEffect, useState } from 'react'
import MainMenu from './pages/MainMenu'
import Matchmaking from './pages/Matchmaking'
import GameTable from './pages/GameTable'
import Codex from './pages/Codex'
import StageSelect from './pages/StageSelect'
import { applyFontScale, loadSettings, saveSettings, type Settings } from './lib/settings'
import { loadProfile, saveProfile, type Profile } from './lib/profile'
import { useGameSocket } from './lib/useGameSocket'
import { useLocalSocket } from './lib/useLocalSocket'

/** 单文件离线版：对局引擎直接跑在浏览器里，没有服务端 */
const OFFLINE = import.meta.env.VITE_OFFLINE === '1'

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [matching, setMatching] = useState(false)
  const [codexOpen, setCodexOpen] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)

  const remote = useGameSocket(!OFFLINE)
  const local = useLocalSocket(OFFLINE)
  const sock = OFFLINE ? local : remote

  useEffect(() => {
    applyFontScale(settings.fontScale)
  }, [settings.fontScale])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch }
      saveProfile(next)
      return next
    })
  }, [])

  if (sock.game) {
    return <GameTable view={sock.game} sock={sock} />
  }

  if (matching && !OFFLINE) {
    return <Matchmaking sock={sock} onBack={() => setMatching(false)} />
  }

  if (codexOpen) {
    return <Codex onBack={() => setCodexOpen(false)} />
  }

  if (stageOpen) {
    return (
      <StageSelect
        onBack={() => setStageOpen(false)}
        onSelect={(stageId) => {
          setStageOpen(false)
          sock.startSolo(stageId)
        }}
      />
    )
  }

  return (
    <MainMenu
      settings={settings}
      onChangeSettings={updateSettings}
      profile={profile}
      onChangeProfile={updateProfile}
      onMatch={() => setMatching(true)}
      onSinglePlayer={() => setStageOpen(true)}
      onCodex={() => setCodexOpen(true)}
      offline={OFFLINE}
    />
  )
}
