import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, GameView, ServerMessage } from '../../shared/types'
import { loadProfile } from './profile'

export type QueueState = { size: number; max: number } | null

export type GameSocket = {
  connected: boolean
  error: string | null
  queue: QueueState
  game: GameView | null
  toast: string | null
  joinQueue: () => void
  leaveQueue: () => void
  startSolo: (stageId?: string) => void
  pick: (characterId: string) => void
  pickActive: (index: number) => void
  chooseActiveInGame: (index: number) => void
  playCard: (cardId: string, targetPlayerId?: string, targetCharacterId?: string) => void
  discard: (cardId: string) => void
  switchActive: (index: number) => void
  replaceField: (fieldCardId: string) => void
  replaceAccessory: (cardId: string) => void
  chooseAllyTarget: (characterId: string) => void
  chooseSharkTarget: (targetPlayerId: string) => void
  endAction: () => void
  leaveGame: () => void
  dismissToast: () => void
}

export function useGameSocket(enabled = true): GameSocket {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueState>(null)
  const [game, setGame] = useState<GameView | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  // 连接建立前发出的消息先缓存，连上后补发
  const pendingRef = useRef<ClientMessage[]>([])

  useEffect(() => {
    if (!enabled) return

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket

    try {
      ws = new WebSocket(`${protocol}://${location.host}/ws`)
    } catch {
      setError('无法建立连接')
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      const pending = pendingRef.current
      pendingRef.current = []
      for (const message of pending) {
        ws.send(JSON.stringify(message))
      }
    }
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setError('无法连接游戏服务')

    ws.onmessage = (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        return
      }

      switch (msg.t) {
        case 'queueing':
          setQueue({ size: msg.size, max: msg.max })
          break
        case 'left':
          setGame(null)
          setQueue(null)
          break
        case 'state':
          setGame(msg.view)
          setQueue(null)
          break
        case 'toast':
          setToast(msg.message)
          break
        case 'error':
          setError(msg.message)
          break
        default:
          break
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [enabled])

  // 提示自动消失
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const send = useCallback((message: ClientMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    } else {
      pendingRef.current.push(message)
    }
  }, [])

  return {
    connected,
    error,
    queue,
    game,
    toast,
    joinQueue: useCallback(() => {
      const p = loadProfile()
      send({ t: 'queue', name: p.name || undefined, avatar: p.avatar || undefined })
    }, [send]),
    leaveQueue: useCallback(() => send({ t: 'cancel' }), [send]),
    startSolo: useCallback(
      (stageId?: string) => {
        const p = loadProfile()
        send({
          t: 'solo',
          name: p.name || undefined,
          avatar: p.avatar || undefined,
          stageId,
        })
      },
      [send],
    ),
    pick: useCallback((id: string) => send({ t: 'pick', characterId: id }), [send]),
    pickActive: useCallback((index: number) => send({ t: 'pickActive', index }), [send]),
    chooseActiveInGame: useCallback(
      (index: number) => send({ t: 'chooseActiveInGame', index }),
      [send],
    ),
    playCard: useCallback(
      (id: string, targetPlayerId?: string, targetCharacterId?: string) =>
        send({ t: 'playCard', cardId: id, targetPlayerId, targetCharacterId }),
      [send],
    ),
    discard: useCallback((id: string) => send({ t: 'discard', cardId: id }), [send]),
    switchActive: useCallback((index: number) => send({ t: 'switchActive', index }), [send]),
    replaceField: useCallback(
      (fieldCardId: string) => send({ t: 'replaceField', fieldCardId }),
      [send],
    ),
    replaceAccessory: useCallback(
      (cardId: string) => send({ t: 'replaceAccessory', cardId }),
      [send],
    ),
    chooseAllyTarget: useCallback(
      (characterId: string) => send({ t: 'chooseAllyTarget', characterId }),
      [send],
    ),
    chooseSharkTarget: useCallback(
      (targetPlayerId: string) => send({ t: 'chooseSharkTarget', targetPlayerId }),
      [send],
    ),
    endAction: useCallback(() => send({ t: 'endAction' }), [send]),
    leaveGame: useCallback(() => send({ t: 'leave' }), [send]),
    dismissToast: useCallback(() => setToast(null), []),
  }
}
