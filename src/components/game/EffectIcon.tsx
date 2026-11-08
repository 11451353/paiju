import type { EffectIconKind, EffectPolarity } from '../../../shared/effects'

const POLARITY_CLASS: Record<EffectPolarity, string> = {
  buff: 'fx--buff',
  debuff: 'fx--debuff',
  neutral: 'fx--neutral',
}

function Glyph({ kind }: { kind: EffectIconKind }) {
  if (kind === 'up') return <path d="M12 5 L19.5 16 H4.5 Z" />
  if (kind === 'down') return <path d="M12 19 L4.5 8 H19.5 Z" />
  if (kind === 'flame') {
    return <path d="M12 2.5 C14.8 6.6 18.4 9.2 18.4 14 A6.4 6.4 0 0 1 5.6 14 C5.6 10.4 8.8 8.2 12 2.5 Z" />
  }
  if (kind === 'drop') {
    return <path d="M12 2.5 C12 2.5 5.6 10 5.6 14.5 A6.4 6.4 0 0 0 18.4 14.5 C18.4 10 12 2.5 12 2.5 Z" />
  }
  if (kind === 'bolt') {
    return <path d="M13.8 1.5 L5.5 13.4 H10.8 L9.6 22.5 L18.2 10.2 H12.8 Z" />
  }
  if (kind === 'mask') {
    return (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.5 6 H21.5 V11 A9.5 9.5 0 0 1 2.5 11 Z M8.6 9.8 a1.8 1.8 0 1 0 0.01 0 Z M15.4 9.8 a1.8 1.8 0 1 0 0.01 0 Z"
      />
    )
  }
  if (kind === 'trident') {
    return (
      <path d="M11 3 h2 v18 h-2 z M4.5 3 h2 v6 h-2 z M17.5 3 h2 v6 h-2 z M4.5 9 h15 v2 h-15 z" />
    )
  }
  return <circle cx="12" cy="12" r="4.8" />
}

type Props = {
  icon: EffectIconKind
  polarity: EffectPolarity
  name: string
  /** 层数，大于 1 时在右下角显示数字 */
  stacks?: number
  /** 层数的量词，默认「层」 */
  unit?: string
  size?: number
}

/** 状态效果图标。颜色区分正面 / 负面 / 中性，形状区分具体效果 */
export function EffectIcon({ icon, polarity, name, stacks, unit = '层', size = 14 }: Props) {
  const label = stacks && stacks > 1 ? `${name} ${stacks} ${unit}` : name

  return (
    <span
      className={`fx ${POLARITY_CLASS[polarity]}`}
      style={{ width: size, height: size }}
      title={label}
      aria-label={label}
      role="img"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <Glyph kind={icon} />
      </svg>
      {stacks !== undefined && stacks > 1 && <span className="fx__stacks">{stacks}</span>}
    </span>
  )
}
