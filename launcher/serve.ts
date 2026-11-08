// @ts-nocheck
// 本地游戏服务：静态资源 + 匹配队列 + 对局会话 + 退出接口
// 用 bun 直接运行，类型交给运行时校验，故关闭 TS 检查

import { join, normalize, sep } from 'node:path'
import { networkInterfaces } from 'node:os'
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
  removePlayer,
  replaceAccessory,
  replaceField,
  switchActive,
  viewFor,
} from './game'

const distRoot = normalize(join(import.meta.dir, '..', 'dist'))
// 云平台（Render/Railway 等）会注入 PORT；本地仍默认 4173
const port = Number(process.env.PORT ?? process.env.GAME_PORT ?? 4173)

const MAX_PLAYERS = 4
const MIN_PLAYERS = 2
// 凑不满 4 人时，从第 2 人进队起等待多久就开局
const QUEUE_GRACE_MS = 6000

let nameSeq = 0

/** id -> 客户端 */
const clients = new Map()
/** 网段 key -> 该网段凑齐所需人数后的截止时间 */
const deadlines = new Map()
/** roomId -> 对局 */
const games = new Map()

function send(client, message) {
  try {
    client.ws.send(JSON.stringify(message))
  } catch {
    // 连接已断，交给 close 回调清理
  }
}

function toast(client, message) {
  send(client, { t: 'toast', message })
}

/**
 * 按网段分组，近似“附近”：
 * - IPv4 取前三段，同一 /24 视为同一网络
 * - IPv6 取前四组，同一 /64
 * - ::ffff:192.168.1.5 这类映射地址先还原成 IPv4
 */
function subnetKey(ip) {
  if (!ip) return 'unknown'
  const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/)
  const addr = mapped ? mapped[1] : ip

  if (addr.includes('.')) {
    const parts = addr.split('.')
    if (parts.length === 4) return parts.slice(0, 3).join('.')
    return addr
  }

  return addr.split(':').slice(0, 4).join(':')
}

function queuedClientsOf(key) {
  const list = []
  for (const c of clients.values()) {
    if (c.queued && c.key === key) list.push(c)
  }
  return list
}

function broadcastQueue(key) {
  const list = queuedClientsOf(key)
  for (const c of list) {
    send(c, { t: 'queueing', size: list.length, max: MAX_PLAYERS })
  }
}

function broadcastGame(game) {
  for (const p of game.players) {
    const client = clients.get(p.id)
    if (!client) continue
    const view = viewFor(game, p.id)
    if (view) send(client, { t: 'state', view })
  }
}

/** 玩家在队列 / 单人开局时带上自己的昵称和头像 */
function applyProfile(client, msg) {
  if (typeof msg.name === 'string') {
    const name = msg.name.trim().slice(0, 10)
    if (name) client.name = name
  }
  if (typeof msg.avatar === 'string') {
    client.avatar = msg.avatar.slice(0, 8)
  }
}

function formRoom(members) {
  const roomId = String(100000 + Math.floor(Math.random() * 900000))
  const game = createGame(
    roomId,
    members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar ?? null })),
  )

  for (const m of members) {
    m.queued = false
    m.roomId = roomId
    send(m, {
      t: 'matched',
      roomId,
      players: game.players.map((p) => ({ id: p.id, name: p.name })),
      selfId: m.id,
    })
  }

  game.notify = () => broadcastGame(game)
  games.set(roomId, game)
  console.log(`[match] 房间 ${roomId} 成立: ${members.map((m) => m.name).join('、')}`)
  broadcastGame(game)
}

function startSoloGame(client, stageId) {
  if (client.roomId) return
  if (!client.name) client.name = `玩家${++nameSeq}`

  const roomId = `S${Math.floor(1000 + Math.random() * 9000)}`
  const game = createGame(
    roomId,
    [{ id: client.id, name: client.name, avatar: client.avatar ?? null }],
    { ai: true, stageId },
  )
  game.notify = () => broadcastGame(game)

  games.set(roomId, game)
  client.roomId = roomId
  console.log(`[solo] ${client.name} 开始单人局 ${roomId}`)
  broadcastGame(game)
}

function matchTick() {
  const now = Date.now()
  const groups = new Map()

  for (const c of clients.values()) {
    if (!c.queued) continue
    if (!groups.has(c.key)) groups.set(c.key, [])
    groups.get(c.key).push(c)
  }

  for (const [key, list] of groups) {
    list.sort((a, b) => a.since - b.since)

    if (list.length >= MAX_PLAYERS) {
      formRoom(list.slice(0, MAX_PLAYERS))
      deadlines.delete(key)
      broadcastQueue(key)
      continue
    }

    if (list.length >= MIN_PLAYERS) {
      if (!deadlines.has(key)) {
        deadlines.set(key, now + QUEUE_GRACE_MS)
      }
      if (now >= deadlines.get(key)) {
        formRoom(list.slice(0, MAX_PLAYERS))
        deadlines.delete(key)
        broadcastQueue(key)
      }
    } else {
      deadlines.delete(key)
    }
  }
}

const timer = setInterval(matchTick, 500)

const server = Bun.serve({
  port,
  // 0.0.0.0 才能让同网段的手机访问到
  hostname: '0.0.0.0',

  async fetch(request, srv) {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname)

    // ---- 匹配 / 对局 WebSocket ----
    if (rel === '/ws') {
      const id = crypto.randomUUID()
      const ip = srv.requestIP(request)?.address ?? ''
      const upgraded = srv.upgrade(request, { data: { id, ip } })
      if (upgraded) return
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // ---- 退出游戏：页面调用此接口终止本进程 ----
    if (rel === '/__shutdown') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 })
      }
      const origin = request.headers.get('origin')
      if (
        origin &&
        !origin.startsWith('http://127.0.0.1:') &&
        !origin.startsWith('http://localhost:')
      ) {
        return new Response('Forbidden', { status: 403 })
      }
      setTimeout(() => process.exit(0), 100)
      return new Response('bye')
    }

    // ---- 静态资源 ----
    if (rel.endsWith('/')) rel += 'index.html'
    const full = normalize(join(distRoot, rel))

    // 防止 ../ 越权读取 dist 之外的文件
    if (full !== distRoot && !full.startsWith(distRoot + sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    const file = Bun.file(full)
    if (await file.exists()) return new Response(file)

    // 单页应用回退
    return new Response(Bun.file(join(distRoot, 'index.html')))
  },

  websocket: {
    open(ws) {
      const { id, ip } = ws.data
      const client = {
        id,
        ws,
        key: subnetKey(ip),
        name: '',
        queued: false,
        since: 0,
        roomId: null,
      }
      clients.set(id, client)
      send(client, { t: 'hello', id })
    },

    message(ws, raw) {
      const client = clients.get(ws.data.id)
      if (!client) return

      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }

      // ---- 匹配 ----
      if (msg.t === 'queue') {
        if (client.queued || client.roomId) return
        applyProfile(client, msg)
        if (!client.name) client.name = `玩家${++nameSeq}`
        client.queued = true
        client.since = Date.now()
        broadcastQueue(client.key)
        return
      }

      if (msg.t === 'cancel') {
        client.queued = false
        broadcastQueue(client.key)
        return
      }

      if (msg.t === 'solo') {
        applyProfile(client, msg)
        startSoloGame(client, typeof msg.stageId === 'string' ? msg.stageId : undefined)
        return
      }

      // ---- 对局内操作 ----
      const game = client.roomId ? games.get(client.roomId) : null
      if (!game) {
        if (msg.t === 'leave') send(client, { t: 'left' })
        return
      }

      let result = { ok: true }

      if (msg.t === 'pick') {
        result = pickCharacter(game, client.id, String(msg.characterId))
        if (result.ok) {
          // 全员选完后引擎会切到选前台阶段
          broadcastGame(game)
        }
      } else if (msg.t === 'pickActive') {
        result = chooseActive(game, client.id, Number(msg.index))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'chooseActiveInGame') {
        result = chooseActiveInGame(game, client.id, Number(msg.index))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'playCard') {
        result = playCard(
          game,
          client.id,
          String(msg.cardId),
          msg.targetPlayerId ? String(msg.targetPlayerId) : undefined,
          msg.targetCharacterId ? String(msg.targetCharacterId) : undefined,
        )
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'discard') {
        result = discardCard(game, client.id, String(msg.cardId))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'switchActive') {
        result = switchActive(game, client.id, Number(msg.index))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'replaceField') {
        result = replaceField(game, client.id, String(msg.fieldCardId))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'replaceAccessory') {
        result = replaceAccessory(game, client.id, String(msg.cardId))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'chooseAllyTarget') {
        result = chooseAllyTarget(game, client.id, String(msg.characterId))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'chooseSharkTarget') {
        result = chooseSharkTarget(game, client.id, String(msg.targetPlayerId))
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'endAction') {
        result = endAction(game, client.id)
        if (result.ok) broadcastGame(game)
      } else if (msg.t === 'leave') {
        removePlayer(game, client.id)
        client.roomId = null
        send(client, { t: 'left' })
        broadcastGame(game)
        return
      } else {
        return
      }

      if (!result.ok) toast(client, result.message)
    },

    close(ws) {
      const client = clients.get(ws.data.id)
      if (!client) return

      clients.delete(client.id)
      if (client.queued) broadcastQueue(client.key)

      if (client.roomId) {
        const game = games.get(client.roomId)
        if (game) {
          removePlayer(game, client.id)
          broadcastGame(game)
        }
        client.roomId = null
      }
    },
  },
})

function lanAddresses() {
  const out = []
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address)
    }
  }
  return out
}

console.log(`牌局服务已启动  本机: http://127.0.0.1:${server.port}`)
for (const ip of lanAddresses()) {
  console.log(`              同网段设备访问: http://${ip}:${server.port}`)
}

process.on('SIGINT', () => {
  clearInterval(timer)
  process.exit(0)
})
