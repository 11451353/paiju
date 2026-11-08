import { useState } from 'react'
import { cardCatalog, characterCatalog } from '../../launcher/game'
import type { CardInfo } from '../../shared/types'
import { CardFace } from '../components/game/CardFace'
import { InfoPanel, type InfoTarget } from '../components/game/InfoPanel'
import { CHARACTER_ART } from '../lib/characterArt'
import { cardArtUrl } from '../lib/cardArt'

const CHARACTERS = characterCatalog()
const CARDS = cardCatalog()

const KIND_LABEL: Record<string, string> = {
  field: '场地',
  item: '道具',
  event: '事件',
  accessory: '配饰',
}

type Tab = 'characters' | 'cards'

type Props = {
  onBack: () => void
}

/** 卡牌图鉴：主界面进入，分角色牌与手牌两类 */
export default function Codex({ onBack }: Props) {
  const [tab, setTab] = useState<Tab | null>(null)
  const [info, setInfo] = useState<InfoTarget | null>(null)

  const title =
    tab === 'characters' ? '角色牌图鉴' : tab === 'cards' ? '手牌图鉴' : '卡牌图鉴'

  function openCard(card: CardInfo) {
    setInfo({ kind: 'card', card, cost: card.cost, damage: 0, description: card.description })
  }

  return (
    <div className="codex">
      <header className="codex__head">
        <button
          type="button"
          className="codex__back"
          aria-label="返回"
          onClick={() => (tab ? setTab(null) : onBack())}
        >
          ←
        </button>
        <h2 className="codex__title">{title}</h2>
      </header>

      {!tab ? (
        <div className="codex__choices">
          <button type="button" className="codex__choice" onClick={() => setTab('characters')}>
            角色牌图鉴
            <span>{CHARACTERS.length} 名</span>
          </button>
          <button type="button" className="codex__choice" onClick={() => setTab('cards')}>
            手牌图鉴
            <span>{CARDS.length} 种</span>
          </button>
        </div>
      ) : (
        <div className="codex__body">
          {tab === 'characters' ? (
            <div className="codex__grid">
              {CHARACTERS.map((character) => {
                const art = character.artId ? CHARACTER_ART[character.artId] : undefined
                return (
                  <button
                    key={character.id}
                    type="button"
                    className="codex__tile"
                    onClick={() =>
                      setInfo({
                        kind: 'character',
                        character,
                        ownerName: '',
                        ownerId: 'codex',
                      })
                    }
                  >
                    {art ? (
                      <span
                        className="codex__art"
                        style={{ backgroundImage: `url("${art}")` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="codex__art codex__art--empty" aria-hidden="true" />
                    )}
                    <span className="codex__name">{character.name}</span>
                    <span className="codex__meta">生命 {character.maxHp}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="codex__grid codex__grid--cards">
              {CARDS.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="codex__cardtile"
                  onClick={() => openCard(card)}
                >
                  <span className="codex__cardwrap">
                    <CardFace
                      cost={card.cost}
                      artUrl={cardArtUrl(card.artId)}
                      fallback={<span className="codex__cardname">{card.name}</span>}
                    />
                  </span>
                  <span className="codex__cardsub">
                    {KIND_LABEL[card.kind] ?? '手牌'} · {card.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {info && <InfoPanel target={info} onClose={() => setInfo(null)} />}
    </div>
  )
}
