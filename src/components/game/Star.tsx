type Props = {
  size?: number
  /** solid 实心（需要支付的行动点）；hollow 空心描边（被减免掉的行动点） */
  variant?: 'solid' | 'hollow'
  className?: string
}

/** 下界之星形状的四芒星，代表 1 点行动点 */
export function NetherStar({ size = 14, variant = 'solid', className }: Props) {
  const hollow = variant === 'hollow'

  return (
    <svg
      className={className ? `star ${className}` : 'star'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 1 C12.9 7.4 16.6 11.1 23 12 C16.6 12.9 12.9 16.6 12 23 C11.1 16.6 7.4 12.9 1 12 C7.4 11.1 11.1 7.4 12 1 Z"
        fill={hollow ? '#ffffff' : '#111111'}
        stroke={hollow ? '#111111' : 'none'}
        strokeWidth={hollow ? 2.2 : 0}
        strokeLinejoin="round"
      />
    </svg>
  )
}
