import { STAGES } from '../../shared/stages'
import { STAGE_ART } from '../lib/stageArt'

type Props = {
  onBack: () => void
  onSelect: (stageId: string) => void
}

/** 单人模式关卡选择：卡片尺寸与图鉴角色牌一致，统一黑色边框 */
export default function StageSelect({ onBack, onSelect }: Props) {
  return (
    <div className="codex">
      <header className="codex__head">
        <button type="button" className="codex__back" aria-label="返回" onClick={onBack}>
          ←
        </button>
        <h2 className="codex__title">关卡选择</h2>
      </header>

      <div className="codex__body">
        <div className="codex__grid">
          {STAGES.map((stage) => {
            const art = stage.artId ? STAGE_ART[stage.artId] : undefined
            return (
              <button
                key={stage.id}
                type="button"
                className="codex__tile stagecard"
                onClick={() => onSelect(stage.id)}
              >
                {art ? (
                  <span
                    className="codex__art stagecard__art"
                    style={{ backgroundImage: `url("${art}")` }}
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="codex__art stagecard__art stagecard__art--blank"
                    aria-hidden="true"
                  />
                )}
                <span className="codex__name">{stage.name}</span>
                <span className="codex__meta">关卡</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
