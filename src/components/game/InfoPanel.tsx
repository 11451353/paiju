import { useState } from 'react'
import type { CardInfo, CharacterView, SkillInfo, SummonView } from '../../../shared/types'
import { EFFECTS, EFFECT_MAP } from '../../../shared/effects'
import { CardFace } from './CardFace'
import { EffectIcon } from './EffectIcon'
import { cardArtUrl } from '../../lib/cardArt'

/** 按名称长度从长到短匹配，避免短词抢先命中 */
const TERMS = [...EFFECTS].sort((a, b) => b.name.length - a.name.length)

type Part = { type: 'text' | 'term'; value: string; id?: string }

function splitDesc(
  text: string,
  extraTerms: { id: string; name: string }[] = [],
): Part[] {
  const parts: Part[] = []
  let rest = text
  const terms =
    extraTerms.length > 0
      ? [...TERMS, ...extraTerms].sort((a, b) => b.name.length - a.name.length)
      : TERMS

  while (rest.length > 0) {
    let hit: { index: number; id: string; name: string } | null = null
    for (const effect of terms) {
      const index = rest.indexOf(effect.name)
      if (index < 0) continue
      if (!hit || index < hit.index || (index === hit.index && effect.name.length > hit.name.length)) {
        hit = { index, id: effect.id, name: effect.name }
      }
    }
    if (!hit) {
      parts.push({ type: 'text', value: rest })
      break
    }
    if (hit.index > 0) parts.push({ type: 'text', value: rest.slice(0, hit.index) })
    parts.push({ type: 'term', value: hit.name, id: hit.id })
    rest = rest.slice(hit.index + hit.name.length)
  }

  return parts
}

/** 神厄形态：点击技能描述里的「神厄形态」后展开变身技能 */
function GodFormBox({ skills }: { skills: SkillInfo[] }) {
  return (
    <div className="info__termbox info__godbox">
      <span className="info__termname">神厄形态</span>
      <p className="info__desc">
        生命上限 +6 并回复 6 点，角色牌面变化。该形态没有大招，打出大招牌会释放战技。
      </p>
      <ul className="info__list">
        {skills.map((s) => (
          <li key={s.name}>
            <span className="info__skill">{s.name}</span>
            <span className="info__skillcost">{s.cost} 行动点</span>
            <SkillDesc text={s.description} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 技能描述：效果名带下划线，点击展开该效果的完整说明 */
function SkillDesc({ text, godSkills }: { text: string; godSkills?: SkillInfo[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const openEffect = openId && openId !== 'god-form' ? EFFECT_MAP[openId] : null

  // 有神厄形态数据时，把描述里的「神厄形态」也变成可点击词条
  const hasGodTerm = Boolean(godSkills?.length) && text.includes('神厄形态')
  const parts = splitDesc(
    text,
    hasGodTerm ? [{ id: 'god-form', name: '神厄形态' }] : [],
  )

  return (
    <>
      <p className="info__desc">
        {parts.map((part, i) =>
          part.type === 'term' ? (
            <button
              key={`${part.id}-${i}`}
              type="button"
              className="info__term"
              onClick={() => setOpenId(openId === part.id ? null : part.id ?? null)}
            >
              {part.value}
            </button>
          ) : (
            <span key={`t-${i}`}>{part.value}</span>
          ),
        )}
      </p>
      {openEffect && (
        <div className="info__termbox">
          <span className="info__termname">{openEffect.name}</span>
          <p className="info__desc">{openEffect.description}</p>
        </div>
      )}
      {openId === 'god-form' && godSkills && godSkills.length > 0 && (
        <GodFormBox skills={godSkills} />
      )}
    </>
  )
}

export type InfoTarget =
  | {
      kind: 'card'
      card: CardInfo
      /** 取当前前台角色对应技能的数值 */
      cost: number
      damage: number
      description: string
    }
  | { kind: 'character'; character: CharacterView; ownerName: string; ownerId: string }
  | { kind: 'summon'; summon: SummonView }

export type PanelAction = {
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}

type Props = {
  target: InfoTarget
  onClose: () => void
  action?: PanelAction
}

export function InfoPanel({ target, onClose, action }: Props) {
  return (
    <div className="info" onClick={onClose}>
      <div className="info__panel" onClick={(e) => e.stopPropagation()}>
        {target.kind === 'card' ? (
          <>
            <div className="info__preview">
              <CardFace
                cost={target.cost}
                artUrl={cardArtUrl(target.card.artId)}
                fallback={<span className="info__previewname">{target.card.name}</span>}
              />
            </div>
            <div className="info__head">
              <span className="info__title">{target.card.name}</span>
              <span className="info__cost">消耗 {target.cost}</span>
            </div>
            {target.damage > 0 && <p className="info__owner">伤害 {target.damage}</p>}
            <p className="info__desc">{target.description}</p>
          </>
        ) : target.kind === 'summon' ? (
          <>
            <div className="info__head">
              <span className="info__title">{target.summon.name}</span>
              <span className="info__cost">
                {target.summon.hp !== undefined
                  ? `特殊生命 ${target.summon.hp}`
                  : target.summon.charges !== undefined
                    ? `累积治疗 ${target.summon.charges}`
                    : target.summon.uses !== undefined
                      ? `可用 ${target.summon.uses} 次`
                      : `嘲讽值 ${target.summon.taunt}`}
              </span>
            </div>
            <p className="info__owner">召唤物</p>
            <p className="info__desc">{target.summon.description}</p>
          </>
        ) : (
          <>
            <div className="info__head">
              <span className="info__title">{target.character.name}</span>
              <span className="info__cost">
                {target.character.hp}/{target.character.maxHp}
              </span>
            </div>
            {target.ownerName && <p className="info__owner">持有者：{target.ownerName}</p>}

            <section className="info__section">
              <h3 className="info__label">技能</h3>
              {target.character.skills.length === 0 ? (
                <p className="info__empty">暂无技能</p>
              ) : (
                <ul className="info__list">
                  {target.character.skills.map((s) => (
                    <li key={s.name}>
                      <span className="info__skill">{s.name}</span>
                      <span className="info__skillcost">{s.cost} 行动点</span>
                      <SkillDesc text={s.description} godSkills={target.character.godSkills} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="info__section">
              <h3 className="info__label">天赋</h3>
              {target.character.talents.length === 0 ? (
                <p className="info__empty">暂无天赋</p>
              ) : (
                <ul className="info__list">
                  {target.character.talents.map((s) => (
                    <li key={s.name}>
                      <span className="info__skill">{s.name}</span>
                      {s.cost > 0 && <span className="info__skillcost">{s.cost} 行动点</span>}
                      <SkillDesc text={s.description} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="info__section">
              <h3 className="info__label">状态效果</h3>
              {target.character.effects.length === 0 ? (
                <p className="info__empty">暂无状态效果</p>
              ) : (
                <ul className="info__fxlist">
                  {target.character.effects.map((effect) => (
                    <li key={effect.uid} className="info__fxitem">
                      <EffectIcon
                        icon={effect.icon}
                        polarity={effect.polarity}
                        name={effect.name}
                        size={16}
                      />
                      <div className="info__fxbody">
                        <span className="info__skill">{effect.name}</span>
                        {effect.stacks > 1 && (
                          <span className="info__skillcost">× {effect.stacks} 层</span>
                        )}
                        <p className="info__desc">{effect.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {action && (
          <button
            type="button"
            className="info__action"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            <span>{action.label}</span>
            {action.hint && <span className="info__actionhint">{action.hint}</span>}
          </button>
        )}

        <button type="button" className="info__close" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
