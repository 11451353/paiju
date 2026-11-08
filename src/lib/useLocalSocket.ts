import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameView } from '../../shared/types'
import {
  chooseActive,
  chooseActiveInGame,
  chooseAllyTarget,
  chooseSharkTarget,
  createGame,
  discardCard,
  endAction,
  pickCharacter,
  playCard,
  replaceAccessory,
  replaceField,
  switchActive,
  viewFor,
  type ActionResult,
  type Game,
} from '../../launcher/game'
import type { GameSocket } from './useGameSocket'
import { loadProfile } from './profile'

const HUMAN_ID = 'local-player'

/**
 * 单机版传输层：直接在同一页面里运行对局引擎，不需要服务端。
 * 与 useGameSocket 返回同样的接口，页面组件不用区分来源。
 */
export function useLocalSocket(enabled: boolean): GameSocket {
  const [game, setGame] = useState<GameView | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const gameRef = useRef<Game | null>(null)

  const publish = useCallback(() => {
    const current = gameRef.current
    if (!current) return
    const view = viewFor(current, HUMAN_ID)
    if (!view) return
    // 深拷贝，避免 React 拿到被引擎后续就地修改的引用
    setGame(structuredClone(view))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const act = useCallback(
    (fn: (g: Game) => ActionResult) => {
      const current = gameRef.current
      if (!current) return
      let result: ActionResult
      try {
        result = fn(current)
      } catch (err) {
        // 引擎异常时也要同步一次状态，避免界面与引擎脱节后卡死
        console.error(err)
        publish()
        setToast('操作失败，请重试')
        return
      }
      if (!result.ok) {
        setToast(result.message)
        return
      }
      publish()
    },
    [publish],
  )

  const startSolo = useCallback((stageId?: string) => {
    const profile = loadProfile()
    const next = createGame(
      'LOCAL',
      [{ id: HUMAN_ID, name: profile.name || '你', avatar: profile.avatar || null }],
      { ai: true, stageId },
    )
    next.notify = () => publish()
    gameRef.current = next
    publish()
  }, [publish])

  const leaveGame = useCallback(() => {
    const current = gameRef.current
    if (current) current.notify = null
    gameRef.current = null
    setGame(null)
  }, [])

  const offlineOnly = useCallback(() => {
    setToast('单机版不支持联机，请使用单人模式')
  }, [])

  if (!enabled) {
    // 非单机构建下不启用本地引擎，返回占位实现
    return {
      connected: false,
      error: null,
      queue: null,
      game: null,
      toast: null,
      joinQueue: () => {},
      leaveQueue: () => {},
      startSolo: () => {},
      pick: () => {},
      pickActive: () => {},
      chooseActiveInGame: () => {},
      playCard: () => {},
      discard: () => {},
      switchActive: () => {},
      replaceField: () => {},
      replaceAccessory: () => {},
      chooseAllyTarget: () => {},
      chooseSharkTarget: () => {},
      endAction: () => {},
      leaveGame: () => {},
      dismissToast: () => {},
    }
  }

  return {
    connected: true,
    error: null,
    queue: null,
    game,
    toast,
    joinQueue: offlineOnly,
    leaveQueue: offlineOnly,
    startSolo,
    pick: (id: string) => act((g) => pickCharacter(g, HUMAN_ID, id)),
    pickActive: (index: number) => act((g) => chooseActive(g, HUMAN_ID, index)),
    chooseActiveInGame: (index: number) =>
      act((g) => chooseActiveInGame(g, HUMAN_ID, index)),
    playCard: (id: string, targetPlayerId?: string, targetCharacterId?: string) =>
      act((g) => playCard(g, HUMAN_ID, id, targetPlayerId, targetCharacterId)),
    discard: (id: string) => act((g) => discardCard(g, HUMAN_ID, id)),
    switchActive: (index: number) => act((g) => switchActive(g, HUMAN_ID, index)),
    replaceField: (fieldCardId: string) =>
      act((g) => replaceField(g, HUMAN_ID, fieldCardId)),
    replaceAccessory: (cardId: string) =>
      act((g) => replaceAccessory(g, HUMAN_ID, cardId)),
    chooseAllyTarget: (characterId: string) =>
      act((g) => chooseAllyTarget(g, HUMAN_ID, characterId)),
    chooseSharkTarget: (targetPlayerId: string) =>
      act((g) => chooseSharkTarget(g, HUMAN_ID, targetPlayerId)),
    endAction: () => act((g) => endAction(g, HUMAN_ID)),
    leaveGame,
    dismissToast: () => setToast(null),
  }
}
