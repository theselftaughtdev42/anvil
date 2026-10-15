import type { ComponentProps } from 'react'

// The main mark from docs/design/logo.svg: an anvil with three sparks, hottest
// first. Keep the sparks as separate paths so they can be animated later.
export function AnvilMark(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 -2 100 74" aria-hidden="true" {...props}>
      <path
        data-part="anvil"
        d="M4 34 C16 34 24 32 28 30 H94 V44 H78 Q68 46 66 58 H76 V70 H28 V58 H38 Q36 46 28 44 Q14 42 4 34 Z"
        fill="#EDE6DA"
      />
      <path
        data-part="spark-1"
        d="M0 -8 L4 0 L0 8 L-4 0 Z"
        fill="#E8642C"
        transform="translate(58 12) scale(1.15)"
      />
      <path
        data-part="spark-2"
        d="M0 -8 L4 0 L0 8 L-4 0 Z"
        fill="#E8642C"
        opacity="0.55"
        transform="translate(48 6) scale(0.6)"
      />
      <path
        data-part="spark-3"
        d="M0 -8 L4 0 L0 8 L-4 0 Z"
        fill="#E8642C"
        opacity="0.3"
        transform="translate(69 3) scale(0.45)"
      />
    </svg>
  )
}
