import type { ReactNode } from 'react'
import { NetherStar } from './pieces'

/**
 * 牌面多边形，坐标按卡片宽高的百分比（0-100）。
 * 已按手绘稿做了规整：主区左/上/下边水平垂直，右上角一刀 45° 斜切；
 * 费用框底边与这条斜切平行（坡度 0.615），保证两线之间的白边宽度一致。
 */
export const CARD_FRAME_MAIN = '6,7 66,7 66,34 92,50 92,94 6,94'
export const CARD_FRAME_COST = '74,6 96,6 96,45 74,31.5'

type Props = {
  /** 卡牌原始消耗 */
  cost: number
  /** 被机制减免掉的点数，这部分显示为空心星 */
  discount?: number
  /** 额外增加的花费（元旦晚会），显示为实心星 */
  extra?: number
  /** 插画地址，没有时显示 fallback */
  artUrl?: string
  /** 无插画时的占位内容 */
  fallback?: ReactNode
  className?: string
}

export function CardFace({
  cost,
  discount = 0,
  extra = 0,
  artUrl,
  fallback,
  className,
}: Props) {
  const reduced = Math.max(0, Math.min(cost, Math.round(discount)))
  const extraCost = Math.max(0, Math.round(extra))
  const payable = Math.max(0, cost - reduced) + extraCost
  const stars: { key: string; variant: 'solid' | 'hollow' }[] = []

  if (cost === 0 && extraCost === 0) {
    // 不消耗行动点的牌固定显示一颗空心星
    stars.push({ key: 'free', variant: 'hollow' })
  } else {
    for (let i = 0; i < payable; i += 1) stars.push({ key: `s${i}`, variant: 'solid' })
    for (let i = 0; i < reduced; i += 1) stars.push({ key: `h${i}`, variant: 'hollow' })
  }

  return (
    <div className={`cardface${className ? ` ${className}` : ''}`}>
      {/* 插画层：被中间多边形裁切，不会溢出到白边和右上角框 */}
      <div
        className="cardface__art"
        style={artUrl ? { backgroundImage: `url("${artUrl}")` } : undefined}
      >
        {fallback && (
          <div className={artUrl ? 'cardface__label' : 'cardface__fallback'}>{fallback}</div>
        )}
      </div>

      {/* 描边与右上角白底框，压在插画之上 */}
      <svg
        className="cardface__frame"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <polygon
          points={CARD_FRAME_MAIN}
          fill="none"
          stroke="#111"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="miter"
        />
        <polygon
          points={CARD_FRAME_COST}
          fill="#fff"
          stroke="#111"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="miter"
        />
      </svg>

      {/* 行动点星标：实体星为实际要付的点数，空心星为被减免的点数 */}
      <div className="cardface__stars">
        {stars.map((s) => (
          <NetherStar key={s.key} variant={s.variant} className="cardface__star" />
        ))}
      </div>
    </div>
  )
}
