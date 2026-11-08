import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CardInfo, CharacterView, SummonView } from '../../../shared/types'
import { NetherStar } from './Star'
import { CardFace } from './CardFace'
import { EffectIcon } from './EffectIcon'
import { CHARACTER_ART, SUMMON_ART } from '../../lib/characterArt'
import { cardArtUrl } from '../../lib/cardArt'

export { NetherStar }

export function ActionPoints({ ap, align }: { ap: number; align?: 'left' | 'right' }) {
  return (
    <div className={`ap${align ? ` ap--${align}` : ''}`} aria-label={`行动点 ${ap}`}>
      {ap > 0 ? (
        Array.from({ length: ap }, (_, i) => <NetherStar key={i} />)
      ) : (
        <span className="ap__zero">0</span>
      )}
    </div>
  )
}

export function CardBack({ compact }: { compact?: boolean }) {
  return <div className={`cardback${compact ? ' cardback--compact' : ''}`} aria-label="对手手牌" />
}

type HandCardProps = {
  card: CardInfo
  /** 实际消耗，取自当前前台角色的对应技能 */
  cost: number
  /** 实际伤害，取自当前前台角色的对应技能 */
  damage: number
  /** 被机制减免的消耗点数 */
  discount?: number
  /** 额外增加的花费（元旦晚会） */
  extra?: number
  /** 手牌过多时向左叠压的像素数 */
  overlap?: number
  dragging?: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, cardId: string) => void
}

export function HandCard({
  card,
  cost,
  damage,
  discount = 0,
  extra = 0,
  overlap = 0,
  dragging,
  onPointerDown,
}: HandCardProps) {
  return (
    <div
      className={`handcard${dragging ? ' handcard--dragging' : ''}`}
      style={overlap > 0 ? { marginLeft: -overlap } : undefined}
      onPointerDown={(e) => onPointerDown(e, card.id)}
      role="button"
      tabIndex={0}
    >
      <CardFace
        cost={cost}
        discount={discount}
        extra={extra}
        artUrl={cardArtUrl(card.artId)}
        fallback={
          <>
            <span className="handcard__name">{card.name}</span>
            {damage > 0 && <span className="handcard__damage">{damage}</span>}
          </>
        }
      />
    </div>
  )
}

/** 对局中的玩家头像 + 名字标牌 */
export function PlayerBadge({
  name,
  avatar,
  className,
  me,
  acting,
}: {
  name: string
  avatar: string | null
  className?: string
  me?: boolean
  acting?: boolean
}) {
  return (
    <div
      className={`badge${me ? ' badge--me' : ''}${acting ? ' badge--acting' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="badge__avatar" aria-hidden="true">
        {avatar || '🙂'}
      </span>
      <span className="badge__name">{name}</span>
    </div>
  )
}

/** 召唤物图标：小方形，右下角显示嘲讽值 */
export function SummonIcon({ summon, onClick }: { summon: SummonView; onClick?: () => void }) {
  const art = summon.artId ? SUMMON_ART[summon.artId] : undefined
  const counter = summon.hp ?? summon.charges ?? summon.uses ?? summon.taunt

  return (
    <button
      type="button"
      className="summon"
      onClick={onClick}
      aria-label={
        summon.hp !== undefined
          ? `${summon.name}，特殊生命 ${summon.hp}`
          : summon.charges !== undefined
            ? `${summon.name}，累积治疗 ${summon.charges}`
            : summon.uses !== undefined
              ? `${summon.name}，可用 ${summon.uses} 次`
              : `${summon.name}，嘲讽值 ${summon.taunt}`
      }
    >
      {art ? (
        <span
          className="summon__art"
          style={{ backgroundImage: `url("${art}")` }}
          aria-hidden="true"
        />
      ) : (
        <span className="summon__art summon__art--empty" aria-hidden="true" />
      )}
      {counter > 0 && <span className="summon__taunt">{counter}</span>}
    </button>
  )
}

/** 垃圾桶图标：行动时用于弃牌 */
export function TrashIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 7h16" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

type CharacterCardProps = {
  character: CharacterView
  active: boolean
  compact?: boolean
  targetable?: boolean
  /** 己方目标牌已打出，该角色可作为目标 */
  checkable?: boolean
  /** 刚受到的伤害，用来播放受击动画 */
  hurt?: { id: number; amount: number } | null
  /** 刚获得的治疗 / 护盾，用来飘绿字 / 黄字 */
  pops?: {
    heal?: { id: number; amount: number }
    shield?: { id: number; amount: number }
  } | null
  onClick: () => void
  onCheck?: () => void
}

export function CharacterCard({
  character,
  active,
  compact,
  targetable,
  checkable,
  hurt,
  pops,
  onClick,
  onCheck,
}: CharacterCardProps) {
  const art = character.artId ? CHARACTER_ART[character.artId] : undefined

  return (
    <div className="charcard-wrap">
      <button
        type="button"
        className={[
          'charcard',
          active ? 'charcard--active' : '',
          character.alive ? '' : 'charcard--dead',
          compact ? 'charcard--compact' : '',
          art ? 'charcard--art' : '',
          targetable && character.alive ? 'charcard--target' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={onClick}
      >
        {art && (
          <span
            className="charcard__art"
            style={{ backgroundImage: `url("${art}")` }}
            aria-hidden="true"
          />
        )}
        {active && <span className="charcard__flag">前台</span>}
        <span className="charcard__hp">
          {character.hp}/{character.maxHp}
        </span>
        {character.shield > 0 && (
          <span className="charcard__shield" aria-label={`护盾 ${character.shield}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2 L21 5 V12 C21 17.2 17 20.8 12 22 C7 20.8 3 17.2 3 12 V5 Z" />
            </svg>
            <span>{character.shield}</span>
          </span>
        )}
        <span className="charcard__name">{character.name}</span>

        {/* 受击：角色牌闪红 + 飘出伤害数字，key 变化时重启动画 */}
        {hurt && (
          <span key={hurt.id} className="charcard__hurt" aria-hidden="true">
            <span className="charcard__damage">-{hurt.amount}</span>
          </span>
        )}

        {/* 治疗 / 护盾：绿色与黄色飘字 */}
        {pops?.heal && (
          <span
            key={`heal-${pops.heal.id}`}
            className="charcard__pop charcard__pop--heal"
            aria-hidden="true"
          >
            +{pops.heal.amount}
          </span>
        )}
        {pops?.shield && (
          <span
            key={`shield-${pops.shield.id}`}
            className="charcard__pop charcard__pop--shield"
            aria-hidden="true"
          >
            +{pops.shield.amount}
          </span>
        )}
      </button>

      {/* 己方目标：牌面出现绿色对钩，点击对钩选中该角色 */}
      {checkable && (
        <button
          type="button"
          className="charcard__check"
          aria-label={`选择${character.name}作为目标`}
          onClick={(e) => {
            e.stopPropagation()
            onCheck?.()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 12.8 L9.4 18.2 L20 6.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* 状态效果：在角色牌右侧排成一列 */}
      {character.effects.length > 0 && (
        <div className="charfx">
          {character.effects.map((effect) => (
            <EffectIcon
              key={effect.uid}
              icon={effect.icon}
              polarity={effect.polarity}
              name={effect.name}
              stacks={effect.stacks}
            />
          ))}
        </div>
      )}
    </div>
  )
}
