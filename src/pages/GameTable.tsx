import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CardInfo, CharacterView, GameView, PlayerPublic } from '../../shared/types'
import {
  ActionPoints,
  CardBack,
  CharacterCard,
  HandCard,
  PlayerBadge,
  SummonIcon,
  TrashIcon,
} from '../components/game/pieces'
import { InfoPanel, type InfoTarget, type PanelAction } from '../components/game/InfoPanel'
import { EffectIcon } from '../components/game/EffectIcon'
import { CardFace } from '../components/game/CardFace'
import type { GameSocket } from '../lib/useGameSocket'
import { CHARACTER_ART } from '../lib/characterArt'
import { cardArtUrl } from '../lib/cardArt'

const CHARACTERS_PER_PLAYER = 3
const BLANK_CARD_COST = 1
/** 伤害数字的停留时长，与 CSS 中的飘字动画保持一致 */
const HURT_MS = 900

type Props = {
  view: GameView
  sock: GameSocket
}

export default function GameTable({ view, sock }: Props) {
  if (view.phase === 'picking') return <PickScreen view={view} sock={sock} />
  if (view.phase === 'activeSelect') return <ActivePickScreen view={view} sock={sock} />
  return <Board view={view} sock={sock} />
}

/* ---------------- 选择角色 ---------------- */

function PickScreen({ view, sock }: Props) {
  const mine = view.you.picked

  return (
    <div className="setup">
      <div className="setup__panel">
        <h2 className="setup__title">选择角色</h2>
        <p className="setup__sub">
          已选 {mine.length} / {CHARACTERS_PER_PLAYER}，同一角色不可被多名玩家选择
        </p>

        <div className="setup__grid">
          {(view.pool ?? []).map((entry) => {
            const selected = mine.includes(entry.id)
            const taken = Boolean(entry.takenByName)
            return (
              <button
                key={entry.id}
                type="button"
                className={`pickcard${selected ? ' pickcard--mine' : ''}${taken ? ' pickcard--taken' : ''}`}
                disabled={taken}
                onClick={() => sock.pick(entry.id)}
              >
                {entry.artId && CHARACTER_ART[entry.artId] && (
                  <span
                    className="pickcard__art"
                    style={{ backgroundImage: `url("${CHARACTER_ART[entry.artId]}")` }}
                    aria-hidden="true"
                  />
                )}
                <span className="pickcard__name">{entry.name}</span>
                <span className="pickcard__hp">生命 {entry.hp}</span>
                {taken && <span className="pickcard__owner">被 {entry.takenByName} 选择</span>}
                {selected && <span className="pickcard__check">已选</span>}
              </button>
            )
          })}
        </div>

        <p className="setup__others">
          {view.others.map((o) => `${o.name} ${o.pickedCount}/${CHARACTERS_PER_PLAYER}`).join(' · ')}
        </p>
      </div>
    </div>
  )
}

/* ---------------- 选择前台 ---------------- */

function ActivePickScreen({ view, sock }: Props) {
  return (
    <div className="setup">
      <div className="setup__panel">
        <h2 className="setup__title">选择前台角色</h2>
        <p className="setup__sub">开局指定一名前台，其余角色位于后台</p>

        <div className="setup__grid setup__grid--chars">
          {view.you.characters.map((c, index) => (
            <button
              key={c.id}
              type="button"
              className="pickcard"
              onClick={() => sock.pickActive(index)}
            >
              <span className="pickcard__name">{c.name}</span>
              <span className="pickcard__hp">
                生命 {c.hp}/{c.maxHp}
              </span>
            </button>
          ))}
        </div>

        <p className="setup__others">
          {view.others.map((o) => `${o.name} ${o.activeChosen ? '已选择' : '选择中'}`).join(' · ')}
        </p>
      </div>
    </div>
  )
}

/* ---------------- 牌桌 ---------------- */

type SeatPos = 'top' | 'left' | 'right'

function layoutSeats(view: GameView): { player: PlayerPublic; pos: SeatPos }[] {
  const total = view.others.length + 1
  const mySeat = view.you.seat

  const ordered = [...view.others].sort(
    (a, b) => ((a.seat - mySeat + total) % total) - ((b.seat - mySeat + total) % total),
  )

  const positions: SeatPos[] =
    ordered.length === 1
      ? ['top']
      : ordered.length === 2
        ? ['left', 'right']
        : ['left', 'top', 'right']

  return ordered.map((player, i) => ({ player, pos: positions[i] }))
}

/** 已装备的场地牌与配饰牌：场地在上，配饰在下。onPick 存在时，每张牌上出现红叉，点击即弃置 */
function GearStrip({
  fields,
  accessories,
  onPickField,
  onPickAccessory,
  onOpen,
}: {
  fields: CardInfo[]
  accessories: CardInfo[]
  onPickField?: (cardId: string) => void
  onPickAccessory?: (cardId: string) => void
  onOpen?: (card: CardInfo) => void
}) {
  if (fields.length === 0 && accessories.length === 0) return null

  const renderCard = (card: CardInfo, onPick?: (cardId: string) => void) => (
    <div
      key={card.id}
      className={`fieldcard${onOpen ? ' fieldcard--clickable' : ''}`}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(card) : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(card)
              }
            }
          : undefined
      }
    >
      <CardFace
        cost={card.cost}
        artUrl={cardArtUrl(card.artId)}
        fallback={<span className="fieldcard__name">{card.name}</span>}
      />
      {onPick && (
        <button
          type="button"
          className="fieldcard__x"
          onClick={(e) => {
            e.stopPropagation()
            onPick(card.id)
          }}
          aria-label={`弃置 ${card.name}`}
        >
          ×
        </button>
      )}
      {(card.charges ?? 0) > 0 && (
        <span className="fieldcard__charge" aria-label={`充能 ${card.charges}`}>
          {card.charges}
        </span>
      )}
    </div>
  )

  return (
    <div className="gears">
      {fields.length > 0 && (
        <div className="fields">{fields.map((card) => renderCard(card, onPickField))}</div>
      )}
      {accessories.length > 0 && (
        <div className="fields fields--accessory">
          {accessories.map((card) => renderCard(card, onPickAccessory))}
        </div>
      )}
    </div>
  )
}

/* ---------------- 多人局的目标分区 ---------------- */

type Sector = 'left' | 'right' | 'top'
type SectorMode = 'split' | 'tri'

/** 分区多边形，坐标按出牌框宽高的 0-1 归一化 */
function sectorPolygons(mode: SectorMode): Record<Sector, [number, number][]> {
  if (mode === 'split') {
    return {
      left: [
        [0, 0],
        [0.5, 0],
        [0.5, 1],
        [0, 1],
      ],
      right: [
        [0.5, 0],
        [1, 0],
        [1, 1],
        [0.5, 1],
      ],
      top: [],
    }
  }
  return {
    top: [
      [0.5, 0.5],
      [0, 0],
      [1, 0],
    ],
    left: [
      [0.5, 0.5],
      [0, 0],
      [0, 1],
      [0.5, 1],
    ],
    right: [
      [0.5, 0.5],
      [1, 0],
      [1, 1],
      [0.5, 1],
    ],
  }
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** 落点所在的分区；判定与绘制使用同一套多边形，保证所见即所得 */
function sectorAt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  mode: SectorMode,
): Sector | null {
  const nx = (clientX - rect.left) / rect.width
  const ny = (clientY - rect.top) / rect.height
  const polygons = sectorPolygons(mode)

  for (const key of ['top', 'left', 'right'] as Sector[]) {
    const poly = polygons[key]
    if (poly.length > 0 && pointInPolygon(nx, ny, poly)) return key
  }
  return null
}

function SectorOverlay({ mode, active }: { mode: SectorMode; active: Sector | null }) {
  const polygons = sectorPolygons(mode)
  const lines: [number, number, number, number][] =
    mode === 'split'
      ? [[0.5, 0, 0.5, 1]]
      : [
          [0.5, 0.5, 0, 0],
          [0.5, 0.5, 1, 0],
          [0.5, 0.5, 0.5, 1],
        ]

  return (
    <svg className="sector" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {active && polygons[active].length > 0 && (
        <polygon
          points={polygons[active].map(([x, y]) => `${x},${y}`).join(' ')}
          fill="rgba(22, 90, 160, 0.12)"
        />
      )}
      {lines.map(([x1, y1, x2, y2], index) => (
        <line
          key={index}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#16181c"
          strokeWidth={2}
          strokeDasharray="6 5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

type DragState = {
  cardId: string
  x: number
  y: number
  startX: number
  startY: number
  moved: boolean
  /** 当前是否允许出牌；false 时拖动只用于区分「点开查看」和「拖动」 */
  playable: boolean
}

function insideRect(
  x: number,
  y: number,
  rect: { left: number; right: number; top: number; bottom: number } | undefined,
) {
  if (!rect) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function Board({ view, sock }: Props) {
  const [info, setInfo] = useState<InfoTarget | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragSector, setDragSector] = useState<Sector | null>(null)
  /** 盗罐行者关卡：等待选择本次攻击的敌方目标角色 */
  const [attackPick, setAttackPick] = useState<CardInfo | null>(null)
  const [mechanicOpen, setMechanicOpen] = useState(false)

  const playRef = useRef<HTMLDivElement | null>(null)
  const trashRef = useRef<HTMLDivElement | null>(null)
  const handRef = useRef<HTMLDivElement | null>(null)
  /** 手牌过多时，每张牌向右叠压的像素数；保证最右侧的牌也能点到 */
  const [handOverlap, setHandOverlap] = useState(0)

  // ---- 伤害 / 治疗 / 护盾动画 ----
  // 服务端只同步状态，这些数字由前后两次状态的差值推出来
  const prevStatRef = useRef<Map<string, { hp: number; shield: number }>>(new Map())
  const hurtTimerRef = useRef<number | null>(null)
  const [hurts, setHurts] = useState<Map<string, { id: number; amount: number }>>(new Map())
  const [boosts, setBoosts] = useState<
    Map<string, { heal?: { id: number; amount: number }; shield?: { id: number; amount: number } }>
  >(new Map())

  // ---- 出牌冷却 ----
  // 用计数而不是布尔，避免多个计时器互相覆盖
  const lockCountRef = useRef(0)
  const [busy, setBusy] = useState(false)

  const lockFor = useCallback((ms: number) => {
    lockCountRef.current += 1
    setBusy(true)
    window.setTimeout(() => {
      lockCountRef.current = Math.max(0, lockCountRef.current - 1)
      if (lockCountRef.current === 0) setBusy(false)
    }, ms)
  }, [])

  // 手牌超出可用宽度时逐张叠压，全部留在可视范围内；窄屏改为换行显示
  useLayoutEffect(() => {
    const el = handRef.current
    if (!el) return

    const compute = () => {
      const cards = el.querySelectorAll<HTMLElement>('.handcard')
      const count = cards.length
      if (count < 2 || window.matchMedia('(max-width: 520px)').matches) {
        setHandOverlap(0)
        return
      }

      const style = getComputedStyle(el)
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const gap = parseFloat(style.columnGap) || 0
      const cardWidth = cards[0].getBoundingClientRect().width
      const available = el.clientWidth - padding
      const natural = count * cardWidth + (count - 1) * gap
      if (natural <= available) {
        setHandOverlap(0)
        return
      }

      const needed = Math.ceil((natural - available) / (count - 1))
      // 至少给每张牌留 26px 的可点区域
      setHandOverlap(Math.min(needed, Math.max(0, Math.floor(cardWidth - 26))))
    }

    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view.you.hand.length])

  const allCharacters = useMemo(
    () => [...view.you.characters, ...view.others.flatMap((o) => o.characters)],
    [view],
  )

  useEffect(() => {
    const previous = prevStatRef.current
    const next = new Map<string, { hp: number; shield: number }>()
    const hurtEvents = new Map<string, { id: number; amount: number }>()
    const boostEvents = new Map<
      string,
      { heal?: { id: number; amount: number }; shield?: { id: number; amount: number } }
    >()

    for (const character of allCharacters) {
      next.set(character.id, { hp: character.hp, shield: character.shield })
      const before = previous.get(character.id)
      if (!before) continue

      if (character.hp < before.hp) {
        hurtEvents.set(character.id, {
          id: Date.now() + character.hp,
          amount: before.hp - character.hp,
        })
      } else if (character.hp > before.hp) {
        boostEvents.set(character.id, {
          heal: { id: Date.now() + character.hp, amount: character.hp - before.hp },
        })
      }

      if (character.shield > before.shield) {
        const entry = boostEvents.get(character.id) ?? {}
        entry.shield = {
          id: Date.now() + character.shield + 1000,
          amount: character.shield - before.shield,
        }
        boostEvents.set(character.id, entry)
      }
    }
    prevStatRef.current = next

    if (hurtEvents.size === 0 && boostEvents.size === 0) return

    if (hurtEvents.size > 0) {
      setHurts(hurtEvents)
      lockFor(HURT_MS)
    }
    if (boostEvents.size > 0) setBoosts(boostEvents)

    if (hurtTimerRef.current) window.clearTimeout(hurtTimerRef.current)
    hurtTimerRef.current = window.setTimeout(() => {
      setHurts(new Map())
      setBoosts(new Map())
    }, HURT_MS)
  }, [allCharacters, lockFor])

  const seats = useMemo(() => layoutSeats(view), [view])
  const isMyAction = view.phase === 'action' && view.currentSeat === view.you.seat

  // 轮到我方行动时关掉上一轮残留的信息面板，避免它挡住「结束行动」按钮
  useEffect(() => {
    if (isMyAction) setInfo(null)
  }, [isMyAction])

  // 技能牌的消耗取当前前台角色的技能定义；其他手牌取牌面自带数值
  const activeCharacter = view.you.characters[view.you.activeIndex]
  function cardInfo(card: CardInfo): { cost: number; damage: number; description: string } {
    if (card.kind === 'normal' || card.kind === 'skill' || card.kind === 'burst') {
      const def = activeCharacter?.skillSet?.[card.kind]
      let cost = def?.cost ?? 0
      let damage = def?.damage ?? 0

      // OP 天赋：低血量时伤害提高、大招费用降低
      if (activeCharacter?.talentId === 'op') {
        const hp = activeCharacter.hp
        if (hp <= 5) damage += 3
        else if (hp <= 10) damage += 2
        else if (hp <= 15) damage += 1
        if (card.kind === 'burst' && hp <= 10) cost = Math.max(0, cost - 1)
      }

      // 米卫兵：普攻强化
      if (
        card.kind === 'normal' &&
        activeCharacter?.effects.some((e) => e.id === 'miho' && e.stacks > 0)
      ) {
        cost = Math.max(0, cost - 1)
        damage += 2
      }

      // 凑企厄：大招永久减费
      if (
        card.kind === 'burst' &&
        activeCharacter?.id === 'char-couqie' &&
        !activeCharacter.godForm
      ) {
        cost = Math.max(0, cost - (activeCharacter.burstCostDiscount ?? 0))
      }

      // U：教鞭长度强化普攻；魔音使普攻翻倍；连续惩罚使战技 -1 费
      if (activeCharacter?.id === 'char-u' && card.kind === 'normal') {
        const seg = Math.max(
          1,
          Math.min(
            3,
            activeCharacter.effects.find((e) => e.id === 'whip-length')?.stacks ?? 1,
          ),
        )
        damage += seg >= 3 ? 6 : seg === 2 ? 3 : 0
        cost = Math.max(0, cost - (seg >= 3 ? 2 : seg === 2 ? 1 : 0))
        if (activeCharacter.effects.some((e) => e.id === 'whip-double')) damage *= 2
      }
      if (
        activeCharacter?.id === 'char-u' &&
        card.kind === 'skill' &&
        activeCharacter.uCombo
      ) {
        cost = Math.max(0, cost - 1)
      }

      // 悍匪之怒：普攻 +2、战技 +3
      if (
        activeCharacter?.id === 'char-hanfei' &&
        activeCharacter.effects.some((e) => e.id === 'hanfei-rage')
      ) {
        if (card.kind === 'normal') damage += 2
        else if (card.kind === 'skill') damage += 3
      }

      return { cost, damage, description: def?.description ?? '' }
    }
    return { cost: card.cost, damage: 0, description: card.description }
  }

  function isSkillKind(card: CardInfo): boolean {
    return card.kind === 'normal' || card.kind === 'skill' || card.kind === 'burst'
  }

  // 技能牌与普通手牌分别享受各自的场地减费
  function discountFor(card: CardInfo): number {
    return isSkillKind(card) ? view.you.skillDiscount : view.you.nonSkillDiscount
  }

  /** 这张牌打出时是否需要指定单个敌方目标 */
  function needsTargetFor(card: CardInfo): boolean {
    if (card.kind !== 'normal' && card.kind !== 'skill' && card.kind !== 'burst') {
      return false
    }
    const def = activeCharacter?.skillSet?.[card.kind]
    if (!def || (def.hitAll && !def.hitAllTarget) || def.hitAllFronts) return false
    // 己方目标技能不用拖给对手，打出后点对钩选择
    if (def.targetAlly) return false
    return Boolean(
      def.damage > 0 ||
        def.hitAllTarget ||
        def.disorderAll ||
        def.targetEffect ||
        def.targetStack ||
        def.stripBuff ||
        def.discardEquipments ||
        def.triggerEndDots ||
        def.applySon,
    )
  }

  function sectorPlayer(sector: Sector): PlayerPublic | undefined {
    return seats.find((s) => s.pos === sector)?.player
  }

  // 装备待替换、己方目标待点选时锁定其他操作
  const awaitingFieldMe = view.awaitingFieldReplace === view.you.id
  const awaitingAccessoryMe = view.awaitingAccessoryReplace === view.you.id
  const awaitingAllyMe = view.awaitingAllyTarget === view.you.id
  const awaitingSharkMe = view.awaitingSharkTarget === view.you.id
  // 复活类牌只在阵亡角色上显示对钩，护盾类只显示在后台存活角色上
  const allyTargetIsDead = view.awaitingAllyTargetKind === 'dead'
  const allyTargetIsBackline = view.awaitingAllyTargetKind === 'backline'
  const locked =
    busy || awaitingFieldMe || awaitingAccessoryMe || awaitingAllyMe || awaitingSharkMe
  const opponents = view.others.filter((o) => !o.eliminated)
  const awaitingMe = view.awaitingActive === view.you.id
  const awaitingOtherName = view.awaitingActive
    ? (view.others.find((o) => o.id === view.awaitingActive)?.name ?? '其他玩家')
    : null
  const sharkOwnerName = view.awaitingSharkTarget
    ? view.awaitingSharkTarget === view.you.id
      ? view.you.name
      : (view.others.find((o) => o.id === view.awaitingSharkTarget)?.name ?? '其他玩家')
    : null

  function handleCharacterClick(owner: PlayerPublic, character: CharacterView) {
    setInfo({ kind: 'character', character, ownerName: owner.name, ownerId: owner.id })
  }

  /** 点击已装备的场地 / 配饰牌，查看牌面详情 */
  function handleEquipClick(card: CardInfo) {
    setInfo({
      kind: 'card',
      card,
      cost: card.cost,
      damage: 0,
      description: card.description,
    })
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>, cardId: string) {
    const card = view.you.hand.find((c) => c.id === cardId)
    if (!card) return

    // 冷却或场地待替换期间不允许拖动出牌；这里不立即打开信息面板，
    // 否则在等待对手时拖牌会弹出一个持续遮挡桌面的面板。
    setDragSector(null)
    setDrag({
      cardId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      playable: isMyAction && !locked,
    })
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return
    const moved =
      drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved })

    // 多点对局拖目标牌时，实时高亮落点所在分区
    const card = view.you.hand.find((c) => c.id === drag.cardId)
    if (drag.playable && card && opponents.length > 1 && needsTargetFor(card)) {
      const rect = playRef.current?.getBoundingClientRect()
      if (rect && insideRect(e.clientX, e.clientY, rect)) {
        setDragSector(
          sectorAt(e.clientX, e.clientY, rect, opponents.length === 2 ? 'split' : 'tri'),
        )
      } else {
        setDragSector(null)
      }
    } else {
      setDragSector(null)
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return

    const card = view.you.hand.find((c) => c.id === drag.cardId)
    try {
      if (!drag.playable) {
        // 不是自己的行动：拖动不弹面板，只有原地点击才查看牌面
        if (!drag.moved && card) {
          setInfo({ kind: 'card', card, ...cardInfo(card) })
        }
        return
      }

      const overTrash = insideRect(
        e.clientX,
        e.clientY,
        trashRef.current?.getBoundingClientRect(),
      )
      const overPlay = insideRect(e.clientX, e.clientY, playRef.current?.getBoundingClientRect())

      if (overTrash && card) {
        // 弃牌换 1 点行动点
        lockFor(250)
        sock.discard(card.id)
      } else if (overPlay && card) {
        // 盗罐行者关卡：单体攻击先弹出敌方角色选择，选中的角色作为本次攻击的前台
        if (view.pickEnemyTarget && needsTargetFor(card) && opponents.length > 0) {
          setAttackPick(card)
        } else {
          const needsTarget = needsTargetFor(card) && opponents.length > 1

          if (needsTarget) {
            // 按落点所在分区决定目标，取最近的那个
            const rect = playRef.current?.getBoundingClientRect()
            const sector = rect
              ? sectorAt(e.clientX, e.clientY, rect, opponents.length === 2 ? 'split' : 'tri')
              : null
            const targetPlayer = sector ? sectorPlayer(sector) : undefined
            if (targetPlayer) {
              lockFor(250)
              sock.playCard(card.id, targetPlayer.id)
            }
          } else {
            lockFor(250)
            sock.playCard(card.id)
          }
        }
      } else if (!drag.moved && card) {
        setInfo({ kind: 'card', card, ...cardInfo(card) })
      }
    } finally {
      setDrag(null)
      setDragSector(null)
    }
  }

  // 行动阶段点开自己的后台存活角色时，可以花 1 点行动点换上场
  const infoAction: PanelAction | undefined = (() => {
    if (!info || info.kind !== 'character') return undefined
    if (!isMyAction) return undefined
    if (info.ownerId !== view.you.id) return undefined

    const index = view.you.characters.findIndex((c) => c.id === info.character.id)
    if (index < 0) return undefined

    const character = view.you.characters[index]
    if (!character.alive) return undefined
    if (index === view.you.activeIndex) return undefined

    // 公开课：本回合禁止主动切换角色
    if (view.switchBanned) {
      return {
        label: '换到前台',
        hint: '本回合禁止主动切换角色',
        disabled: true,
        onClick: () => {},
      }
    }

    return {
      label: '换到前台',
      hint: busy ? '动画播放中' : view.you.ap < 1 ? '行动点不足' : '消耗 1 点行动点',
      disabled: busy || view.you.ap < 1,
      onClick: () => {
        sock.switchActive(index)
        setInfo(null)
      },
    }
  })()

  const dragCard = drag ? view.you.hand.find((c) => c.id === drag.cardId) : null
  const leftPlayer = seats.find((s) => s.pos === 'left')?.player
  const rightPlayer = seats.find((s) => s.pos === 'right')?.player
  const lastPlay = view.lastPlay

  // 多点对局拖单体目标牌时，出牌框内显示分区
  const sectorMode: SectorMode = opponents.length === 2 ? 'split' : 'tri'
  const showSectors = Boolean(dragCard && needsTargetFor(dragCard) && opponents.length > 1)

  const label = showSectors
    ? '拖到对应分区，对离得最近的玩家释放'
    : awaitingFieldMe
      ? '点击场地牌上的红叉选择要替换掉的场地'
      : awaitingAccessoryMe
        ? '点击配饰牌上的红叉选择要替换掉的配饰'
        : awaitingAllyMe
          ? allyTargetIsDead
            ? '点击阵亡角色牌上的绿色对钩选择复活目标'
            : allyTargetIsBackline
              ? '点击后台角色牌上的绿色对钩选择护盾目标'
              : '点击我方角色牌上的绿色对钩选择目标'
          : awaitingSharkMe
            ? '选择一名敌方前台作为鲨bee的放电目标'
            : view.awaitingSharkTarget
              ? `等待 ${sharkOwnerName} 选择鲨bee的放电目标`
              : awaitingOtherName
                ? `等待 ${awaitingOtherName} 选择新的前台角色`
                : isMyAction
                  ? '拖动手牌到这里打出'
                  : '对局进行中'

  return (
    <div
      className={[
        'table',
        `table--p${seats.length + 1}`,
        isMyAction ? 'table--myaction' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {seats.map(({ player, pos }) => {
        const acting = view.phase === 'action' && view.currentSeat === player.seat
        return pos === 'top' ? (
          <div
            key={player.id}
            className={`zone zone--top${acting ? ' zone--acting' : ''}`}
          >
            <PlayerBadge
              name={player.name}
              avatar={player.avatar}
              className="badge--top"
              acting={acting}
            />
            <div className="zone__handrow">
              <ActionPoints ap={player.ap} />
              <div className="zone__backrow">
                {Array.from({ length: player.handCount }, (_, i) => (
                  <CardBack key={i} compact />
                ))}
              </div>
            </div>
            <div className="top__charsrow">
              <div className="zone__chars">
                {player.characters.map((c, i) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    active={i === player.activeIndex}
                    compact
                    hurt={hurts.get(c.id)}
                    pops={boosts.get(c.id)}
                    onClick={() => handleCharacterClick(player, c)}
                  />
                ))}
              </div>
              <GearStrip
                fields={player.fields}
                accessories={player.accessories}
                onOpen={handleEquipClick}
              />
            </div>
          </div>
        ) : (
          <div
            key={player.id}
            className={`zone zone--${pos}${acting ? ' zone--acting' : ''}`}
          >
            <div className={`zone__backcol zone__backcol--${pos}`}>
              {Array.from({ length: player.handCount }, (_, i) => (
                <CardBack key={i} compact />
              ))}
            </div>
            <div className="zone__chars zone__chars--col">
              {pos === 'left' && (
                <GearStrip
                fields={player.fields}
                accessories={player.accessories}
                onOpen={handleEquipClick}
              />
              )}
              {player.characters.map((c, i) => (
                <CharacterCard
                  key={c.id}
                  character={c}
                  active={i === player.activeIndex}
                  compact
                  hurt={hurts.get(c.id)}
                  pops={boosts.get(c.id)}
                  onClick={() => handleCharacterClick(player, c)}
                />
              ))}
              {pos === 'right' && (
                <GearStrip
                fields={player.fields}
                accessories={player.accessories}
                onOpen={handleEquipClick}
              />
              )}
            </div>
          </div>
        )
      })}

      {leftPlayer && (
        <>
          <PlayerBadge
            name={leftPlayer.name}
            avatar={leftPlayer.avatar}
            className="badge--left"
            acting={view.phase === 'action' && view.currentSeat === leftPlayer.seat}
          />
          <div className="cornerap cornerap--left">
            <ActionPoints ap={leftPlayer.ap} align="left" />
          </div>
        </>
      )}
      {rightPlayer && (
        <>
          <PlayerBadge
            name={rightPlayer.name}
            avatar={rightPlayer.avatar}
            className="badge--right"
            acting={view.phase === 'action' && view.currentSeat === rightPlayer.seat}
          />
          <div className="cornerap cornerap--right">
            <ActionPoints ap={rightPlayer.ap} align="right" />
          </div>
        </>
      )}

      <div className="playzone" ref={playRef}>
        <div className="playzone__status">
          <span>第 {view.round} 回合</span>
          <span className="playzone__sep">·</span>
          <span className="playzone__turn">
            {view.phase === 'finished'
              ? '对局结束'
              : isMyAction
                ? '你的行动'
                : `轮到 ${view.currentPlayerName ?? '—'}`}
          </span>
          <span className="playzone__sep">·</span>
          <span>牌堆 {view.deckCount}</span>
        </div>
        <span className="playzone__label">{label}</span>
        {lastPlay && lastPlay.playerId !== view.you.id && (
          <button
            type="button"
            className="lastplay"
            onClick={() => {
              const lp = lastPlay
              setInfo({
                kind: 'card',
                card: lp.card,
                cost: lp.cost,
                damage: lp.damage,
                description: lp.description,
              })
            }}
            aria-label={`查看 ${lastPlay.playerName} 打出的 ${lastPlay.card.name}`}
          >
            <span className="lastplay__who">{lastPlay.playerName} 打出</span>
            <span className="lastplay__card">
              <CardFace
                cost={lastPlay.cost}
                artUrl={cardArtUrl(lastPlay.card.artId)}
                fallback={<span className="handcard__name">{lastPlay.card.name}</span>}
              />
            </span>
          </button>
        )}
        {showSectors && <SectorOverlay mode={sectorMode} active={dragSector} />}
      </div>

      <div className={`zone zone--bottom${isMyAction ? ' zone--acting' : ''}`}>
        <div className="bottom__charsrow">
          <GearStrip
            fields={view.you.fields}
            accessories={view.you.accessories}
            onOpen={handleEquipClick}
            onPickField={awaitingFieldMe ? (id) => sock.replaceField(id) : undefined}
            onPickAccessory={
              awaitingAccessoryMe ? (id) => sock.replaceAccessory(id) : undefined
            }
          />
          <div className="zone__chars">
            {view.you.characters.map((c, i) => (
              <CharacterCard
                key={c.id}
                character={c}
                active={i === view.you.activeIndex}
                checkable={
                  awaitingAllyMe &&
                  (allyTargetIsDead
                    ? !c.alive
                    : allyTargetIsBackline
                      ? c.alive && i !== view.you.activeIndex
                      : c.alive)
                }
                hurt={hurts.get(c.id)}
                pops={boosts.get(c.id)}
                onClick={() => handleCharacterClick(view.you, c)}
                onCheck={() => sock.chooseAllyTarget(c.id)}
              />
            ))}
          </div>
        </div>
        <div className="zone__handrow">
          <div
            className="zone__hand"
            ref={handRef}
            onWheel={(e) => {
              // 桌面端手牌仍可能略微超出时，滚轮可直接横向滚动
              const el = e.currentTarget
              if (el.scrollWidth <= el.clientWidth) return
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
            }}
          >
            {view.you.hand.map((card, index) => (
              <HandCard
                key={card.id}
                card={card}
                cost={cardInfo(card).cost}
                damage={cardInfo(card).damage}
                discount={discountFor(card)}
                extra={isSkillKind(card) ? 0 : view.nonSkillTax}
                dragging={drag?.cardId === card.id}
                overlap={index === 0 ? 0 : handOverlap}
                onPointerDown={handlePointerDown}
              />
            ))}
          </div>
          <div className="zone__side">
            {view.you.buffs.length > 0 && (
              <div className="zone__buffs" aria-label="道具增益">
                {view.you.buffs.map((buff) => (
                  <EffectIcon
                    key={buff.id}
                    icon={buff.icon}
                    polarity={buff.polarity}
                    name={`${buff.name}：${buff.description}`}
                    stacks={buff.stacks}
                    unit="次"
                    size={18}
                  />
                ))}
              </div>
            )}
            <ActionPoints ap={view.you.ap} align="right" />
            {view.you.summons.length > 0 && (
              <div className="zone__summons" aria-label="召唤物">
                {view.you.summons.map((summon) => (
                  <SummonIcon
                    key={summon.id}
                    summon={summon}
                    onClick={() => setInfo({ kind: 'summon', summon })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <PlayerBadge
          name={view.you.name}
          avatar={view.you.avatar}
          className="badge--self"
          me
          acting={isMyAction}
        />
      </div>

      {isMyAction && (
        <>
          <div
            ref={trashRef}
            className={`trashbtn${drag ? ' trashbtn--active' : ''}`}
            role="presentation"
            title="拖动手牌到这里弃掉，每张 +1 行动点"
          >
            <TrashIcon />
          </div>
          <button
            type="button"
            className="endbtn"
            disabled={locked}
            onClick={sock.endAction}
          >
            结束行动
          </button>
        </>
      )}

      {drag?.playable && dragCard && (
        <div className="dragghost" style={{ left: drag.x, top: drag.y }}>
          <CardFace
            cost={cardInfo(dragCard).cost}
            discount={discountFor(dragCard)}
            artUrl={cardArtUrl(dragCard.artId)}
            fallback={
              <>
                <span className="handcard__name">{dragCard.name}</span>
                {cardInfo(dragCard).damage > 0 && (
                  <span className="handcard__damage">{cardInfo(dragCard).damage}</span>
                )}
              </>
            }
          />
        </div>
      )}

      {awaitingMe && (
        <div className="choose">
          <div className="choose__panel">
            <p className="choose__title">前台角色已阵亡</p>
            <p className="choose__hint">选择一名存活角色作为新的前台</p>
            <div className="choose__grid">
              {view.you.characters.map((c, index) =>
                c.alive ? (
                  <button
                    key={c.id}
                    type="button"
                    className="choose__card"
                    onClick={() => sock.chooseActiveInGame(index)}
                  >
                    <span className="choose__name">{c.name}</span>
                    <span className="choose__hp">
                      {c.hp}/{c.maxHp}
                    </span>
                  </button>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}

      {awaitingSharkMe && view.pendingShark && (
        <div className="choose">
          <div className="choose__panel">
            <p className="choose__title">鲨bee 放电</p>
            <p className="choose__hint">
              选择一名敌方前台：消耗 {view.pendingShark.charges} 点累积治疗，造成等量伤害，并治疗我方全体{' '}
              {Math.max(1, Math.floor(view.pendingShark.heal / 3))} 点
            </p>
            <div className="choose__grid">
              {view.others
                .filter((o) => !o.eliminated)
                .map((opponent) => {
                  const front = opponent.characters[opponent.activeIndex]
                  if (!front || !front.alive) return null
                  return (
                    <button
                      key={opponent.id}
                      type="button"
                      className="choose__card"
                      onClick={() => sock.chooseSharkTarget(opponent.id)}
                    >
                      <span className="choose__name">{front.name}</span>
                      <span className="choose__hp">
                        {opponent.name} · {front.hp}/{front.maxHp}
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {attackPick && opponents.length > 0 && (
        <div className="choose">
          <div className="choose__panel">
            <p className="choose__title">选择攻击目标</p>
            <p className="choose__hint">
              选中的角色在本次攻击中视为前台，其余角色视为后台
            </p>
            <div className="choose__grid">
              {opponents[0].characters.map((character) =>
                character.alive ? (
                  <button
                    key={character.id}
                    type="button"
                    className="choose__card"
                    onClick={() => {
                      lockFor(250)
                      sock.playCard(attackPick.id, opponents[0].id, character.id)
                      setAttackPick(null)
                    }}
                  >
                    <span className="choose__name">{character.name}</span>
                    <span className="choose__hp">
                      {character.hp}/{character.maxHp}
                    </span>
                  </button>
                ) : null,
              )}
            </div>
            <button
              type="button"
              className="choose__card"
              onClick={() => setAttackPick(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {view.stageMechanic && (
        <button
          type="button"
          className="mechanicbtn"
          aria-label="关卡机制"
          title="关卡机制"
          onClick={() => setMechanicOpen(true)}
        >
          ?
        </button>
      )}

      {mechanicOpen && view.stageMechanic && (
        <div className="choose" onClick={() => setMechanicOpen(false)}>
          <div className="choose__panel" onClick={(e) => e.stopPropagation()}>
            <p className="choose__title">关卡机制</p>
            <p className="choose__hint mechanic__text">{view.stageMechanic}</p>
            <button
              type="button"
              className="choose__card"
              onClick={() => setMechanicOpen(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {info && (
        <InfoPanel target={info} onClose={() => setInfo(null)} action={infoAction} />
      )}

      {sock.toast && (
        <div className="toast" role="status">
          {sock.toast}
        </div>
      )}

      {view.phase === 'finished' && (
        <div className="finish">
          <div className="finish__panel">
            <p className="finish__title">
              {view.winnerName ? `${view.winnerName} 获胜` : '对局结束'}
            </p>
            <button type="button" className="menu-btn" onClick={sock.leaveGame}>
              返回主界面
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
